/**
 * SA103 mapping. Produces both SA103S (short, turnover < £90k) and SA103F
 * (full) field maps. The web app picks one based on turnover.
 *
 * Box numbers are sourced from the published 2024/25 HMRC forms:
 * - SA103S: https://assets.publishing.service.gov.uk/media/67dd4776c6194abe97358be4/SA103S-2025.pdf
 * - SA103F: https://assets.publishing.service.gov.uk/media/67dbece80298101d2d67118f/SA103F_2025.pdf
 *
 * When HMRC publishes updated forms each January, diff against the prior
 * year's PDF and update the mappings here.
 */

import Decimal from 'decimal.js';
import type { TaxBreakdown } from './types';

export type Sa103Form = 'SA103S' | 'SA103F';

export interface Sa103Row {
  box: string;
  label: string;
  value: Decimal;
  /** Plain-English explanation shown on hover in the UI. */
  description: string;
}

export interface Sa103Mapping {
  form: Sa103Form;
  rows: Sa103Row[];
  note: string;
}

/** Pick the right form based on turnover vs the VAT threshold. */
export function chooseForm(breakdown: TaxBreakdown, vatThreshold: Decimal): Sa103Form {
  return breakdown.turnover.gte(vatThreshold) ? 'SA103F' : 'SA103S';
}

export function mapToSa103S(breakdown: TaxBreakdown): Sa103Mapping {
  const zero = new Decimal(0);
  const tradingProfit = breakdown.tradingProfit;
  const isProfit = tradingProfit.gte(zero);
  return {
    form: 'SA103S',
    note:
      'These figures are estimates. LedgerLoop is not a regulated tax advisor. ' +
      'Verify with HMRC or a qualified accountant before submitting.',
    rows: [
      {
        box: '9',
        label: 'Your turnover',
        value: breakdown.turnover,
        description:
          'Total takings: sale prices plus any shipping charged to buyers. Includes only items sold within the tax year.',
      },
      {
        box: '10',
        label: 'Any other business income not included in box 9',
        value: zero,
        description: 'LedgerLoop does not currently populate this box.',
      },
      {
        box: '20',
        label: 'Total allowable expenses',
        value: breakdown.allowableExpenses,
        description: breakdown.useAllowance
          ? 'Using the £1,000 trading allowance.'
          : 'Actual allowable expenses: cost of goods sold + platform/payment fees + outbound shipping + refunds + general expenses.',
      },
      {
        box: '21',
        label: 'Net profit',
        value: isProfit ? tradingProfit : zero,
        description: 'Turnover − allowable expenses, if positive.',
      },
      {
        box: '22',
        label: 'Or net loss',
        value: isProfit ? zero : tradingProfit.abs(),
        description: 'Turnover − allowable expenses, expressed as a positive figure if negative.',
      },
      {
        box: '31',
        label: 'Total taxable profits from this business',
        value: isProfit ? tradingProfit : zero,
        description: 'Same as box 21 for most cases. Adjusts only if you have specific HMRC overrides.',
      },
    ],
  };
}

export function mapToSa103F(breakdown: TaxBreakdown): Sa103Mapping {
  const zero = new Decimal(0);
  return {
    form: 'SA103F',
    note:
      'These figures are estimates. LedgerLoop is not a regulated tax advisor. ' +
      'Verify with HMRC or a qualified accountant before submitting.',
    rows: [
      {
        box: '15',
        label: 'Your turnover',
        value: breakdown.turnover,
        description: 'Total takings including any shipping charged to buyers.',
      },
      {
        box: '17',
        label: 'Total business income',
        value: breakdown.turnover,
        description: 'LedgerLoop maps turnover only; add any other business income manually.',
      },
      {
        box: '20',
        label: 'Cost of goods bought for resale',
        value: breakdown.costOfGoodsSold,
        description: 'Sum of purchase price + inbound shipping + prep cost across all items sold.',
      },
      {
        box: '22',
        label: 'Wages, salaries and other staff costs',
        value: zero,
        description: 'LedgerLoop does not currently populate this box.',
      },
      {
        box: '25',
        label: 'Carriage, freight and travel',
        value: breakdown.directSaleCosts,
        description: 'Outbound shipping costs to fulfil sales. Also captures platform & payment fees as direct selling costs.',
      },
      {
        box: '30',
        label: 'Other allowable business expenses',
        value: breakdown.generalExpenses,
        description: 'General expenses categorised as MILEAGE / PACKAGING / SUBSCRIPTION / OFFICE / OTHER.',
      },
      {
        box: '31',
        label: 'Total allowable expenses',
        value: breakdown.allowableExpenses,
        description: 'Sum of boxes 20–30.',
      },
      {
        box: '32',
        label: 'Net profit',
        value: breakdown.tradingProfit.gte(zero) ? breakdown.tradingProfit : zero,
        description: 'Turnover − allowable expenses, if positive.',
      },
    ],
  };
}

/** Produce SA103 CSV content (UTF-8, with a disclaimer header row). */
export function sa103ToCsv(mapping: Sa103Mapping): string {
  const lines: string[] = [];
  lines.push(`"${mapping.note}"`);
  lines.push(`"Form","Box","Label","Value (GBP)","Description"`);
  for (const row of mapping.rows) {
    const cells = [
      mapping.form,
      row.box,
      row.label,
      row.value.toFixed(2),
      row.description,
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}
