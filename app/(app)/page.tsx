import Link from 'next/link';
import { Upload, TrendingUp, Boxes, Receipt as ReceiptIcon } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { listItems, listExpenses, getProfile, inDemoMode } from '@/lib/data/items';
import { toTaxItem, toTaxExpense, toPortfolioItem } from '@/lib/data/adapters';
import { computeTaxYear, chooseForm, mapToSa103S, mapToSa103F, getRates } from '@/lib/tax';
import { aggregate } from '@/lib/calc';
import { Sa103Form } from '@/components/sa103-form';
import { KpiCard } from '@/components/kpi-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatGBP } from '@/lib/utils';

/** Helper to compute the current UK tax year start year for "today". */
function currentTaxYearStart(today: Date = new Date()): number {
  // UK tax year starts 6 April. Before 6 April → previous calendar year.
  const y = today.getUTCFullYear();
  const start = new Date(Date.UTC(y, 3, 6));
  return today >= start ? y : y - 1;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

  const [items, expenses, profile] = await Promise.all([
    listItems(userId),
    listExpenses(userId),
    getProfile(userId),
  ]);

  const startYear = currentTaxYearStart();
  const taxItems = items.map(toTaxItem).filter((x): x is NonNullable<typeof x> => x !== null);
  const taxExpenses = expenses.map(toTaxExpense);
  const portfolioItems = items.map(toPortfolioItem);

  const breakdown = computeTaxYear({
    startYear,
    jurisdiction: profile.jurisdiction,
    items: taxItems,
    expenses: taxExpenses,
    payeIncome: profile.payeIncomeAnnual ?? undefined,
    studentLoanPlan: profile.studentLoanPlan,
  });

  const rates = getRates(startYear);
  const form = chooseForm(breakdown, rates.vatThreshold);
  const mapping = form === 'SA103S' ? mapToSa103S(breakdown) : mapToSa103F(breakdown);

  const yearStart = new Date(Date.UTC(startYear, 3, 6));
  const yearEnd = new Date(Date.UTC(startYear + 1, 3, 5));
  const agg = aggregate(portfolioItems, { from: yearStart, to: yearEnd });

  const demo = inDemoMode();

  return (
    <div className="space-y-8">
      {demo && (
        <div className="rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm flex items-center justify-between">
          <span>
            Showing demo data. Set <code className="font-mono text-xs">DATABASE_URL</code> in
            <code className="font-mono text-xs"> .env.local</code> and import your own eBay
            Transaction Report to see your real numbers.
          </span>
          <Button size="sm" variant="outline" asChild>
            <Link href="/app/import">Import CSV</Link>
          </Button>
        </div>
      )}

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tax year {startYear}/{(startYear + 1) % 100} · 6 Apr {startYear} → 5 Apr {startYear + 1}
          </p>
        </div>
        <Badge variant="outline">
          {breakdown.useAllowance ? '£1,000 trading allowance' : 'Actual expenses'} ·
          {breakdown.comparison.recommended === 'ALLOWANCE' ? ' allowance recommended' : ' actual recommended'}
        </Badge>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Turnover"
          value={Number(breakdown.turnover)}
          hint={`${agg.salesCount} sales in year`}
        />
        <KpiCard
          label="Allowable expenses"
          value={Number(breakdown.allowableExpenses)}
          hint={breakdown.useAllowance ? 'Trading allowance' : 'Actual'}
        />
        <KpiCard
          label="Trading profit"
          value={Number(breakdown.tradingProfit)}
          tone={breakdown.tradingProfit.gte(0) ? 'profit' : 'loss'}
          hint="Turnover − allowable expenses"
        />
        <KpiCard
          label="Estimated tax due"
          value={Number(breakdown.totalEstimatedLiability)}
          tone="neutral"
          hint="Income tax + Class 4 NIC + SL"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Sa103Form mapping={mapping} recommendedPath={breakdown.comparison.recommended} />

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-medium">Allowance vs actual</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Side-by-side. We recommend the cheaper option.
            </p>
            <div className="mt-4 space-y-3">
              <Row
                label="Profit with actual expenses"
                value={formatGBP(breakdown.comparison.profitWithExpenses.toFixed(2))}
                active={breakdown.comparison.recommended === 'EXPENSES'}
              />
              <Row
                label="Profit with £1,000 allowance"
                value={formatGBP(breakdown.comparison.profitWithAllowance.toFixed(2))}
                active={breakdown.comparison.recommended === 'ALLOWANCE'}
              />
            </div>
            <div className="mt-5 pt-4 border-t flex flex-col gap-2 text-xs text-muted-foreground">
              <Detail label="Income tax (marginal)" value={formatGBP(breakdown.incomeTax.toFixed(2))} />
              <Detail label="Class 4 NIC" value={formatGBP(breakdown.class4NIC.toFixed(2))} />
              <Detail label="Class 2 NIC" value={formatGBP(breakdown.class2NIC.toFixed(2))} />
              <Detail label="Student loan" value={formatGBP(breakdown.studentLoanRepayment.toFixed(2))} />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium">Portfolio</h3>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <Detail label="Inventory at cost" value={formatGBP(agg.inventoryValueAtCost.toFixed(2))} />
              <Detail label="Inventory at list price" value={formatGBP(agg.inventoryValueAtList.toFixed(2))} />
              <Detail
                label="Sell-through rate"
                value={agg.sellThroughRate ? `${(Number(agg.sellThroughRate) * 100).toFixed(0)}%` : '—'}
              />
              <Detail
                label="Avg hold time"
                value={agg.averageHoldTimeDays != null ? `${Math.round(agg.averageHoldTimeDays)} days` : '—'}
              />
              <Detail
                label="Avg ROI"
                value={agg.averageROI ? `${(Number(agg.averageROI) * 100).toFixed(0)}%` : '—'}
              />
            </div>
          </Card>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <QuickAction href="/app/import" icon={<Upload className="h-4 w-4" />} title="Import another CSV" body="Drop in an eBay Transaction Report." />
        <QuickAction href="/app/inventory" icon={<Boxes className="h-4 w-4" />} title="See inventory" body="Per-item profit, ROI and hold time." />
        <QuickAction href="/app/tax" icon={<ReceiptIcon className="h-4 w-4" />} title="Open tax page" body="Pick a year, export SA103 CSV." />
      </section>
    </div>
  );
}

function Row({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline rounded-md px-2 py-1 ${active ? 'bg-profit/10' : ''}`}>
      <span className="text-xs">{label}</span>
      <span className={`font-mono tabular-nums text-sm ${active ? 'text-profit font-medium' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href}>
      <Card className="p-5 hover:bg-accent/40 transition-colors h-full">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
            {icon}
          </div>
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{body}</p>
      </Card>
    </Link>
  );
}
