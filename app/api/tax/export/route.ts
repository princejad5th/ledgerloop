import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase/server';
import { listItems, listExpenses, getProfile } from '@/lib/data/items';
import { toTaxItem, toTaxExpense } from '@/lib/data/adapters';
import {
  computeTaxYear,
  chooseForm,
  mapToSa103S,
  mapToSa103F,
  sa103ToCsv,
  getRates,
} from '@/lib/tax';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') ?? new Date().getUTCFullYear());
  const allowance = searchParams.get('allowance');
  const override = allowance === 'on' ? true : allowance === 'off' ? false : undefined;

  const user = await getCurrentUser();
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

  const [items, expenses, profile] = await Promise.all([
    listItems(userId),
    listExpenses(userId),
    getProfile(userId),
  ]);

  const breakdown = computeTaxYear({
    startYear: year,
    jurisdiction: profile.jurisdiction,
    items: items.map(toTaxItem).filter((x): x is NonNullable<typeof x> => x !== null),
    expenses: expenses.map(toTaxExpense),
    payeIncome: profile.payeIncomeAnnual ?? undefined,
    studentLoanPlan: profile.studentLoanPlan,
    useTradingAllowanceOverride: override,
  });

  const rates = getRates(year);
  const form = chooseForm(breakdown, rates.vatThreshold);
  const mapping = form === 'SA103S' ? mapToSa103S(breakdown) : mapToSa103F(breakdown);
  const csv = sa103ToCsv(mapping);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ledgerloop-${form}-${year}-${year + 1}.csv"`,
    },
  });
}
