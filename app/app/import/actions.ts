'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * Server action: persist a CSV-parsed batch of items + transactions.
 *
 * The dropzone serialises Decimal/Date values into strings before invoking
 * this; we validate with zod, then upsert by (userId, listedPlatform=EBAY,
 * externalListingId). Idempotent — re-uploading the same CSV updates rows
 * rather than duplicating.
 *
 * In demo mode (no DATABASE_URL), the action becomes a no-op that returns
 * "success" so the prototype flow still works visually.
 */

const txSchema = z.object({
  rowNumber: z.number(),
  externalOrderId: z.string().nullable(),
  externalTransactionId: z.string().nullable(),
  occurredAt: z.string(),
  kind: z.enum(['SALE', 'REFUND', 'FEE', 'SHIPPING_LABEL', 'OTHER']),
  amount: z.string(),
  description: z.string(),
  raw: z.record(z.string()),
});

const itemSchema = z.object({
  externalListingId: z.string(),
  title: z.string(),
  soldAt: z.string().nullable(),
  soldPrice: z.string(),
  shippingCharged: z.string(),
  platformFees: z.string(),
  paymentFees: z.string(),
  shippingOutCost: z.string(),
  refundAmount: z.string(),
  buyerCountry: z.string().nullable(),
  rawTransactions: z.array(txSchema),
});

const inputSchema = z.object({
  items: z.array(itemSchema),
});

export type CommitInput = z.input<typeof inputSchema>;

export interface CommitResult {
  success: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  transactionsCreated: number;
  error?: string;
}

export async function commitImportAction(input: CommitInput): Promise<CommitResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      transactionsCreated: 0,
      error: 'Invalid payload: ' + parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  const user = await getCurrentUser();
  if (!user && process.env.DATABASE_URL) {
    return {
      success: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      transactionsCreated: 0,
      error: 'Not signed in.',
    };
  }
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

  // Demo mode: pretend the import succeeded so the UI flow is demonstrable.
  if (!process.env.DATABASE_URL) {
    return {
      success: true,
      itemsCreated: parsed.data.items.length,
      itemsUpdated: 0,
      transactionsCreated: parsed.data.items.reduce((n, i) => n + i.rawTransactions.length, 0),
    };
  }

  // Production path: persist via Drizzle.
  const { db } = await import('@/lib/db/client');
  const { items: itemsTable, transactions: txTable, importJobs } = await import('@/lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // 1. Create the import job record.
  const [job] = await db
    .insert(importJobs)
    .values({
      userId,
      platform: 'EBAY',
      source: 'CSV',
      status: 'RUNNING',
      rowsTotal: parsed.data.items.reduce((n, i) => n + i.rawTransactions.length, 0),
      startedAt: new Date(),
    })
    .returning({ id: importJobs.id });

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let transactionsCreated = 0;

  // 2. Upsert items.
  for (const item of parsed.data.items) {
    const existing = await db
      .select({ id: itemsTable.id })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.userId, userId),
          eq(itemsTable.listedPlatform, 'EBAY'),
          eq(itemsTable.externalListingId, item.externalListingId),
        ),
      )
      .limit(1);

    const fields = {
      userId,
      title: item.title,
      status: (item.soldAt ? 'SOLD' : 'LISTED') as 'SOLD' | 'LISTED',
      soldAt: item.soldAt ? new Date(item.soldAt) : null,
      soldPrice: item.soldPrice,
      soldPlatform: 'EBAY' as const,
      listedPlatform: 'EBAY' as const,
      externalListingId: item.externalListingId,
      buyerCountry: item.buyerCountry,
      shippingCharged: item.shippingCharged,
      platformFees: item.platformFees,
      paymentFees: item.paymentFees,
      shippingOutCost: item.shippingOutCost,
      refundAmount: item.refundAmount,
      // We don't get cost from eBay's TR; user fills it in via inventory edit.
      // Default to 0 so the row is valid.
      costPrice: '0.00',
      updatedAt: new Date(),
    };

    let itemId: string;
    if (existing.length > 0) {
      itemId = existing[0].id;
      await db.update(itemsTable).set(fields).where(eq(itemsTable.id, itemId));
      itemsUpdated += 1;
    } else {
      const [created] = await db
        .insert(itemsTable)
        .values(fields)
        .returning({ id: itemsTable.id });
      itemId = created.id;
      itemsCreated += 1;
    }

    // 3. Insert transactions, dedupe on externalTransactionId.
    for (const tx of item.rawTransactions) {
      try {
        await db.insert(txTable).values({
          userId,
          itemId,
          platform: 'EBAY',
          kind: tx.kind,
          source: 'CSV',
          externalOrderId: tx.externalOrderId,
          externalTransactionId: tx.externalTransactionId,
          occurredAt: new Date(tx.occurredAt),
          amount: tx.amount,
          currency: 'GBP',
          description: tx.description,
          raw: tx.raw,
          importJobId: job.id,
        });
        transactionsCreated += 1;
      } catch (err) {
        // Unique-index conflict on (userId, platform, externalTransactionId) — ignore.
        if (!String(err).includes('transactions_dedupe')) throw err;
      }
    }
  }

  await db
    .update(importJobs)
    .set({
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      itemsCreated,
      itemsUpdated,
      transactionsCreated,
    })
    .where(eq(importJobs.id, job.id));

  revalidatePath('/app');
  revalidatePath('/app/inventory');
  revalidatePath('/app/tax');

  return {
    success: true,
    itemsCreated,
    itemsUpdated,
    transactionsCreated,
  };
}
