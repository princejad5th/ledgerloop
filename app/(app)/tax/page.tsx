import Link from 'next/link';
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
  listSupportedTaxYears,
} from '@/lib/tax';
import { Sa103Form } from '@/components/sa103-form';
import { KpiCard } from '@/components/kpi-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatGBP } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ year?: string; allowance?: string }>;
}

export default async function TaxPage({ searchParams }: PageProps) {
  const { year, allowance } = await searchParams;
  const user = await getCurrentUser();
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

  const supportedYears = listSupportedTaxYears();
  const startYear = year ? Number(year) : supportedYears[supportedYears.length - 1];
  const allowanceOverride = allowance === 'on' ? true : allowance === 'off' ? false : undefined;

  const [items, expenses, profile] = await Promise.all([
    listItems(userId),
    listExpenses(userId),
    getProfile(userId),
  ]);

  const taxItems = items.map(toTaxItem).filter((x): x is NonNullable<typeof x> => x !== null);
  const taxExpenses = expenses.map(toTaxExpense);

  const breakdown = computeTaxYear({
    startYear,
    jurisdiction: profile.jurisdiction,
    items: taxItems,
    expenses: taxExpenses,
    payeIncome: profile.payeIncomeAnnual ?? undefined,
    studentLoanPlan: profile.studentLoanPlan,
    useTradingAllowanceOverride: allowanceOverride,
  });

  const rates = getRates(startYear);
  const form = chooseForm(breakdown, rates.vatThreshold);
  const mapping = form === 'SA103S' ? mapToSa103S(breakdown) : mapToSa103F(breakdown);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tax</h1>
          <p className="text-sm text-muted-foreground mt-1">
            UK Self Assessment estimate · {form} ·{' '}
            {profile.jurisdiction === 'SCOTLAND' ? 'Scottish rates' : 'rest of UK rates'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {supportedYears.map((y) => (
            <Link
              key={y}
              href={`/app/tax?year=${y}${allowance ? `&allowance=${allowance}` : ''}`}
              className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                y === startYear ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {y}/{(y + 1) % 100}
            </Link>
          ))}
        </div>
      </header>

      {breakdown.flags.overVatThreshold && (
        <div className="rounded-md border border-loss/40 bg-loss/5 px-4 py-3 text-sm">
          Turnover exceeds the £{Number(rates.vatThreshold).toLocaleString('en-GB')} VAT registration threshold.
          You must register for VAT with HMRC.
        </div>
      )}
      {!breakdown.flags.overVatThreshold && breakdown.flags.nearVatThreshold && (
        <div className="rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm">
          You're within 10% of the VAT registration threshold (£
          {Number(rates.vatThreshold).toLocaleString('en-GB')}). Watch your rolling 12-month turnover.
        </div>
      )}
      {breakdown.fullReliefAvailable && (
        <div className="rounded-md border border-profit/40 bg-profit/5 px-4 py-3 text-sm">
          Your turnover is under the £1,000 trading allowance — you may not need to file an SA return for this income.
          Verify with HMRC if you have other reasons to file.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Turnover" value={Number(breakdown.turnover)} />
        <KpiCard label="Allowable expenses" value={Number(breakdown.allowableExpenses)} />
        <KpiCard
          label="Trading profit"
          value={Number(breakdown.tradingProfit)}
          tone={breakdown.tradingProfit.gte(0) ? 'profit' : 'loss'}
        />
        <KpiCard label="Estimated tax due" value={Number(breakdown.totalEstimatedLiability)} />
      </section>

      <Card className="p-5">
        <h3 className="text-sm font-medium">Trading allowance vs actual expenses</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-prose">
          You can deduct your actual allowable expenses OR claim a flat £1,000 trading allowance.
          We pick the lower-tax option for you; you can override below.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ScenarioCard
            label="Actual expenses"
            profit={breakdown.comparison.profitWithExpenses.toFixed(2)}
            recommended={breakdown.comparison.recommended === 'EXPENSES'}
            href={`/app/tax?year=${startYear}&allowance=off`}
            active={!breakdown.useAllowance}
          />
          <ScenarioCard
            label="£1,000 trading allowance"
            profit={breakdown.comparison.profitWithAllowance.toFixed(2)}
            recommended={breakdown.comparison.recommended === 'ALLOWANCE'}
            href={`/app/tax?year=${startYear}&allowance=on`}
            active={breakdown.useAllowance}
          />
        </div>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Sa103Form mapping={mapping} recommendedPath={breakdown.comparison.recommended} />

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-medium">Breakdown</h3>
            <div className="mt-4 space-y-2 text-xs">
              <DetailRow label="Cost of goods sold" value={formatGBP(breakdown.costOfGoodsSold.toFixed(2))} />
              <DetailRow label="Direct sale costs" value={formatGBP(breakdown.directSaleCosts.toFixed(2))} />
              <DetailRow label="General expenses" value={formatGBP(breakdown.generalExpenses.toFixed(2))} />
              <div className="border-t my-2" />
              <DetailRow label="Adjusted personal allowance" value={formatGBP(breakdown.adjustedPersonalAllowance.toFixed(2))} />
              <DetailRow label="Income tax (marginal)" value={formatGBP(breakdown.incomeTax.toFixed(2))} />
              <DetailRow label="Class 4 NIC" value={formatGBP(breakdown.class4NIC.toFixed(2))} />
              <DetailRow label="Class 2 NIC" value={formatGBP(breakdown.class2NIC.toFixed(2))} />
              <DetailRow label="Student loan repayment" value={formatGBP(breakdown.studentLoanRepayment.toFixed(2))} />
              <div className="border-t my-2" />
              <DetailRow label="Total estimated liability" value={formatGBP(breakdown.totalEstimatedLiability.toFixed(2))} bold />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium">Exports</h3>
            <p className="text-xs text-muted-foreground mt-1">
              CSV your accountant will recognise.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <ExportButton form={form} year={startYear} allowance={allowance} />
              <Button variant="outline" size="sm" disabled className="justify-start">
                PDF report (coming in v1.1)
              </Button>
            </div>
          </Card>
        </aside>
      </section>

      <p className="text-xs text-muted-foreground max-w-prose leading-relaxed">
        These figures are estimates. LedgerLoop is not a regulated tax advisor.
        Verify with HMRC or a qualified accountant before submitting your Self
        Assessment return.
      </p>
    </div>
  );
}

function ScenarioCard({
  label,
  profit,
  recommended,
  href,
  active,
}: {
  label: string;
  profit: string;
  recommended: boolean;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md border p-4 transition-colors ${
        active ? 'border-foreground bg-accent/30' : 'hover:bg-accent/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {recommended && <Badge variant="profit">Recommended</Badge>}
      </div>
      <div className="mt-2 font-mono tabular-nums text-xl font-semibold">
        {formatGBP(profit)}
      </div>
      <p className="text-xs text-muted-foreground mt-1">Trading profit under this option</p>
    </Link>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-medium' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'text-foreground' : ''}`}>{value}</span>
    </div>
  );
}

function ExportButton({ form, year, allowance }: { form: string; year: number; allowance?: string }) {
  const params = new URLSearchParams({ year: String(year) });
  if (allowance) params.set('allowance', allowance);
  return (
    <Button asChild size="sm" className="justify-start">
      <a href={`/api/tax/export?${params.toString()}`}>Download {form} CSV</a>
    </Button>
  );
}
