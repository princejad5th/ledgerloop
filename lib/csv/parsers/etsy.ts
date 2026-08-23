/**
 * Etsy Orders CSV parser.
 *
 * Unlike eBay's Transaction Report (one event per row), Etsy's Orders CSV is
 * already aggregated — one row per order with all the fees, shipping and item
 * total baked in. We therefore go straight to ParsedItem records without a
 * grouping pass.
 *
 * Etsy also offers an "Order Items" CSV (one row per line item). Most resellers
 * sell one item per order so we parse Orders CSV here. Item-level variant data
 * is a v1.1 feature.
 *
 * Source verified May 2026:
 *  - https://help.etsy.com/hc/en-us/articles/360000343328-How-to-Download-a-Spreadsheet-of-Your-Sold-Transactions
 *
 * Real-world Etsy Orders CSV columns include:
 *   Sale Date, Order ID, Buyer User ID, Full Name, First Name, Last Name,
 *   Number of Items, Payment Method, Date Paid, Date Shipped,
 *   Street 1, Street 2, Ship City, Ship State, Ship Zipcode, Ship Country,
 *   Currency, Subtotal, Shipping, Sales Tax, Discount Amount, Order Total,
 *   Status, Card Processing Fees, Order Net, Adjusted Order Total, Item Total,
 *   Coupon Code, In Person Discount, Order Type, Payment Type, InPerson Location,
 *   VAT Paid by Buyer, SKU
 */

import Decimal from 'decimal.js';
import type { ParsedItem, ParsedTransaction, ParseResult, UnmatchedRow } from '../types';
import { pickHeader, parseDecimal, parseFlexibleDate } from '../shared';

const H = {
  orderId:        ['Order ID', 'Order Id', 'Order ID'],
  saleDate:       ['Sale Date', 'Order Date', 'Date Paid'],
  buyerName:      ['Full Name', 'Buyer User ID', 'Buyer Name'],
  itemTotal:      ['Item Total', 'Subtotal'],
  shipping:       ['Shipping', 'Shipping Cost'],
  orderTotal:     ['Order Total'],
  orderNet:       ['Order Net'],
  fees:           ['Card Processing Fees', 'Transaction Fees', 'Etsy Fees'],
  currency:       ['Currency'],
  shipCountry:    ['Ship Country', 'Buyer country'],
  sku:            ['SKU', 'Sku'],
  status:         ['Status'],
  itemName:       ['Item Name', 'Listing Title'],
};

/** Headers that strongly imply an Etsy Orders CSV. */
export const ETSY_SIGNATURE_HEADERS = ['Sale Date', 'Order ID', 'Order Total'];

/**
 * Etsy's seller fee is roughly 6.5% transaction fee + £0.20 listing fee +
 * 4% + £0.20 payment processing on UK sales. The Orders CSV usually exposes
 * Card Processing Fees explicitly. We use it when present; when not, we apply
 * the default fallback (configurable per user via Settings → Platforms).
 */
const ETSY_DEFAULT_FEE_RATE = new Decimal('0.065'); // transaction fee
const ETSY_DEFAULT_PAYMENT_RATE = new Decimal('0.04'); // payment processing
const ETSY_DEFAULT_PAYMENT_FIXED = new Decimal('0.20');

function parseRow(
  row: Record<string, string>,
  rowNumber: number,
): { ok: true; item: ParsedItem; tx: ParsedTransaction } | { ok: false; reason: string } {
  const date = parseFlexibleDate(pickHeader(row, H.saleDate));
  if (!date) return { ok: false, reason: 'Missing or unparseable Sale Date' };

  const orderId = pickHeader(row, H.orderId);
  if (!orderId) return { ok: false, reason: 'Missing Order ID' };

  const currency = pickHeader(row, H.currency) ?? 'GBP';
  if (currency.toUpperCase() !== 'GBP') {
    return { ok: false, reason: `Non-GBP currency (${currency}) not supported in MVP` };
  }

  // Status — skip cancelled/refunded? For MVP we include them; the dashboard filters.
  const itemTotal = parseDecimal(pickHeader(row, H.itemTotal));
  if (itemTotal == null) return { ok: false, reason: 'Missing or unparseable Item Total' };

  const shippingCharged = parseDecimal(pickHeader(row, H.shipping)) ?? new Decimal(0);
  const explicitFees = parseDecimal(pickHeader(row, H.fees));
  const orderTotal = parseDecimal(pickHeader(row, H.orderTotal)) ?? itemTotal.plus(shippingCharged);
  const orderNet = parseDecimal(pickHeader(row, H.orderNet));

  // Compute fees: prefer explicit, else infer from net, else fall back to defaults.
  let platformFees: Decimal;
  if (explicitFees != null) {
    platformFees = explicitFees.abs();
  } else if (orderNet != null) {
    platformFees = orderTotal.minus(orderNet).abs();
  } else {
    platformFees = itemTotal.times(ETSY_DEFAULT_FEE_RATE);
  }
  const paymentFees = orderTotal.times(ETSY_DEFAULT_PAYMENT_RATE).plus(ETSY_DEFAULT_PAYMENT_FIXED);

  const tx: ParsedTransaction = {
    rowNumber,
    platform: 'ETSY',
    externalOrderId: orderId,
    externalTransactionId: null,
    occurredAt: date,
    kind: 'SALE',
    amount: orderTotal,
    description: pickHeader(row, H.itemName) ?? pickHeader(row, H.sku) ?? `Etsy order ${orderId}`,
    raw: row,
  };

  const item: ParsedItem = {
    platform: 'ETSY',
    externalListingId: orderId,
    title: tx.description,
    soldAt: date,
    soldPrice: itemTotal,
    shippingCharged,
    platformFees,
    paymentFees,
    shippingOutCost: new Decimal(0), // Etsy doesn't expose seller-paid postage in the Orders CSV
    refundAmount: new Decimal(0),
    buyerCountry: pickHeader(row, H.shipCountry),
    rawTransactions: [tx],
  };

  return { ok: true, item, tx };
}

export function parseEtsy(rows: Record<string, string>[]): ParseResult {
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

  return { platform: 'ETSY', items, transactions, unmatched, headers };
}
