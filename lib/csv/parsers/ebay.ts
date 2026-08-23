/**
 * eBay Seller Hub Transaction Report parser.
 *
 * Each row is one financial event: a sale (Order), an eBay fee, a refund, or a
 * shipping label. We group by Order Number and aggregate against the matching
 * sale to produce a single per-item record.
 *
 * Column synonyms reflect the variations between Seller Hub's "default" and
 * "customised" exports. The columns customisable by the user are: Transaction
 * details, Payout details, Shipping details, Item details, Buyer details.
 *
 * Sources verified May 2026:
 *  - https://www.ebay.com/help/selling/selling-tools/seller-hub-reports
 *  - https://www.ebay.com/help/selling/fees-credits-invoices/reconciling-ebay-sales-transactions
 */

import Decimal from 'decimal.js';
import type { ParsedItem, ParsedTransaction, ParseResult, UnmatchedRow } from '../types';
import { pickHeader, parseDecimal, parseFlexibleDate } from '../shared';

const H = {
  date:           ['Transaction creation date', 'Date', 'Transaction date'],
  type:           ['Type', 'Transaction type'],
  orderNumber:    ['Order number', 'Order Number'],
  transactionId:  ['Transaction ID', 'Transaction Id'],
  itemTitle:      ['Item title', 'Item Title', 'Title'],
  amount:         ['Net amount', 'Net Amount', 'Gross amount', 'Amount', 'Total'],
  fee:            ['eBay collected tax', 'Fee', 'eBay fee'],
  currency:       ['Currency'],
  buyerCountry:   ['Buyer country', 'Buyer Country', 'Ship to country'],
};

/** Headers that strongly imply an eBay Transaction Report. */
export const EBAY_SIGNATURE_HEADERS = [
  'Transaction creation date',
  'Order number',
  'Net amount',
];

function classify(rawType: string | null): ParsedTransaction['kind'] {
  if (!rawType) return 'OTHER';
  const t = rawType.toLowerCase();
  if (t === 'order' || t.includes('sale')) return 'SALE';
  if (t.includes('refund')) return 'REFUND';
  if (t.includes('shipping label')) return 'SHIPPING_LABEL';
  if (t.includes('fee') || t.includes('charge')) return 'FEE';
  return 'OTHER';
}

function parseRow(
  row: Record<string, string>,
  rowNumber: number,
): { ok: true; tx: ParsedTransaction } | { ok: false; reason: string } {
  const date = parseFlexibleDate(pickHeader(row, H.date));
  if (!date) return { ok: false, reason: 'Missing or unparseable date' };

  const amount = parseDecimal(pickHeader(row, H.amount));
  if (amount == null) return { ok: false, reason: 'Missing or unparseable amount' };

  const currency = pickHeader(row, H.currency) ?? 'GBP';
  if (currency.toUpperCase() !== 'GBP') {
    return { ok: false, reason: `Non-GBP currency (${currency}) not supported in MVP` };
  }

  return {
    ok: true,
    tx: {
      rowNumber,
      platform: 'EBAY',
      externalOrderId: pickHeader(row, H.orderNumber),
      externalTransactionId: pickHeader(row, H.transactionId),
      occurredAt: date,
      kind: classify(pickHeader(row, H.type)),
      amount,
      description: pickHeader(row, H.itemTitle) ?? '',
      raw: row,
    },
  };
}

function groupIntoItems(txs: ParsedTransaction[]): { items: ParsedItem[]; unmatched: UnmatchedRow[] } {
  const byOrder = new Map<string, ParsedTransaction[]>();
  const unmatched: UnmatchedRow[] = [];

  for (const tx of txs) {
    if (!tx.externalOrderId) {
      unmatched.push({ rowNumber: tx.rowNumber, reason: 'Transaction has no Order Number — cannot attach to an item', raw: tx.raw });
      continue;
    }
    const existing = byOrder.get(tx.externalOrderId) ?? [];
    existing.push(tx);
    byOrder.set(tx.externalOrderId, existing);
  }

  const items: ParsedItem[] = [];
  for (const [orderId, group] of byOrder) {
    const sale = group.find((t) => t.kind === 'SALE');
    if (!sale) {
      for (const tx of group) {
        unmatched.push({ rowNumber: tx.rowNumber, reason: `Order ${orderId} has no SALE row in this file`, raw: tx.raw });
      }
      continue;
    }
    let platformFees = new Decimal(0);
    let shippingOutCost = new Decimal(0);
    let refundAmount = new Decimal(0);
    for (const tx of group) {
      if (tx.kind === 'FEE') platformFees = platformFees.plus(tx.amount.abs());
      else if (tx.kind === 'REFUND') refundAmount = refundAmount.plus(tx.amount.abs());
      else if (tx.kind === 'SHIPPING_LABEL') shippingOutCost = shippingOutCost.plus(tx.amount.abs());
    }
    items.push({
      platform: 'EBAY',
      externalListingId: orderId,
      title: sale.description || `Order ${orderId}`,
      soldAt: sale.occurredAt,
      soldPrice: sale.amount,
      shippingCharged: new Decimal(0),
      platformFees,
      paymentFees: new Decimal(0),
      shippingOutCost,
      refundAmount,
      buyerCountry: pickHeader(sale.raw, H.buyerCountry),
      rawTransactions: group,
    });
  }
  return { items, unmatched };
}

/** Parser entrypoint for eBay Transaction Reports. */
export function parseEbay(rows: Record<string, string>[]): ParseResult {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const txs: ParsedTransaction[] = [];
  const unmatched: UnmatchedRow[] = [];

  rows.forEach((row, idx) => {
    const result = parseRow(row, idx + 1);
    if (result.ok) txs.push(result.tx);
    else unmatched.push({ rowNumber: idx + 1, reason: result.reason, raw: row });
  });

  const { items, unmatched: unmatchedFromGrouping } = groupIntoItems(txs);
  return {
    platform: 'EBAY',
    items,
    transactions: txs,
    unmatched: [...unmatched, ...unmatchedFromGrouping],
    headers,
  };
}
