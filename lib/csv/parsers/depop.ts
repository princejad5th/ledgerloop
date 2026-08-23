/**
 * Depop Sales Download parser.
 *
 * Source verified May 2026:
 *  - https://depophelp.zendesk.com/hc/en-gb/articles/360039263713-How-to-use-your-sales-download
 *
 * Depop's sales download contains one row per sale with the date, buyer
 * username, item description, quantity, pricing, applicable fees (Depop
 * Payment, Buyer Marketplace, Selling, Boosting), and shipping info. Files
 * cover at most 3 months — users may upload several to cover a full tax year.
 *
 * Real-world Depop CSV columns we look for (case-insensitive, with synonyms):
 *   Date, Buyer username, Item description, Quantity, Item price,
 *   Depop fee / Selling fee, Depop Payment fee, BMF / Buyer Marketplace fee,
 *   Boosted listing fee, Shipping (charged to buyer), Net amount,
 *   Refunded, Country
 *
 * Notes on Depop's current UK fee structure (verified May 2026):
 *  - Selling fee:  0% (dropped from 10% in mid-2024)
 *  - Depop Payments: 2.9% + £0.30 per transaction
 *  - Boosted listing fee: 12% (optional; only when seller opted in)
 */

import Decimal from 'decimal.js';
import type { ParsedItem, ParsedTransaction, ParseResult, UnmatchedRow } from '../types';
import { pickHeader, parseDecimal, parseFlexibleDate } from '../shared';

const H = {
  date:           ['Date', 'Sale date', 'Transaction date'],
  buyer:          ['Buyer username', 'Buyer', 'Buyer Name'],
  itemDesc:       ['Item description', 'Description', 'Item'],
  quantity:       ['Quantity', 'Qty'],
  price:          ['Item price', 'Price', 'Sale price', 'Item Total'],
  sellingFee:     ['Selling fee', 'Depop fee', 'Depop Selling fee'],
  paymentFee:     ['Depop Payment fee', 'Payment fee', 'Payments fee'],
  bmf:            ['Buyer Marketplace fee', 'BMF', 'Marketplace fee'],
  boostFee:       ['Boosted listing fee', 'Boost fee', 'Boosting fee'],
  shipping:       ['Shipping', 'Shipping charged', 'Postage'],
  netAmount:      ['Net amount', 'Net', 'Payout'],
  refund:         ['Refunded', 'Refund amount', 'Refund'],
  country:        ['Country', 'Buyer country', 'Ship country'],
  orderId:        ['Order ID', 'Transaction ID', 'Sale ID'],
};

export const DEPOP_SIGNATURE_HEADERS = ['Buyer username', 'Item description'];

const DEPOP_DEFAULT_PAYMENT_RATE = new Decimal('0.029');
const DEPOP_DEFAULT_PAYMENT_FIXED = new Decimal('0.30');

function parseRow(
  row: Record<string, string>,
  rowNumber: number,
): { ok: true; item: ParsedItem; tx: ParsedTransaction } | { ok: false; reason: string } {
  const date = parseFlexibleDate(pickHeader(row, H.date));
  if (!date) return { ok: false, reason: 'Missing or unparseable Date' };

  const price = parseDecimal(pickHeader(row, H.price));
  if (price == null) return { ok: false, reason: 'Missing or unparseable Item price' };

  const shippingCharged = parseDecimal(pickHeader(row, H.shipping)) ?? new Decimal(0);

  // Fees: prefer explicit columns, then synthesise the rest.
  const sellingFee = (parseDecimal(pickHeader(row, H.sellingFee)) ?? new Decimal(0)).abs();
  const explicitPaymentFee = parseDecimal(pickHeader(row, H.paymentFee));
  const boostFee = (parseDecimal(pickHeader(row, H.boostFee)) ?? new Decimal(0)).abs();
  const paymentFee = explicitPaymentFee != null
    ? explicitPaymentFee.abs()
    : price.plus(shippingCharged).times(DEPOP_DEFAULT_PAYMENT_RATE).plus(DEPOP_DEFAULT_PAYMENT_FIXED);
  const platformFees = sellingFee.plus(boostFee);

  const refundAmount = (parseDecimal(pickHeader(row, H.refund)) ?? new Decimal(0)).abs();

  // Depop CSVs don't always have an order ID. When absent we fabricate one
  // from row content so re-imports dedupe sensibly.
  const orderId = pickHeader(row, H.orderId) ?? `depop-${rowNumber}-${date.toISOString().slice(0,10)}`;

  const tx: ParsedTransaction = {
    rowNumber,
    platform: 'DEPOP',
    externalOrderId: orderId,
    externalTransactionId: pickHeader(row, H.orderId),
    occurredAt: date,
    kind: refundAmount.gt(0) ? 'REFUND' : 'SALE',
    amount: price.plus(shippingCharged),
    description: pickHeader(row, H.itemDesc) ?? `Depop sale ${orderId}`,
    raw: row,
  };

  const item: ParsedItem = {
    platform: 'DEPOP',
    externalListingId: orderId,
    title: tx.description,
    soldAt: date,
    soldPrice: price,
    shippingCharged,
    platformFees,
    paymentFees: paymentFee,
    shippingOutCost: new Decimal(0),
    refundAmount,
    buyerCountry: pickHeader(row, H.country),
    rawTransactions: [tx],
  };

  return { ok: true, item, tx };
}

export function parseDepop(rows: Record<string, string>[]): ParseResult {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const items: ParsedItem[] = [];
  const transactions: ParsedTransaction[] = [];
  const unmatched: UnmatchedRow[] = [];

  rows.forEach((row, idx) => {
    const result = parseRow(row, idx + 1);
    if (result.ok) {
      items.push(result.item);
      transactions.push(result.tx);
    } else {
      unmatched.push({ rowNumber: idx + 1, reason: result.reason, raw: row });
    }
  });

  return { platform: 'DEPOP', items, transactions, unmatched, headers };
}
