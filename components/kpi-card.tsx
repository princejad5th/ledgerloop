import { Card } from '@/components/ui/card';
import { cn, formatGBP } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'profit' | 'loss' | 'neutral';
  className?: string;
}) {
  const numericFormatted = typeof value === 'number' ? formatGBP(value) : value;
  return (
    <Card className={cn('p-5', className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'mt-2 font-mono tabular-nums text-2xl font-semibold',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
        )}
      >
        {numericFormatted}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
