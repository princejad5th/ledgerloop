/**
 * Per-item economics. Same Decimal discipline as the tax engine.
 *
 * Formulas (spec §7):
 *   totalCost    = costPrice + (shippingInCost ?? 0) + (otherCosts ?? 0)
 *   netRevenue   = (soldPrice ?? 0) + (shippingCharged ?? 0)
 *                 - (platformFees ?? 0) - (paymentFees ?? 0)
 *                 - (shippingOutCost ?? 0) - (refundAmount ?? 0)
 *   profit       = netRevenue - totalCost
 *   roi          = totalCost > 0 ? profit / totalCost : null
 *   margin       = soldPrice > 0 ? profit / soldPrice : null
 *   holdTimeDays = soldAt ? days(purchaseDate ?? listedAt, soldAt)
 *                          : days(purchaseDate ?? listedAt, now)
 */

import Decimal from 'decimal.js';
import type { DecimalLike } from '../tax/types';

export interface CalcItem {
  id: string;
  costPrice: DecimalLike;
  shippingInCost?: DecimalLike;
  otherCosts?: DecimalLike;
  soldPrice?: DecimalLike;
  shippingCharged?: DecimalLike;
  platformFees?: DecimalLike;
  paymentFees?: DecimalLike;
  shippingOutCost?: DecimalLike;
  refundAmount?: DecimalLike;
  purchaseDate?: Date | null;
  listedAt?: Date | null;
  soldAt?: Date | null;
}

const ZERO = new Decimal(0);

function d(v?: DecimalLike): Decimal {
  if (v == null) return ZERO;
  if (v instanceof Decimal) return v;
  return new Decimal(v);
}

export function totalCost(item: CalcItem): Decimal {
  return d(item.costPrice).plus(d(item.shippingInCost)).plus(d(item.otherCosts));
}

export function netRevenue(item: CalcItem): Decimal {
  if (item.soldPrice == null) return ZERO;
  return d(item.soldPrice)
    .plus(d(item.shippingCharged))
    .minus(d(item.platformFees))
    .minus(d(item.paymentFees))
    .minus(d(item.shippingOutCost))
    .minus(d(item.refundAmount));
}

export function profit(item: CalcItem): Decimal {
  return netRevenue(item).minus(totalCost(item));
}

/** ROI returns null when there is no cost basis (we cannot compute infinity). */
export function roi(item: CalcItem): Decimal | null {
  const cost = totalCost(item);
  if (cost.lte(ZERO)) return null;
  return profit(item).div(cost);
}

/** Margin returns null when the item is not sold. */
export function margin(item: CalcItem): Decimal | null {
  if (item.soldPrice == null) return null;
  const sold = d(item.soldPrice);
  if (sold.lte(ZERO)) return null;
  return profit(item).div(sold);
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Days between two dates, floored to whole days. Negative results clamp to 0. */
function daysBetween(a: Date, b: Date): number {
  const diff = (b.getTime() - a.getTime()) / MS_PER_DAY;
  return Math.max(0, Math.floor(diff));
}

/**
 * Hold time in days.
 *  - If sold: days from purchaseDate (or listedAt as fallback) to soldAt.
 *  - If not sold yet: days from purchaseDate (or listedAt) to `now`.
 *  - If neither purchaseDate nor listedAt is set, returns null.
 */
export function holdTimeDays(item: CalcItem, now: Date = new Date()): number | null {
  const start = item.purchaseDate ?? item.listedAt;
  if (!start) return null;
  const end = item.soldAt ?? now;
  return daysBetween(start, end);
}
