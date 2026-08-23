import Decimal from 'decimal.js';

// Configure decimal.js once: banker's rounding (HMRC convention), enough precision for money.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_EVEN });

export type DecimalLike = Decimal | string | number;

export type StudentLoanPlan = 'NONE' | 'PLAN_1' | 'PLAN_2' | 'PLAN_4' | 'PLAN_5' | 'POSTGRAD';
export type TaxJurisdiction = 'EW_NI' | 'SCOTLAND';

/** A sold item, as fed into the tax engine. Only fields that affect tax. */
export interface TaxItem {
  id: string;
  /** Sale net of any taxes; gross of fees. */
  soldPrice: DecimalLike;
  shippingCharged?: DecimalLike;
  /** Cost of acquiring the item, including any inbound shipping and prep. */
  costPrice: DecimalLike;
  shippingInCost?: DecimalLike;
  otherCosts?: DecimalLike;
  /** Selling costs, all in GBP. */
  platformFees?: DecimalLike;
  paymentFees?: DecimalLike;
  shippingOutCost?: DecimalLike;
  refundAmount?: DecimalLike;
  /** When the item was sold (used to assign to a tax year). */
  soldAt: Date;
}

/** A general expense, dated within the year. */
export interface TaxExpense {
  id: string;
  date: Date;
  amount: DecimalLike;
  taxDeductible: boolean;
}

/** Inputs to a single tax-year computation. */
export interface TaxInput {
  /** UK tax year start year, e.g. 2025 for 2025/26 (6 Apr 2025 → 5 Apr 2026). */
  startYear: number;
  jurisdiction: TaxJurisdiction;
  items: TaxItem[];
  expenses: TaxExpense[];

  /** Other income shaping marginal rate. */
  payeIncome?: DecimalLike;
  otherSelfEmployment?: DecimalLike;
  savingsIncome?: DecimalLike;

  /** Student loan plan, default NONE. */
  studentLoanPlan?: StudentLoanPlan;

  /**
   * Override the engine's recommendation for trading allowance.
   * `undefined` → engine picks whichever yields lower tax.
   */
  useTradingAllowanceOverride?: boolean;

  /** Voluntary Class 2 NIC opt-in (only relevant if trading profit below SPT). */
  voluntaryClass2?: boolean;
}

/** Computed tax-year breakdown. All money fields are Decimal. */
export interface TaxBreakdown {
  startYear: number;
  jurisdiction: TaxJurisdiction;

  turnover: Decimal;
  costOfGoodsSold: Decimal;
  directSaleCosts: Decimal;
  generalExpenses: Decimal;

  /** Whichever path is being applied (allowance vs actual). */
  allowableExpenses: Decimal;
  tradingProfit: Decimal;

  /** Side-by-side comparison shown in the UI. */
  comparison: {
    profitWithExpenses: Decimal;
    profitWithAllowance: Decimal;
    recommended: 'ALLOWANCE' | 'EXPENSES';
  };

  /** Boolean reflecting which path is in use after applying override. */
  useAllowance: boolean;

  /** Adjusted personal allowance for the user's income level. */
  adjustedPersonalAllowance: Decimal;

  /** Income tax attributable to the trading profit (marginal slice). */
  incomeTax: Decimal;
  class4NIC: Decimal;
  class2NIC: Decimal;
  studentLoanRepayment: Decimal;
  totalEstimatedLiability: Decimal;

  /** Useful for the UI to show "you may not need to file" if turnover ≤ allowance. */
  fullReliefAvailable: boolean;

  /** Soft flags. */
  flags: {
    nearVatThreshold: boolean;
    overVatThreshold: boolean;
  };
}
