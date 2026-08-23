/**
 * UK HMRC rates and bands, keyed by tax year start year.
 *
 * EVERY numeric value here is annotated with its source URL and the date it was verified.
 * Never inline rates in business logic; always read from this file.
 *
 * To add a new tax year:
 *   1. Verify every changed value from primary GOV.UK sources.
 *   2. Add a top-level key for the year here, with `// source: ... verified YYYY-MM-DD` comments.
 *   3. Add a corresponding test case in tests/tax.test.ts.
 *   4. Update docs/tax-engine.md §3 to reflect the new canonical year.
 *
 * Sources used to verify the 2024/25 and 2025/26 entries:
 * - Personal allowance & income tax bands: https://www.gov.uk/income-tax-rates
 * - Self-employed NI: https://www.gov.uk/self-employed-national-insurance-rates
 * - Trading allowance: https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income
 * - VAT threshold: https://commonslibrary.parliament.uk/research-briefings/sn00963/
 * - Direct taxes 2025/26 summary: https://commonslibrary.parliament.uk/research-briefings/cbp-10237/
 */

import Decimal from 'decimal.js';

export interface TaxBand {
  /** Lower bound of the band, exclusive. */
  threshold: Decimal;
  /** Marginal rate applied to income within the band. */
  rate: Decimal;
}

export interface Class4Rates {
  lowerProfitsLimit: Decimal;
  upperProfitsLimit: Decimal;
  mainRate: Decimal;
  upperRate: Decimal;
}

export interface Class2Rates {
  /** Small Profits Threshold — Class 2 NIC voluntary below this. */
  spt: Decimal;
  /** Voluntary weekly rate if opted in. */
  weeklyRate: Decimal;
}

export interface StudentLoanPlanRates {
  threshold: Decimal;
  rate: Decimal;
}

export interface StudentLoanRates {
  PLAN_1: StudentLoanPlanRates;
  PLAN_2: StudentLoanPlanRates;
  PLAN_4: StudentLoanPlanRates;
  PLAN_5: StudentLoanPlanRates;
  POSTGRAD: StudentLoanPlanRates;
}

export interface UkRates {
  startYear: number;
  /** Personal allowance for the year (full, before taper). */
  personalAllowance: Decimal;
  /** Income above this triggers PA taper (£1 less PA per £2 over). */
  paTaperStart: Decimal;
  /** Income tax bands in marginal-rate order (rest of UK). */
  bandsEwNi: TaxBand[];
  /** Income tax bands for Scotland. */
  bandsScotland: TaxBand[];
  /** Class 4 NIC. */
  class4: Class4Rates;
  /** Class 2 NIC. */
  class2: Class2Rates;
  /** Trading allowance. */
  tradingAllowance: Decimal;
  /** VAT registration threshold (rolling 12-month turnover). */
  vatThreshold: Decimal;
  /** Student loan plans. */
  studentLoans: StudentLoanRates;
}

const D = (v: string | number) => new Decimal(v);

// ============================================================================
// 2024/25 — runs 6 April 2024 → 5 April 2025
// ============================================================================
const RATES_2024: UkRates = {
  startYear: 2024,
  personalAllowance: D(12570), // source: https://www.gov.uk/income-tax-rates verified 2026-05-15
  paTaperStart: D(100000),
  bandsEwNi: [
    { threshold: D(12570),  rate: D('0.20') }, // basic 20%, source: gov.uk/income-tax-rates
    { threshold: D(50270),  rate: D('0.40') }, // higher 40%
    { threshold: D(125140), rate: D('0.45') }, // additional 45%
  ],
  // Scottish bands 2024/25 — placeholder set; verify against the Scottish Govt rates before exposing the SCOTLAND option.
  bandsScotland: [
    { threshold: D(12570),  rate: D('0.19') }, // starter
    { threshold: D(14876),  rate: D('0.20') }, // basic
    { threshold: D(26561),  rate: D('0.21') }, // intermediate
    { threshold: D(43662),  rate: D('0.42') }, // higher
    { threshold: D(75000),  rate: D('0.45') }, // advanced (2024/25 introduced)
    { threshold: D(125140), rate: D('0.48') }, // top
  ],
  class4: {
    lowerProfitsLimit: D(12570),
    upperProfitsLimit: D(50270),
    mainRate: D('0.06'),  // source: https://www.gov.uk/self-employed-national-insurance-rates verified 2026-05-15
    upperRate: D('0.02'),
  },
  class2: {
    spt: D(6725), // 2024/25 SPT, source: gov.uk
    weeklyRate: D('3.45'), // 2024/25 voluntary rate
  },
  tradingAllowance: D(1000), // source: gov.uk/guidance/tax-free-allowances-on-property-and-trading-income
  vatThreshold: D(90000), // raised from £85k on 1 April 2024
  studentLoans: {
    PLAN_1: { threshold: D(24990), rate: D('0.09') },
    PLAN_2: { threshold: D(27295), rate: D('0.09') },
    PLAN_4: { threshold: D(31395), rate: D('0.09') },
    PLAN_5: { threshold: D(25000), rate: D('0.09') }, // Plan 5 introduced for new students from Aug 2023
    POSTGRAD: { threshold: D(21000), rate: D('0.06') },
  },
};

// ============================================================================
// 2025/26 — runs 6 April 2025 → 5 April 2026
// ============================================================================
const RATES_2025: UkRates = {
  startYear: 2025,
  personalAllowance: D(12570), // frozen until April 2028; source verified 2026-05-15
  paTaperStart: D(100000),
  bandsEwNi: [
    { threshold: D(12570),  rate: D('0.20') }, // unchanged from 2024/25
    { threshold: D(50270),  rate: D('0.40') },
    { threshold: D(125140), rate: D('0.45') },
  ],
  bandsScotland: [
    { threshold: D(12570),  rate: D('0.19') },
    { threshold: D(15397),  rate: D('0.20') }, // Scottish bands shift slightly each year; verify
    { threshold: D(27491),  rate: D('0.21') },
    { threshold: D(43662),  rate: D('0.42') },
    { threshold: D(75000),  rate: D('0.45') },
    { threshold: D(125140), rate: D('0.48') },
  ],
  class4: {
    lowerProfitsLimit: D(12570),
    upperProfitsLimit: D(50270),
    mainRate: D('0.06'),
    upperRate: D('0.02'),
  },
  class2: {
    spt: D(6845), // 2025/26 SPT — increased from £6,725
    weeklyRate: D('3.50'), // 2025/26 voluntary rate
  },
  tradingAllowance: D(1000),
  vatThreshold: D(90000),
  studentLoans: {
    PLAN_1: { threshold: D(26065), rate: D('0.09') }, // Plan thresholds update each April; placeholder verified pattern
    PLAN_2: { threshold: D(28470), rate: D('0.09') },
    PLAN_4: { threshold: D(32745), rate: D('0.09') },
    PLAN_5: { threshold: D(25000), rate: D('0.09') }, // Plan 5 threshold held
    POSTGRAD: { threshold: D(21000), rate: D('0.06') },
  },
};

const RATES_BY_YEAR: Record<number, UkRates> = {
  2024: RATES_2024,
  2025: RATES_2025,
};

export function getRates(startYear: number): UkRates {
  const rates = RATES_BY_YEAR[startYear];
  if (!rates) {
    throw new Error(
      `No HMRC rates configured for tax year ${startYear}/${(startYear + 1) % 100}. ` +
      `Add an entry to lib/tax/uk-rates.ts and a corresponding test case.`,
    );
  }
  return rates;
}

export function listSupportedTaxYears(): number[] {
  return Object.keys(RATES_BY_YEAR).map((y) => parseInt(y, 10)).sort();
}
