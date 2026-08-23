/**
 * UK self-assessment tax engine.
 *
 * Pure functions, no I/O. Inputs and outputs are all Decimal (no JS floats).
 * Formulas are documented in docs/tax-engine.md §4.
 *
 * Critical rule: PAYE income fills the income tax bands first; trading profit
 * is the top slice. We compute total tax with PAYE alone, total tax with PAYE
 * plus trading profit, and the trading-profit-specific tax is the difference.
 */

import Decimal from 'decimal.js';
import { getRates, type TaxBand, type UkRates } from './uk-rates';
import type {
  DecimalLike,
  StudentLoanPlan,
  TaxBreakdown,
  TaxInput,
  TaxItem,
  TaxJurisdiction,
} from './types';

const ZERO = new Decimal(0);
const TWO = new Decimal(2);
const FIFTY_TWO = new Decimal(52);

function d(v?: DecimalLike): Decimal {
  if (v == null) return ZERO;
  if (v instanceof Decimal) return v;
  return new Decimal(v);
}

function bandsFor(rates: UkRates, jurisdiction: TaxJurisdiction): TaxBand[] {
  return jurisdiction === 'SCOTLAND' ? rates.bandsScotland : rates.bandsEwNi;
}

/** UK tax year boundaries — 6 April Y to 6 April Y+1 (strict upper bound). */
export function taxYearBounds(startYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(startYear, 3, 6, 0, 0, 0)),
    end: new Date(Date.UTC(startYear + 1, 3, 6, 0, 0, 0)),
  };
}

/** Adjusted personal allowance with high-income taper. */
export function computeAdjustedPersonalAllowance(
  income: Decimal,
  rates: UkRates,
): Decimal {
  if (income.lte(rates.paTaperStart)) return rates.personalAllowance;
  const excess = income.minus(rates.paTaperStart);
  const reduction = excess.div(TWO);
  return Decimal.max(ZERO, rates.personalAllowance.minus(reduction));
}

/**
 * Apply income tax bands to a total income amount, respecting the adjusted PA.
 * Bands must be sorted ascending by threshold.
 */
export function applyBands(income: Decimal, adjustedPA: Decimal, bands: TaxBand[]): Decimal {
  if (income.lte(adjustedPA)) return ZERO;

  let tax = ZERO;
  // Adjust the first band's effective threshold to the PA we computed.
  // We treat the bands as: [PA→band1.threshold), [band1.threshold→band2.threshold), ...
  // The first band's `threshold` in the config is the same as the statutory PA; we shift
  // it to the adjusted PA so taper is honoured.
  const effectiveBands = bands.map((b, i) =>
    i === 0 ? { ...b, threshold: adjustedPA } : b,
  );

  for (let i = 0; i < effectiveBands.length; i++) {
    const band = effectiveBands[i];
    const nextThreshold = i + 1 < effectiveBands.length
      ? effectiveBands[i + 1].threshold
      : null;
    if (income.lte(band.threshold)) break;
    const upper = nextThreshold == null ? income : Decimal.min(income, nextThreshold);
    const taxableInBand = upper.minus(band.threshold);
    if (taxableInBand.gt(ZERO)) {
      tax = tax.plus(taxableInBand.times(band.rate));
    }
  }
  return tax;
}

/**
 * Income tax attributable to the trading profit *slice*.
 *
 * The rule: stack income types lowest-marginal-first against the bands.
 * PAYE fills first, then other self-employment, then trading. We compute
 * tax on (PAYE + other) alone and tax on (PAYE + other + trading), and
 * return the difference. This correctly handles users whose PAYE income
 * has already filled the basic rate band.
 */
export function computeIncomeTaxOnTradingProfit(args: {
  payeIncome: Decimal;
  otherIncome: Decimal;
  tradingProfit: Decimal;
  adjustedPA: Decimal;
  bands: TaxBand[];
}): Decimal {
  const baseIncome = args.payeIncome.plus(args.otherIncome);
  const totalIncome = baseIncome.plus(args.tradingProfit);
  const taxOnBaseAlone = applyBands(baseIncome, args.adjustedPA, args.bands);
  const taxOnTotal = applyBands(totalIncome, args.adjustedPA, args.bands);
  const delta = taxOnTotal.minus(taxOnBaseAlone);
  return Decimal.max(ZERO, delta);
}

/**
 * Class 4 NIC on trading profit alone (PAYE income does NOT count toward Class 4).
 *
 * 2024/25 and 2025/26: 6% on profits £12,570–£50,270; 2% above.
 */
export function computeClass4NIC(profit: Decimal, c4: UkRates['class4']): Decimal {
  if (profit.lte(c4.lowerProfitsLimit)) return ZERO;
  const mainBand = Decimal.min(profit, c4.upperProfitsLimit).minus(c4.lowerProfitsLimit);
  const upperBand = Decimal.max(ZERO, profit.minus(c4.upperProfitsLimit));
  return mainBand.times(c4.mainRate).plus(upperBand.times(c4.upperRate));
}

/**
 * Class 2 NIC. From April 2024, compulsory Class 2 is abolished above SPT.
 * Below SPT, voluntary at the weekly rate × 52 if the user opts in.
 */
export function computeClass2NIC(
  profit: Decimal,
  c2: UkRates['class2'],
  voluntary: boolean,
): Decimal {
  if (!voluntary) return ZERO;
  if (profit.gte(c2.spt)) return ZERO; // already covered by SA without Class 2
  return c2.weeklyRate.times(FIFTY_TWO);
}

/**
 * Student loan repayment. The "marginal slice" — the additional repayment
 * caused by the trading profit on top of other income. We use the same
 * difference technique as for income tax.
 */
export function computeStudentLoanRepayment(args: {
  payeIncome: Decimal;
  otherIncome: Decimal;
  tradingProfit: Decimal;
  plan: StudentLoanPlan;
  rates: UkRates;
}): Decimal {
  if (args.plan === 'NONE') return ZERO;
  const planRates = args.rates.studentLoans[args.plan];
  const base = args.payeIncome.plus(args.otherIncome);
  const total = base.plus(args.tradingProfit);
  const repaymentOnBase = base.gt(planRates.threshold)
    ? base.minus(planRates.threshold).times(planRates.rate)
    : ZERO;
  const repaymentOnTotal = total.gt(planRates.threshold)
    ? total.minus(planRates.threshold).times(planRates.rate)
    : ZERO;
  return Decimal.max(ZERO, repaymentOnTotal.minus(repaymentOnBase));
}

/** Per-item total cost (cost of goods + inbound shipping + prep). */
export function totalCost(item: TaxItem): Decimal {
  return d(item.costPrice).plus(d(item.shippingInCost)).plus(d(item.otherCosts));
}

/** Per-item direct selling costs (fees, outbound shipping, refunds). */
export function directSaleCosts(item: TaxItem): Decimal {
  return d(item.platformFees)
    .plus(d(item.paymentFees))
    .plus(d(item.shippingOutCost))
    .plus(d(item.refundAmount));
}

/**
 * Filter items to those sold within the given tax year. Items without
 * a soldAt date are excluded (they belong to inventory, not turnover).
 */
export function itemsInTaxYear(items: TaxItem[], startYear: number): TaxItem[] {
  const { start, end } = taxYearBounds(startYear);
  return items.filter((i) => {
    const t = i.soldAt;
    return t >= start && t < end;
  });
}

/** Top-level entry point: compute a full TaxBreakdown for one tax year. */
export function computeTaxYear(input: TaxInput): TaxBreakdown {
  const rates = getRates(input.startYear);
  const bands = bandsFor(rates, input.jurisdiction);

  const yearItems = itemsInTaxYear(input.items, input.startYear);
  const { start, end } = taxYearBounds(input.startYear);
  const yearExpenses = input.expenses.filter(
    (e) => e.date >= start && e.date < end && e.taxDeductible,
  );

  // 1. Turnover.
  const turnover = yearItems.reduce(
    (sum, i) => sum.plus(d(i.soldPrice)).plus(d(i.shippingCharged)),
    ZERO,
  );

  // 2. Allowable expenses, two paths.
  const costOfGoodsSold = yearItems.reduce((sum, i) => sum.plus(totalCost(i)), ZERO);
  const directSaleCostsSum = yearItems.reduce((sum, i) => sum.plus(directSaleCosts(i)), ZERO);
  const generalExpensesSum = yearExpenses.reduce((sum, e) => sum.plus(d(e.amount)), ZERO);
  const actualAllowableExpenses = costOfGoodsSold
    .plus(directSaleCostsSum)
    .plus(generalExpensesSum);

  const tradingAllowance = rates.tradingAllowance;
  const profitWithExpenses = turnover.minus(actualAllowableExpenses);
  const profitWithAllowance = Decimal.max(ZERO, turnover.minus(tradingAllowance));
  const allowanceIsCheaper = profitWithAllowance.lt(profitWithExpenses);

  const useAllowance = input.useTradingAllowanceOverride ?? allowanceIsCheaper;
  const tradingProfit = useAllowance ? profitWithAllowance : profitWithExpenses;
  const allowableExpenses = useAllowance ? tradingAllowance : actualAllowableExpenses;

  // 3. Total taxable income for PA taper.
  const taxableIncome = tradingProfit
    .plus(d(input.payeIncome))
    .plus(d(input.otherSelfEmployment))
    .plus(d(input.savingsIncome));

  // 4. Adjusted personal allowance.
  const adjustedPersonalAllowance = computeAdjustedPersonalAllowance(taxableIncome, rates);

  // 5. Income tax on the trading-profit slice.
  const incomeTax = computeIncomeTaxOnTradingProfit({
    payeIncome: d(input.payeIncome),
    otherIncome: d(input.otherSelfEmployment),
    tradingProfit,
    adjustedPA: adjustedPersonalAllowance,
    bands,
  });

  // 6. Class 4 NIC.
  const class4NIC = computeClass4NIC(tradingProfit, rates.class4);

  // 7. Class 2 NIC (voluntary).
  const class2NIC = computeClass2NIC(
    tradingProfit,
    rates.class2,
    input.voluntaryClass2 === true,
  );

  // 8. Student loan repayment (marginal).
  const studentLoanRepayment = computeStudentLoanRepayment({
    payeIncome: d(input.payeIncome),
    otherIncome: d(input.otherSelfEmployment),
    tradingProfit,
    plan: input.studentLoanPlan ?? 'NONE',
    rates,
  });

  // 9. Total liability attributable to reselling.
  const totalEstimatedLiability = incomeTax
    .plus(class4NIC)
    .plus(class2NIC)
    .plus(studentLoanRepayment);

  // Flags.
  const nearVatThreshold = turnover.gte(rates.vatThreshold.times('0.9'));
  const overVatThreshold = turnover.gt(rates.vatThreshold);
  const fullReliefAvailable = turnover.lte(tradingAllowance);

  return {
    startYear: input.startYear,
    jurisdiction: input.jurisdiction,
    turnover,
    costOfGoodsSold,
    directSaleCosts: directSaleCostsSum,
    generalExpenses: generalExpensesSum,
    allowableExpenses,
    tradingProfit,
    comparison: {
      profitWithExpenses,
      profitWithAllowance,
      recommended: allowanceIsCheaper ? 'ALLOWANCE' : 'EXPENSES',
    },
    useAllowance,
    adjustedPersonalAllowance,
    incomeTax,
    class4NIC,
    class2NIC,
    studentLoanRepayment,
    totalEstimatedLiability,
    fullReliefAvailable,
    flags: { nearVatThreshold, overVatThreshold },
  };
}
