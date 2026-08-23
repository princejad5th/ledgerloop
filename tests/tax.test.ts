import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  computeTaxYear,
  computeAdjustedPersonalAllowance,
  computeClass4NIC,
  computeIncomeTaxOnTradingProfit,
  getRates,
  applyBands,
  taxYearBounds,
  type TaxItem,
} from '@/lib/tax';
import { mapToSa103S, mapToSa103F, sa103ToCsv, chooseForm } from '@/lib/tax/sa103';
import worked from './fixtures/worked-example.json';

function gbp(n: number): Decimal {
  return new Decimal(n);
}

/**
 * Build a single TaxItem representing one bucket of sold-item totals.
 * Allows the worked-example test to assert on aggregates without
 * specifying 60 individual items.
 */
function aggregateItem(args: {
  soldPrice: number;
  costPrice: number;
  shippingCharged?: number;
  shippingInCost?: number;
  otherCosts?: number;
  platformFees?: number;
  paymentFees?: number;
  shippingOutCost?: number;
  refundAmount?: number;
  soldAt: Date;
}): TaxItem {
  return {
    id: 'agg',
    soldPrice: args.soldPrice,
    shippingCharged: args.shippingCharged ?? 0,
    costPrice: args.costPrice,
    shippingInCost: args.shippingInCost ?? 0,
    otherCosts: args.otherCosts ?? 0,
    platformFees: args.platformFees ?? 0,
    paymentFees: args.paymentFees ?? 0,
    shippingOutCost: args.shippingOutCost ?? 0,
    refundAmount: args.refundAmount ?? 0,
    soldAt: args.soldAt,
  };
}

describe('taxYearBounds', () => {
  it('returns 6 April Y to 6 April Y+1', () => {
    const { start, end } = taxYearBounds(2024);
    expect(start.toISOString()).toBe('2024-04-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-04-06T00:00:00.000Z');
  });
});

describe('computeAdjustedPersonalAllowance', () => {
  const rates = getRates(2025);
  it('returns full PA below £100k', () => {
    expect(computeAdjustedPersonalAllowance(gbp(80000), rates).toFixed(2)).toBe('12570.00');
  });
  it('tapers £1 per £2 over £100k', () => {
    // £110k → reduction = £5,000 → adjusted = £7,570
    expect(computeAdjustedPersonalAllowance(gbp(110000), rates).toFixed(2)).toBe('7570.00');
  });
  it('floors at £0 above £125,140', () => {
    expect(computeAdjustedPersonalAllowance(gbp(150000), rates).toFixed(2)).toBe('0.00');
  });
  it('reaches exactly 0 at £125,140', () => {
    expect(computeAdjustedPersonalAllowance(gbp(125140), rates).toFixed(2)).toBe('0.00');
  });
});

describe('applyBands', () => {
  const rates = getRates(2025);
  it('returns 0 below PA', () => {
    expect(applyBands(gbp(10000), gbp(12570), rates.bandsEwNi).toFixed(2)).toBe('0.00');
  });
  it('20% on income within basic rate band', () => {
    // 32,000 income, PA 12,570 → taxable basic = 19,430 → tax = 3,886
    expect(applyBands(gbp(32000), gbp(12570), rates.bandsEwNi).toFixed(2)).toBe('3886.00');
  });
  it('higher rate stacks correctly at £60,000', () => {
    // basic: (50,270 - 12,570) × 20% = 7,540
    // higher: (60,000 - 50,270) × 40% = 3,892
    // total: 11,432
    expect(applyBands(gbp(60000), gbp(12570), rates.bandsEwNi).toFixed(2)).toBe('11432.00');
  });
});

describe('computeClass4NIC', () => {
  const rates = getRates(2025);
  it('returns 0 below LPL', () => {
    expect(computeClass4NIC(gbp(10000), rates.class4).toFixed(2)).toBe('0.00');
  });
  it('charges 6% in the main band', () => {
    // profit 20,000: (20,000 - 12,570) × 6% = 445.80
    expect(computeClass4NIC(gbp(20000), rates.class4).toFixed(2)).toBe('445.80');
  });
  it('charges 6% to UPL then 2% above', () => {
    // profit 60,000:
    //   main: (50,270 - 12,570) × 6% = 2,262
    //   upper: (60,000 - 50,270) × 2% = 194.60
    //   total: 2,456.60
    expect(computeClass4NIC(gbp(60000), rates.class4).toFixed(2)).toBe('2456.60');
  });
});

describe('computeIncomeTaxOnTradingProfit — marginal stacking', () => {
  const rates = getRates(2025);
  it('£32k PAYE + £8,600 trading → £1,720 marginal', () => {
    // The headline number from the worked example.
    const result = computeIncomeTaxOnTradingProfit({
      payeIncome: gbp(32000),
      otherIncome: gbp(0),
      tradingProfit: gbp(8600),
      adjustedPA: gbp(12570),
      bands: rates.bandsEwNi,
    });
    expect(result.toFixed(2)).toBe('1720.00');
  });
  it('£45k PAYE + £10k trading: most of trading hits 40%', () => {
    // base tax on £45k: (45,000 - 12,570) × 20% = 6,486
    // total tax on £55k: (50,270 - 12,570) × 20% + (55,000 - 50,270) × 40%
    //                  = 7,540 + 1,892 = 9,432
    // marginal: 9,432 - 6,486 = 2,946
    const result = computeIncomeTaxOnTradingProfit({
      payeIncome: gbp(45000),
      otherIncome: gbp(0),
      tradingProfit: gbp(10000),
      adjustedPA: gbp(12570),
      bands: rates.bandsEwNi,
    });
    expect(result.toFixed(2)).toBe('2946.00');
  });
});

describe('computeTaxYear — worked example (actual expenses path)', () => {
  // Construct items that aggregate to the worked example totals.
  const soldAt = new Date(Date.UTC(2024, 8, 15)); // 15 Sept 2024, well within 2024/25
  const items: TaxItem[] = [
    aggregateItem({
      soldPrice: worked.scenario.turnover, // £18,500
      costPrice: worked.scenario.costOfGoodsSold, // £6,200
      // Split the £2,800 direct sale costs into platform fees for simplicity.
      platformFees: worked.scenario.directSaleCosts,
      soldAt,
    }),
  ];
  const expenses = [
    {
      id: 'gen',
      date: soldAt,
      amount: worked.scenario.generalExpenses, // £900
      taxDeductible: true,
    },
  ];

  it('matches expected values from the worked example', () => {
    const result = computeTaxYear({
      startYear: worked.scenario.startYear,
      jurisdiction: 'EW_NI',
      items,
      expenses,
      payeIncome: worked.scenario.payeIncome,
      studentLoanPlan: 'PLAN_2',
    });

    expect(result.turnover.toFixed(2)).toBe('18500.00');
    expect(result.allowableExpenses.toFixed(2)).toBe(
      worked.expectedActualExpenses.allowableExpenses.toFixed(2),
    );
    expect(result.tradingProfit.toFixed(2)).toBe(
      worked.expectedActualExpenses.tradingProfit.toFixed(2),
    );
    expect(result.useAllowance).toBe(false);
    expect(result.comparison.recommended).toBe('EXPENSES');
    expect(result.adjustedPersonalAllowance.toFixed(2)).toBe('12570.00');
    expect(result.incomeTax.toFixed(2)).toBe(
      worked.expectedActualExpenses.incomeTax.toFixed(2),
    );
    expect(result.class4NIC.toFixed(2)).toBe(
      worked.expectedActualExpenses.class4NIC.toFixed(2),
    );
    expect(result.class2NIC.toFixed(2)).toBe(
      worked.expectedActualExpenses.class2NIC.toFixed(2),
    );
    expect(result.studentLoanRepayment.toFixed(2)).toBe(
      worked.expectedActualExpenses.studentLoanRepayment.toFixed(2),
    );
    expect(result.totalEstimatedLiability.toFixed(2)).toBe(
      worked.expectedActualExpenses.totalEstimatedLiability.toFixed(2),
    );
  });

  it('with trading allowance override produces the §6.1 comparison numbers', () => {
    const result = computeTaxYear({
      startYear: worked.scenario.startYear,
      jurisdiction: 'EW_NI',
      items,
      expenses,
      payeIncome: worked.scenario.payeIncome,
      studentLoanPlan: 'PLAN_2',
      useTradingAllowanceOverride: true,
    });
    expect(result.useAllowance).toBe(true);
    expect(result.tradingProfit.toFixed(2)).toBe('17500.00');
    expect(result.incomeTax.toFixed(2)).toBe(
      worked.expectedAllowance.incomeTax.toFixed(2),
    );
    expect(result.class4NIC.toFixed(2)).toBe(
      worked.expectedAllowance.class4NIC.toFixed(2),
    );
    expect(result.studentLoanRepayment.toFixed(2)).toBe(
      worked.expectedAllowance.studentLoanRepayment.toFixed(2),
    );
    expect(result.totalEstimatedLiability.toFixed(2)).toBe(
      worked.expectedAllowance.totalEstimatedLiability.toFixed(2),
    );
  });

  it('excludes items sold outside the tax year', () => {
    const itemBefore = aggregateItem({
      soldPrice: 5000,
      costPrice: 1000,
      soldAt: new Date(Date.UTC(2023, 5, 1)), // June 2023 — prior year
    });
    const result = computeTaxYear({
      startYear: 2024,
      jurisdiction: 'EW_NI',
      items: [itemBefore, ...items],
      expenses,
    });
    expect(result.turnover.toFixed(2)).toBe('18500.00');
  });
});

describe('computeTaxYear — edge cases', () => {
  it('returns zeros for empty input', () => {
    const result = computeTaxYear({
      startYear: 2025,
      jurisdiction: 'EW_NI',
      items: [],
      expenses: [],
    });
    expect(result.turnover.toFixed(2)).toBe('0.00');
    expect(result.tradingProfit.toFixed(2)).toBe('0.00');
    expect(result.totalEstimatedLiability.toFixed(2)).toBe('0.00');
    expect(result.fullReliefAvailable).toBe(true);
  });

  it('flags VAT threshold proximity', () => {
    const soldAt = new Date(Date.UTC(2025, 6, 1));
    const item = aggregateItem({ soldPrice: 85000, costPrice: 20000, soldAt });
    const result = computeTaxYear({
      startYear: 2025,
      jurisdiction: 'EW_NI',
      items: [item],
      expenses: [],
    });
    expect(result.flags.nearVatThreshold).toBe(true);
    expect(result.flags.overVatThreshold).toBe(false);
  });

  it('flags VAT threshold breach', () => {
    const soldAt = new Date(Date.UTC(2025, 6, 1));
    const item = aggregateItem({ soldPrice: 95000, costPrice: 30000, soldAt });
    const result = computeTaxYear({
      startYear: 2025,
      jurisdiction: 'EW_NI',
      items: [item],
      expenses: [],
    });
    expect(result.flags.overVatThreshold).toBe(true);
  });

  it('recommends allowance when actual expenses < £1,000', () => {
    const soldAt = new Date(Date.UTC(2025, 6, 1));
    const item = aggregateItem({
      soldPrice: 2500,
      costPrice: 100, // tiny costs → expenses < £1k → allowance is the right pick
      soldAt,
    });
    const result = computeTaxYear({
      startYear: 2025,
      jurisdiction: 'EW_NI',
      items: [item],
      expenses: [],
    });
    expect(result.comparison.recommended).toBe('ALLOWANCE');
    expect(result.useAllowance).toBe(true);
  });
});

describe('SA103 mapping', () => {
  const soldAt = new Date(Date.UTC(2025, 8, 15));
  const items: TaxItem[] = [
    aggregateItem({
      soldPrice: 18500,
      costPrice: 6200,
      platformFees: 2800,
      soldAt,
    }),
  ];
  const result = computeTaxYear({
    startYear: 2025,
    jurisdiction: 'EW_NI',
    items,
    expenses: [{ id: 'g', date: soldAt, amount: 900, taxDeductible: true }],
    payeIncome: 32000,
    studentLoanPlan: 'PLAN_2',
  });

  it('picks SA103S below £90k turnover', () => {
    const rates = getRates(2025);
    expect(chooseForm(result, rates.vatThreshold)).toBe('SA103S');
  });

  it('SA103S Box 9 equals turnover, Box 20 equals expenses, Box 21 equals net profit', () => {
    const mapping = mapToSa103S(result);
    const box9 = mapping.rows.find((r) => r.box === '9');
    const box20 = mapping.rows.find((r) => r.box === '20');
    const box21 = mapping.rows.find((r) => r.box === '21');
    expect(box9?.value.toFixed(2)).toBe('18500.00');
    expect(box20?.value.toFixed(2)).toBe('9900.00');
    expect(box21?.value.toFixed(2)).toBe('8600.00');
  });

  it('SA103F box 20 equals cost of goods sold', () => {
    const mapping = mapToSa103F(result);
    const box20 = mapping.rows.find((r) => r.box === '20');
    expect(box20?.value.toFixed(2)).toBe('6200.00');
  });

  it('CSV export starts with disclaimer and has a header row', () => {
    const mapping = mapToSa103S(result);
    const csv = sa103ToCsv(mapping);
    expect(csv.split('\n')[0]).toContain('estimates');
    expect(csv.split('\n')[1]).toContain('Form');
    expect(csv).toContain('SA103S');
  });
});
