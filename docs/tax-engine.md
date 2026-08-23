# UK HMRC Tax Engine

This document is the source of truth for the tax engine's behaviour. It states every formula used, cites the HMRC source for every rate, explains how to add a new tax year, and shows a worked example end-to-end so an accountant can audit the implementation against first principles.

Read this document before changing anything under `packages/core/src/tax`. The engine is the product's differentiator and the place where a regression most directly hurts users — the wrong number here is a wrong number on someone's self-assessment return.

## 1. Disclaimer (also surfaced in the UI)

> The figures LedgerLoop produces are estimates. LedgerLoop is not a regulated tax advisor. Verify with HMRC or a qualified accountant before submitting your Self Assessment return.

This wording appears in the `/app/tax` page header, on the PDF export, and in the SA103 CSV's first row. It must be present on every surface where the calculation is shown.

## 2. UK tax year boundaries

UK Income Tax operates on a tax year that runs from **6 April Y** to **5 April Y+1**. The engine stores tax years by their `startYear` integer — a `TaxYear` row with `startYear = 2025` covers 6 April 2025 to 5 April 2026, commonly written "2025/26".

```ts
function taxYearBounds(startYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(startYear,     3, 6, 0, 0, 0)),       // 6 April Y
    end:   new Date(Date.UTC(startYear + 1, 3, 6, 0, 0, 0)),       // strict upper bound
  };
}
```

A sale is in the year if `soldAt >= start && soldAt < end`. The strict upper bound avoids the rounding ambiguity around midnight on 6 April.

## 3. Rates and bands (verified for 2025/26)

All rates and bands live in `packages/core/src/tax/uk-rates.ts`, keyed by `startYear`. Below is the canonical set for **2025/26**, with sources. **Never inline these literals in business logic.**

### 3.1 Personal allowance and income tax bands (England, Wales, Northern Ireland)

| Band | Threshold | Rate |
|---|---:|---:|
| Personal allowance | £0 – £12,570 | 0% |
| Basic rate | £12,571 – £50,270 | 20% |
| Higher rate | £50,271 – £125,140 | 40% |
| Additional rate | Above £125,140 | 45% |

Personal allowance is reduced by £1 for every £2 of income above £100,000, reaching £0 at £125,140. The taper is non-linear in a way that requires computing adjusted PA before applying bands.

Sources:

- [Income Tax rates and Personal Allowances — GOV.UK](https://www.gov.uk/income-tax-rates)
- [Direct taxes: Rates and allowances for 2025/26 — House of Commons Library](https://commonslibrary.parliament.uk/research-briefings/cbp-10237/)

### 3.2 Scottish income tax bands

Scottish residents are taxed on a different set of bands. The engine selects bands based on `User.taxJurisdiction` (default `EW_NI`, alternative `SCOTLAND`). The 2025/26 Scottish bands are encoded in `uk-rates.ts` under `SCOTLAND.2025`. The full numeric set should be re-verified against the Scottish Government's published rates at build time — they are reviewed annually by the Scottish Parliament independently of Westminster.

### 3.3 National Insurance — self-employed

For **2025/26**:

| Contribution | Status | Rate |
|---|---|---|
| Class 2 NIC | Voluntary above the Small Profits Threshold (£6,845) | £3.50 / week if elected |
| Class 4 NIC — main rate | Profits £12,570 to £50,270 | 6% |
| Class 4 NIC — upper rate | Profits above £50,270 | 2% |

Class 2 NIC liability was abolished from April 2024 for those above the Small Profits Threshold. Those below SPT may elect to pay voluntarily to protect State Pension entitlement; the engine surfaces this as an opt-in toggle in Tax Settings (default off).

Sources:

- [Self-employed National Insurance rates — GOV.UK](https://www.gov.uk/self-employed-national-insurance-rates)
- [Class 2 National Insurance — Association of Taxation Technicians](https://www.att.org.uk/technical/news/class-2-national-insurance-whats-changing-april-2024)

### 3.4 Trading allowance and reporting thresholds

| Allowance / threshold | Value (2025/26) | Notes |
|---|---:|---|
| Trading allowance | £1,000 | Full relief if gross trading income ≤ £1,000; partial relief option above |
| Self-assessment registration threshold | Gross > £1,000 | Must register if gross trading income exceeds the allowance |
| VAT registration threshold | £90,000 turnover (rolling 12 mo) | Trigger to switch from SA103S to SA103F |
| VAT deregistration threshold | £88,000 | Informational only — flagged in UI |

The trading allowance stays at £1,000 for 2025/26 and remains £1,000 under currently announced policy. From 2027/28 HMRC raises the **reporting threshold** to £3,000 (i.e. between £1,000 and £3,000 of gross trading income, no full SA return required) — but the allowance itself is unchanged. The engine handles the reporting-threshold change by year-keyed config when 2027/28 lands.

Sources:

- [Tax-free allowances on property and trading income — GOV.UK](https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income)
- [VAT Registration — UK Parliament Commons Library](https://commonslibrary.parliament.uk/research-briefings/sn00963/)

### 3.5 Student loan plans

The engine supports plans 1, 2, 4, 5, and Postgraduate. The thresholds and 9%/6% rates per plan are encoded in `uk-rates.ts` under `STUDENT_LOANS.2025`. These shift each April and must be re-verified when adding a new tax year. Sources are in the file's comments.

## 4. Computation pipeline

The engine computes a `TaxBreakdown` for a given user, tax year, and toggle settings. Pseudocode mirroring the spec §8.2:

```ts
function computeTaxYear(input: TaxInput): TaxBreakdown {
  const rates = getRates(input.startYear, input.jurisdiction);

  // 1. Turnover from sold items in the year (excluding VAT).
  const turnover = sum(items.map(i => i.soldPrice.plus(i.shippingCharged ?? 0)));

  // 2. Allowable expenses, two paths.
  const directItemCosts = sum(items.map(i => totalCost(i)));
  const directSaleCosts = sum(items.map(i =>
    (i.platformFees ?? 0)
      .plus(i.paymentFees ?? 0)
      .plus(i.shippingOutCost ?? 0)
      .plus(i.refundAmount ?? 0)
  ));
  const generalExpenses = sum(expenses.filter(e => e.taxDeductible).map(e => e.amount));
  const actualAllowableExpenses = directItemCosts.plus(directSaleCosts).plus(generalExpenses);

  const tradingAllowance = Decimal(rates.tradingAllowance); // £1,000
  const profitWithExpenses = turnover.minus(actualAllowableExpenses);
  const profitWithAllowance = turnover.minus(tradingAllowance);

  // 3. Pick the more favourable, or honour user override.
  const useAllowance = input.useTradingAllowanceOverride
    ?? profitWithAllowance.gt(profitWithExpenses);
  const tradingProfit = useAllowance ? profitWithAllowance : profitWithExpenses;

  // 4. Total taxable income.
  const taxableIncome = tradingProfit
    .plus(input.payeIncome ?? 0)
    .plus(input.otherSelfEmployment ?? 0)
    .plus(input.savingsIncome ?? 0);

  // 5. Adjusted personal allowance with taper above £100k.
  const adjustedPA = computeAdjustedPersonalAllowance(taxableIncome, rates);

  // 6. Income tax owed.
  //    PAYE income fills the bands first; trading profit is the top slice.
  const tax = computeIncomeTaxOnTradingProfit({
    payeIncome: input.payeIncome ?? 0,
    otherIncome: input.otherSelfEmployment ?? 0,
    tradingProfit,
    adjustedPA,
    bands: rates.bands,
  });

  // 7. Class 4 NIC on trading profit.
  const class4 = computeClass4NIC(tradingProfit, rates.class4);

  // 8. Class 2 NIC if voluntarily elected and below SPT.
  const class2 = input.voluntaryClass2 && tradingProfit.lt(rates.class2.spt)
    ? rates.class2.weeklyRate.times(52)
    : Decimal(0);

  // 9. Student loan repayment if applicable.
  const studentLoan = computeStudentLoanRepayment(
    taxableIncome, input.studentLoanPlan, rates.studentLoans
  );

  return {
    turnover, allowableExpenses: useAllowance ? tradingAllowance : actualAllowableExpenses,
    tradingProfit, tax, class4, class2, studentLoan,
    totalEstimatedLiability: tax.plus(class4).plus(class2).plus(studentLoan),
    useAllowance,
    comparison: { profitWithExpenses, profitWithAllowance },
  };
}
```

### 4.1 Personal allowance taper

```ts
function computeAdjustedPersonalAllowance(income: Decimal, rates: Rates): Decimal {
  const fullPA = rates.personalAllowance;          // £12,570
  const taperStart = rates.paTaperStart;           // £100,000
  if (income.lte(taperStart)) return fullPA;
  const excess = income.minus(taperStart);
  const reduction = excess.div(2);                 // £1 reduction per £2 over £100k
  return Decimal.max(0, fullPA.minus(reduction));  // floors at £0 above £125,140
}
```

### 4.2 Income tax on trading profit — the marginal stacking rule

This is the single most error-prone calculation in the engine. The rule HMRC uses: stack income types in this order against the tax bands, lowest-marginal-first.

1. PAYE income (fills the bands from the bottom).
2. Other self-employment profit.
3. Trading profit from reselling.
4. Savings income.
5. Dividend income (not currently supported by the engine).

This means a reseller with £45,000 of PAYE pay and £10,000 of trading profit pays 40% on most of that trading profit, because the PAYE income has already filled the basic rate band. Naive implementations that compute "trading profit tax in isolation" produce values that are 20 percentage points too low. The engine computes total tax with PAYE alone, then total tax with PAYE + trading profit, and the trading-profit-specific tax is the difference.

```ts
function computeIncomeTaxOnTradingProfit(args: {
  payeIncome: Decimal; otherIncome: Decimal; tradingProfit: Decimal;
  adjustedPA: Decimal; bands: Bands;
}): Decimal {
  const baseIncome = args.payeIncome.plus(args.otherIncome);
  const totalIncome = baseIncome.plus(args.tradingProfit);
  const taxOnBaseAlone = applyBands(baseIncome, args.adjustedPA, args.bands);
  const taxOnTotal     = applyBands(totalIncome, args.adjustedPA, args.bands);
  return taxOnTotal.minus(taxOnBaseAlone);
}
```

### 4.3 Class 4 NIC

```ts
function computeClass4NIC(profit: Decimal, c4: Class4Rates): Decimal {
  const lower = c4.lowerProfitsLimit;   // £12,570
  const upper = c4.upperProfitsLimit;   // £50,270
  if (profit.lte(lower)) return Decimal(0);
  const mainBand = Decimal.min(profit, upper).minus(lower);
  const upperBand = Decimal.max(0, profit.minus(upper));
  return mainBand.times(c4.mainRate).plus(upperBand.times(c4.upperRate));
}
```

## 5. The £1,000 trading allowance toggle

The recommendation logic:

- Compute `profitWithExpenses = turnover - actualAllowableExpenses`.
- Compute `profitWithAllowance = turnover - 1000`.
- Recommend whichever yields the lower profit (and therefore lower tax).
- Show both in the UI side-by-side with a green "recommended" badge.
- Let the user override; the override is stored on `TaxYear.useTradingAllowance`.

Important corner case: if a user has trading turnover ≤ £1,000, **full relief** applies — no SA return needed for this income, and the engine should display this prominently as a "you may not need to file for this income" advisory (without prejudging whether they need to file for other reasons).

## 6. Worked example — accountant audit trail

Inputs (the demo user's 2024/25 scenario, simplified):

- Turnover: £18,500 across 60 sold items (sum of `soldPrice + shippingCharged`).
- Cost of goods sold: £6,200 (sum of `totalCost` for those 60 items).
- Platform + payment + shipping-out + refunds: £2,800.
- General expenses (packaging, mileage, etc.): £900.
- PAYE income from a day job: £32,000.
- Student loan plan: Plan 2.
- Pension contributions: £0.

Step-by-step:

1. Turnover = £18,500.
2. Actual allowable expenses = 6,200 + 2,800 + 900 = £9,900.
3. Trading profit (actual) = 18,500 − 9,900 = **£8,600**.
4. Trading profit (allowance) = 18,500 − 1,000 = £17,500. Actual expenses win; allowance not recommended.
5. Total taxable income = 32,000 + 8,600 = **£40,600**. Below £100k, so adjusted PA = £12,570.
6. Tax on PAYE alone (£32,000): 20% × (32,000 − 12,570) = 20% × 19,430 = £3,886.
7. Tax on total (£40,600): 20% × (40,600 − 12,570) = 20% × 28,030 = £5,606.
8. Tax attributable to trading profit = 5,606 − 3,886 = **£1,720**.
9. Class 4 NIC = 6% × (8,600 − 0) ... wait — Class 4 is on trading profit only and starts at the lower profits limit. Trading profit is £8,600, but only profits *above* £12,570 attract Class 4. Since trading profit alone is £8,600, **Class 4 = £0**. (This is a common point of confusion: PAYE income does not count toward Class 4 thresholds.)
10. Class 2 NIC: trading profit £8,600 is above SPT (£6,725 for 2024/25); Class 2 not required, voluntary if elected — default off → £0.
11. Student loan repayment: Plan 2 threshold for 2024/25 is £27,295. Total income £40,600 means repayment = 9% × (40,600 − 27,295) = 9% × 13,305 = £1,197. **But** only the portion driven by trading profit is attributed to "reselling" in our headline number — the engine shows total student loan due and notes the share attributable to trading. (Some accountants prefer to see the marginal student loan attributable to trading profit: 9% × min(trading profit, total income above threshold) = 9% × 8,600 = £774. The engine shows both figures.)
12. Estimated HMRC liability for reselling activity = £1,720 (income tax) + £0 (Class 4) + £0 (Class 2) + £774 (marginal student loan) = **£2,494**.

A user looking at the tax page sees £2,494 as the headline "estimated tax due on your reselling income" with all the workings exposed in the breakdown table on hover.

### 6.1 What if the trading allowance were taken instead?

Same scenario but with the allowance:

- Trading profit (allowance) = 18,500 − 1,000 = £17,500.
- Total taxable income = 32,000 + 17,500 = £49,500.
- Tax on total = 20% × (49,500 − 12,570) = 20% × 36,930 = £7,386.
- Tax attributable to trading profit = 7,386 − 3,886 = £3,500.
- Class 4 NIC = 6% × (17,500 − 12,570) = 6% × 4,930 = £295.80.
- Student loan (marginal) = 9% × 17,500 = £1,575.
- Estimated HMRC liability = 3,500 + 295.80 + 0 + 1,575 = £5,370.80.

So actual-expenses yields a lower bill by **£2,876.80**. The engine recommends actual expenses and shows the side-by-side comparison.

## 7. SA103 export mapping

The engine produces two CSV mappings — SA103S (short, for turnover < £90k) and SA103F (full). The web app selects the appropriate one based on user turnover and lets the user override.

### 7.1 SA103S (short) mapping — for turnover under £90k

| SA103S Box | Engine field | Meaning |
|---|---|---|
| 9 | turnover | Your turnover — the takings, fees, tips and any other business income |
| 10 | (zero unless overridden) | Any other business income not included in box 9 |
| 20 | allowableExpenses | Total allowable expenses (or £1,000 if trading allowance) |
| 21 | tradingProfit (positive case) | Net profit |
| 22 | tradingProfit (negative case, as positive) | Or net loss |
| 31 | tradingProfit | Total taxable profits from this business |
| 36 | voluntaryClass2 (boolean) | If you wish to voluntarily pay Class 2 NICs |

Source: [SA103S 2024/25 form — assets.publishing.service.gov.uk](https://assets.publishing.service.gov.uk/media/67dd4776c6194abe97358be4/SA103S-2025.pdf).

### 7.2 SA103F (full) mapping — for turnover £90k and above

The full form has more granular boxes for individual expense categories. The engine emits the categorical breakdown:

| SA103F Box | Engine field |
|---|---|
| 15 | turnover |
| 17 | turnover + other income |
| 20 | directItemCosts (cost of goods sold) |
| 22 | directSaleCosts (platform fees etc.) |
| 25 | shippingOutCost portion |
| 27 | generalExpenses.packaging |
| 28 | generalExpenses.subscriptions + office |
| 30 | generalExpenses.other |
| 31 | tradingProfit (net profit) |

Box numbers and rules are reviewed annually when HMRC publishes new forms in late January of each year. When the engine adds support for a new tax year (per §8 below), the mapping is reviewed against the new form.

## 8. Adding a new tax year

The procedure when a new UK Budget changes rates or when April rolls around:

1. **Verify rates from primary sources.** Open `https://www.gov.uk/income-tax-rates`, `https://www.gov.uk/self-employed-national-insurance-rates`, and `https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income`. Record every changed value with the URL and date in your notebook.
2. **Add the year to `packages/core/src/tax/uk-rates.ts`.** A new top-level key keyed by `startYear`. Every field carries a `// source: <URL> verified YYYY-MM-DD` comment.
3. **Add a golden fixture.** Create `packages/core/tests/golden/uk-tax-YYYY-YY.json` with representative inputs and the expected outputs *computed by hand* against the new rates. This is non-negotiable — the golden file is the auditable record of the rates being applied correctly.
4. **Run the suite.** `pnpm test` must pass against all golden fixtures, including prior years (a regression on 2024/25 caused by changes to the rates file should fail loudly).
5. **Add the year to the tax year selector** on `/app/tax`. Update the default-year logic if "today" has crossed 6 April of the new year.
6. **Update the SA103 form mappings** if HMRC has changed box numbers. Diff the new form's box list against the previous year's; usually the structure is stable but small changes happen.
7. **Update this document** to reflect the new year as the canonical example.

## 9. Limitations and explicit non-features

What the engine deliberately does *not* compute, and what the UI says about each:

- **Capital gains tax.** Used items sold for less than they were originally bought for typically have no CGT consequence. Where a reseller is dealing in items that could attract CGT (collectibles, art), the engine does not attempt to compute it and shows an advisory.
- **Marriage Allowance transfer.** The £1,260 transfer is supported via a Tax Settings toggle but not modelled in the spouse's tax — that needs both partners' figures.
- **Dividend income.** Not currently modelled. Most target users are not paying themselves via dividends.
- **Foreign income.** Sales to non-UK buyers are turnover the same as UK sales; the engine does not handle non-GBP currency conversion (everything is stored GBP — see `DECISIONS.md` §4).
- **Making Tax Digital for ITSA.** From April 2026 sole traders with income over £50,000 must use MTD ITSA. The engine does not yet emit MTD-compliant quarterly submissions; this is a roadmap item for a Pro+ feature.

Each of these surfaces a clearly worded note in the relevant area of the UI rather than producing a wrong number silently.
