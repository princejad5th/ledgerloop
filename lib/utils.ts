import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Decimal-compatible value as GBP for UI display. */
export function formatGBP(value: number | string, opts?: { showSign?: boolean }): string {
  const n = typeof value === 'string' ? Number(value) : value;
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatted = formatter.format(Math.abs(n));
  if (opts?.showSign && n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

/** Format an ISO date as DD MMM YYYY in en-GB. */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
