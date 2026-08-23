/**
 * The SA103-shaped dashboard component.
 *
 * Renders the tax breakdown as a form: each row mirrors a SA103 box,
 * with the formula visible on hover and a click-to-drill-down affordance.
 *
 * The visual hook: the user sees the actual form they'll eventually file.
 */

import { formatGBP } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Sa103Mapping, Sa103Row } from '@/lib/tax/sa103';

export function Sa103Form({
  mapping,
  recommendedPath,
  className,
}: {
  mapping: Sa103Mapping;
  recommendedPath?: 'ALLOWANCE' | 'EXPENSES';
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="rounded-lg border bg-card overflow-hidden">
        <header className="border-b bg-secondary px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              HMRC Self Assessment — Self Employment
            </p>
            <h2 className="font-semibold mt-1">{mapping.form}</h2>
          </div>
          {recommendedPath && (
            <Badge variant="profit">
              Using {recommendedPath === 'ALLOWANCE' ? '£1,000 trading allowance' : 'actual expenses'}
            </Badge>
          )}
        </header>
        <div className="divide-y">
          {mapping.rows.map((row) => (
            <Sa103Row key={row.box} row={row} />
          ))}
        </div>
        <footer className="border-t bg-secondary/50 px-5 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{mapping.note}</p>
        </footer>
      </div>
    </div>
  );
}

function Sa103Row({ row }: { row: Sa103Row }) {
  return (
    <div className="group grid grid-cols-[80px_1fr_auto] items-baseline gap-4 px-5 py-4 hover:bg-accent/40 transition-colors">
      <div className="font-mono text-xs text-muted-foreground">Box {row.box}</div>
      <div>
        <div className="text-sm font-medium">{row.label}</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-prose leading-relaxed group-hover:text-foreground transition-colors">
          {row.description}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono tabular-nums font-medium">
          {formatGBP(row.value.toFixed(2))}
        </div>
      </div>
    </div>
  );
}
