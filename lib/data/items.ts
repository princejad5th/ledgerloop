/**
 * Item repository. Single point where pages and server actions read items.
 *
 * If DATABASE_URL is configured AND the user has rows, we hit Postgres.
 * Otherwise we fall back to DEMO_ITEMS so the prototype renders cleanly on
 * first boot. This lets you `pnpm dev` immediately after `pnpm install`
 * without Supabase set up — useful for screenshots and for the AI coding
 * agent to validate UI changes.
 *
 * Every shape here mirrors what the tax engine and calc helpers expect.
 */

import 'server-only';
import { DEMO_ITEMS, DEMO_EXPENSES, DEMO_PROFILE } from './demo-items';

/** Row shape — pure data, strings for money to mirror Drizzle's numeric type. */
export interface ItemRow {
  id: string;
  userId: string;
  sku: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  condition: string | null;
  sourcePlatform: string | null;
  purchaseDate: Date | null;
  costPrice: string;
  shippingInCost: string | null;
  otherCosts: string | null;
  listedPrice: string | null;
  listedAt: Date | null;
  listedPlatform: 'EBAY' | 'DEPOP' | 'VINTED' | 'OTHER' | null;
  externalListingId: string | null;
  status: 'DRAFT' | 'IN_STOCK' | 'LISTED' | 'SOLD' | 'RETURNED' | 'DELISTED';
  soldAt: Date | null;
  soldPrice: string | null;
  soldPlatform: 'EBAY' | 'DEPOP' | 'VINTED' | 'OTHER' | null;
  buyerCountry: string | null;
  platformFees: string | null;
  paymentFees: string | null;
  shippingOutCost: string | null;
  shippingCharged: string | null;
  refundAmount: string | null;
  feeEstimated: boolean;
  notes: string | null;
}

export interface ExpenseRow {
  id: string;
  userId: string;
  date: Date;
  category: 'MILEAGE' | 'PACKAGING' | 'SUBSCRIPTION' | 'OFFICE' | 'OTHER';
  description: string;
  amount: string;
  taxDeductible: boolean;
  receiptUrl: string | null;
}

export interface ProfileRow {
  id: string;
  email: string;
  name: string | null;
  jurisdiction: 'EW_NI' | 'SCOTLAND';
  studentLoanPlan: 'NONE' | 'PLAN_1' | 'PLAN_2' | 'PLAN_4' | 'PLAN_5' | 'POSTGRAD';
  payeIncomeAnnual: string | null;
}

/** True when the app is in "no DB configured" mode and should render demo data. */
function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

export async function listItems(userId: string): Promise<ItemRow[]> {
  if (isDemoMode()) return DEMO_ITEMS;
  // Lazy import so we don't crash the demo path on missing DATABASE_URL.
  const { db } = await import('@/lib/db/client');
  const { items } = await import('@/lib/db/schema');
  const { eq, isNull, and, desc } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), isNull(items.deletedAt)))
    .orderBy(desc(items.createdAt));
  return rows.map(serializeItem);
}

export async function listExpenses(userId: string): Promise<ExpenseRow[]> {
  if (isDemoMode()) return DEMO_EXPENSES.filter((e) => e.userId === userId).map(serializeExpense);
  const { db } = await import('@/lib/db/client');
  const { expenses } = await import('@/lib/db/schema');
  const { eq, isNull, and, desc } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, userId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.date));
  return rows.map(serializeExpense);
}

export async function getProfile(userId: string): Promise<ProfileRow> {
  if (isDemoMode()) return { ...DEMO_PROFILE };
  const { db } = await import('@/lib/db/client');
  const { profiles } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!row) {
    // Fall back to a minimal default; the first signed-in load triggers profile creation elsewhere.
    return {
      id: userId,
      email: '',
      name: null,
      jurisdiction: 'EW_NI',
      studentLoanPlan: 'NONE',
      payeIncomeAnnual: null,
    };
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    jurisdiction: row.jurisdiction as ProfileRow['jurisdiction'],
    studentLoanPlan: row.studentLoanPlan as ProfileRow['studentLoanPlan'],
    payeIncomeAnnual: row.payeIncomeAnnual,
  };
}

/** Map a Drizzle row to ItemRow (just a type-narrowing pass-through today). */
function serializeItem(r: any): ItemRow {
  return r as ItemRow;
}

function serializeExpense(r: any): ExpenseRow {
  return {
    id: r.id,
    userId: r.userId,
    date: r.date,
    category: r.category,
    description: r.description,
    amount: typeof r.amount === 'string' ? r.amount : String(r.amount),
    taxDeductible: r.taxDeductible,
    receiptUrl: r.receiptUrl ?? null,
  };
}

/** True when the rendered data is the demo fixture, so the UI can show a banner. */
export function inDemoMode(): boolean {
  return isDemoMode();
}
