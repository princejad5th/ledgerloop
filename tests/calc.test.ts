import { describe, it, expect } from 'vitest';
import {
  totalCost,
  netRevenue,
  profit,
  roi,
  margin,
  holdTimeDays,
  aggregate,
  profitByGroup,
  type PortfolioItem,
} from '@/lib/calc';

const baseSold: PortfolioItem = {
  id: 'a',
  status: 'SOLD',
  costPrice: 10,
  soldPrice: 50,
  soldAt: new Date('2025-05-01'),
};

describe('totalCost', () => {
  it('sums cost + shippingIn + otherCosts', () => {
    expect(
      totalCost({ id: 'x', costPrice: 10, shippingInCost: 2, otherCosts: 1 }).toFixed(2),
    ).toBe('13.00');
  });
  it('treats missing fields as 0', () => {
    expect(totalCost({ id: 'x', costPrice: 5 }).toFixed(2)).toBe('5.00');
  });
});

describe('netRevenue', () => {
  it('subtracts every selling cost', () => {
    expect(
      netRevenue({
        id: 'x',
        costPrice: 0,
        soldPrice: 100,
        shippingCharged: 5,
        platformFees: 10,
        paymentFees: 3,
        shippingOutCost: 4,
        refundAmount: 0,
      }).toFixed(2),
    ).toBe('88.00');
  });
  it('returns 0 when item has no soldPrice', () => {
    expect(netRevenue({ id: 'x', costPrice: 5 }).toFixed(2)).toBe('0.00');
  });
});

describe('profit', () => {
  it('netRevenue - totalCost', () => {
    expect(profit(baseSold).toFixed(2)).toBe('40.00');
  });
});

describe('roi and margin', () => {
  it('roi = profit / totalCost', () => {
    expect(roi(baseSold)?.toFixed(2)).toBe('4.00');
  });
  it('roi is null when cost is 0', () => {
    expect(roi({ id: 'z', costPrice: 0, soldPrice: 50 })).toBeNull();
  });
  it('margin = profit / soldPrice', () => {
    expect(margin(baseSold)?.toFixed(2)).toBe('0.80');
  });
  it('margin is null when not sold', () => {
    expect(margin({ id: 'z', costPrice: 5 })).toBeNull();
  });
});

describe('holdTimeDays', () => {
  it('purchaseDate → soldAt', () => {
    const item = {
      id: 'x',
      costPrice: 5,
      purchaseDate: new Date('2025-01-01'),
      soldAt: new Date('2025-01-31'),
    };
    expect(holdTimeDays(item)).toBe(30);
  });
  it('falls back to listedAt when purchaseDate is missing', () => {
    const item = {
      id: 'x',
      costPrice: 5,
      listedAt: new Date('2025-01-01'),
      soldAt: new Date('2025-01-11'),
    };
    expect(holdTimeDays(item)).toBe(10);
  });
  it('returns days-since-listed when not sold yet', () => {
    const item = {
      id: 'x',
      costPrice: 5,
      listedAt: new Date('2025-01-01'),
    };
    expect(holdTimeDays(item, new Date('2025-01-15'))).toBe(14);
  });
  it('returns null when neither purchaseDate nor listedAt is set', () => {
    expect(holdTimeDays({ id: 'x', costPrice: 5 })).toBeNull();
  });
});

describe('aggregate', () => {
  const range = { from: new Date('2025-04-06'), to: new Date('2026-04-05') };

  it('counts only sales within range', () => {
    const items: PortfolioItem[] = [
      { id: 'a', status: 'SOLD', costPrice: 10, soldPrice: 30, soldAt: new Date('2025-05-01') },
      { id: 'b', status: 'SOLD', costPrice: 10, soldPrice: 40, soldAt: new Date('2024-12-01') }, // outside
      { id: 'c', status: 'LISTED', costPrice: 20, listedPrice: 50 },
      { id: 'd', status: 'IN_STOCK', costPrice: 5 },
    ];
    const agg = aggregate(items, range);
    expect(agg.salesCount).toBe(1);
    expect(agg.grossSales.toFixed(2)).toBe('30.00');
    expect(agg.totalProfit.toFixed(2)).toBe('20.00');
    expect(agg.inventoryValueAtCost.toFixed(2)).toBe('25.00');
    expect(agg.inventoryValueAtList.toFixed(2)).toBe('50.00');
  });

  it('sell-through rate = sold / (sold + still-listed)', () => {
    const items: PortfolioItem[] = [
      { id: 'a', status: 'SOLD', costPrice: 5, soldPrice: 20, soldAt: new Date('2025-05-01') },
      { id: 'b', status: 'SOLD', costPrice: 5, soldPrice: 20, soldAt: new Date('2025-06-01') },
      { id: 'c', status: 'SOLD', costPrice: 5, soldPrice: 20, soldAt: new Date('2025-07-01') },
      { id: 'd', status: 'LISTED', costPrice: 5 },
    ];
    const agg = aggregate(items, range);
    expect(agg.sellThroughRate?.toFixed(2)).toBe('0.75');
  });

  it('returns null aggregates when there is no qualifying data', () => {
    const agg = aggregate([], range);
    expect(agg.averageROI).toBeNull();
    expect(agg.averageMargin).toBeNull();
    expect(agg.averageHoldTimeDays).toBeNull();
    expect(agg.sellThroughRate).toBeNull();
  });
});

describe('profitByGroup', () => {
  const range = { from: new Date('2025-04-06'), to: new Date('2026-04-05') };
  const items: PortfolioItem[] = [
    { id: '1', status: 'SOLD', costPrice: 10, soldPrice: 30, brand: 'Nike', soldAt: new Date('2025-05-01') },
    { id: '2', status: 'SOLD', costPrice: 10, soldPrice: 50, brand: 'Nike', soldAt: new Date('2025-06-01') },
    { id: '3', status: 'SOLD', costPrice: 10, soldPrice: 25, brand: 'Adidas', soldAt: new Date('2025-07-01') },
  ];

  it('groups by brand and orders by profit descending', () => {
    const result = profitByGroup(items, (i) => i.brand, range);
    expect(result.map((r) => r.key)).toEqual(['Nike', 'Adidas']);
    expect(result[0].profit.toFixed(2)).toBe('60.00');
    expect(result[1].profit.toFixed(2)).toBe('15.00');
  });
});
