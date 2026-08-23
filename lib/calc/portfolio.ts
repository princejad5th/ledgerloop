/** Portfolio-level aggregates across a date range. */

import Decimal from 'decimal.js';
import { netRevenue, profit, totalCost, holdTimeDays, type CalcItem } from './profit';

export type ItemStatus = 'DRAFT' | 'IN_STOCK' | 'LISTED' | 'SOLD' | 'RETURNED' | 'DELISTED';

export interface PortfolioItem extends CalcItem {
  status: ItemStatus;
  listedPrice?: Decimal | string | number | null;
  platform?: string | null;
  category?: string | null;
  brand?: string | null;
}

export interface PortfolioAggregates {
  inventoryValueAtCost: Decimal;
  inventoryValueAtList: Decimal;
  salesCount: number;
  grossSales: Decimal;
  netSales: Decimal;
  totalProfit: Decimal;
  averageROI: Decimal | null;
  averageMargin: Decimal | null;
  averageHoldTimeDays: number | null;
  sellThroughRate: Decimal | null;
}

const ZERO = new Decimal(0);

function d(v?: Decimal | string | number | null): Decimal {
  if (v == null) return ZERO;
  if (v instanceof Decimal) return v;
  return new Decimal(v);
}

function inDateRange(date: Date | null | undefined, range: { from: Date; to: Date }): boolean {
  if (!date) return false;
  return date >= range.from && date <= range.to;
}

/** Compute portfolio aggregates. Sales metrics are scoped by `range`; inventory metrics are point-in-time. */
export function aggregate(items: PortfolioItem[], range: { from: Date; to: Date }): PortfolioAggregates {
  let inventoryAtCost = ZERO;
  let inventoryAtList = ZERO;
  let grossSales = ZERO;
  let netSales = ZERO;
  let profitSum = ZERO;
  let salesCount = 0;
  let roiNumerator = ZERO;
  let roiDenominator = ZERO;
  let marginNumerator = ZERO;
  let marginDenominator = ZERO;
  let holdTimeSum = 0;
  let holdTimeCount = 0;
  let listedStillCount = 0;

  for (const item of items) {
    if (item.status === 'IN_STOCK' || item.status === 'LISTED') {
      inventoryAtCost = inventoryAtCost.plus(totalCost(item));
      inventoryAtList = inventoryAtList.plus(d(item.listedPrice));
      if (item.status === 'LISTED') listedStillCount += 1;
    }
    if (item.status === 'SOLD' && inDateRange(item.soldAt, range)) {
      salesCount += 1;
      grossSales = grossSales.plus(d(item.soldPrice)).plus(d(item.shippingCharged));
      netSales = netSales.plus(netRevenue(item));
      const p = profit(item);
      profitSum = profitSum.plus(p);
      const cost = totalCost(item);
      if (cost.gt(ZERO)) {
        roiNumerator = roiNumerator.plus(p);
        roiDenominator = roiDenominator.plus(cost);
      }
      if (item.soldPrice != null) {
        const sold = d(item.soldPrice);
        if (sold.gt(ZERO)) {
          marginNumerator = marginNumerator.plus(p);
          marginDenominator = marginDenominator.plus(sold);
        }
      }
      const h = holdTimeDays(item);
      if (h != null) {
        holdTimeSum += h;
        holdTimeCount += 1;
      }
    }
  }

  const averageROI = roiDenominator.gt(ZERO) ? roiNumerator.div(roiDenominator) : null;
  const averageMargin = marginDenominator.gt(ZERO) ? marginNumerator.div(marginDenominator) : null;
  const averageHoldTimeDays = holdTimeCount > 0 ? holdTimeSum / holdTimeCount : null;
  const sellThroughDenominator = salesCount + listedStillCount;
  const sellThroughRate = sellThroughDenominator > 0
    ? new Decimal(salesCount).div(sellThroughDenominator)
    : null;

  return {
    inventoryValueAtCost: inventoryAtCost,
    inventoryValueAtList: inventoryAtList,
    salesCount,
    grossSales,
    netSales,
    totalProfit: profitSum,
    averageROI,
    averageMargin,
    averageHoldTimeDays,
    sellThroughRate,
  };
}

/** Group items by a key extractor and return profit totals per group. */
export function profitByGroup<T extends PortfolioItem>(
  items: T[],
  keyOf: (item: T) => string | null | undefined,
  range: { from: Date; to: Date },
): Array<{ key: string; profit: Decimal; salesCount: number }> {
  const map = new Map<string, { profit: Decimal; salesCount: number }>();
  for (const item of items) {
    if (item.status !== 'SOLD' || !inDateRange(item.soldAt, range)) continue;
    const k = keyOf(item);
    if (!k) continue;
    const existing = map.get(k) ?? { profit: ZERO, salesCount: 0 };
    map.set(k, {
      profit: existing.profit.plus(profit(item)),
      salesCount: existing.salesCount + 1,
    });
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.profit.comparedTo(a.profit));
}
