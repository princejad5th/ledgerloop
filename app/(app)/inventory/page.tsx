import { getCurrentUser } from '@/lib/supabase/server';
import { listItems } from '@/lib/data/items';
import { toPortfolioItem } from '@/lib/data/adapters';
import { profit, roi, holdTimeDays, totalCost } from '@/lib/calc';
import { formatGBP, formatDate, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const STATUS_VARIANT = {
  DRAFT: 'outline',
  IN_STOCK: 'secondary',
  LISTED: 'default',
  SOLD: 'profit',
  RETURNED: 'loss',
  DELISTED: 'outline',
} as const;

export default async function InventoryPage() {
  const user = await getCurrentUser();
  const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';
  const items = await listItems(userId);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} items · per-item profit, ROI and hold time.
          </p>
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-3">SKU / Title</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Cost</th>
                <th className="text-right font-medium px-4 py-3">Listed</th>
                <th className="text-right font-medium px-4 py-3">Sold</th>
                <th className="text-right font-medium px-4 py-3">Profit</th>
                <th className="text-right font-medium px-4 py-3">ROI</th>
                <th className="text-right font-medium px-4 py-3">Hold</th>
                <th className="text-left font-medium px-4 py-3">Sold at</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row) => {
                const item = toPortfolioItem(row);
                const p = profit(item);
                const r = roi(item);
                const h = holdTimeDays(item);
                const cost = totalCost(item);
                return (
                  <tr key={row.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{row.title}</div>
                      <div className="font-mono text-xs text-muted-foreground mt-0.5">
                        {row.sku ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono tabular-nums">
                      {formatGBP(cost.toFixed(2))}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono tabular-nums text-muted-foreground">
                      {row.listedPrice ? formatGBP(row.listedPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono tabular-nums">
                      {row.soldPrice ? formatGBP(row.soldPrice) : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 align-top text-right font-mono tabular-nums',
                        row.status === 'SOLD' && p.gte(0) && 'text-profit',
                        row.status === 'SOLD' && p.lt(0) && 'text-loss',
                      )}
                    >
                      {row.status === 'SOLD' ? formatGBP(p.toFixed(2)) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono tabular-nums text-muted-foreground">
                      {r ? `${(Number(r) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono tabular-nums text-muted-foreground">
                      {h != null ? `${h}d` : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground text-xs">
                      {row.soldAt ? formatDate(row.soldAt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
