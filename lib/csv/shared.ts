/**
 * Shared CSV helpers used by every platform parser.
 * Header matching is intentionally lenient — sources vary across exports.
 */

import Decimal from 'decimal.js';

/** Returns the value for the first matching header, case-insensitive. */
export function pickHeader(row: Record<string, string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (row[c] != null && row[c] !== '') return row[c];
  }
  // Case-insensitive fallback
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );
  for (const c of candidates) {
    const v = lower[c.toLowerCase().trim()];
    if (v != null && v !== '') return v;
  }
  return null;
}

/** Parse a string like "12.50", "-2.99", "£1,234.56" as a Decimal. Returns null on failure. */
export function parseDecimal(input: string | null | undefined): Decimal | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  // Strip currency symbols, commas, parentheses (sometimes used for negatives), and whitespace.
  const isParenNegative = /^\(.+\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/[£$€\s,()]/g, '')
    .replace(/^-+/, '-');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  try {
    let d = new Decimal(cleaned);
    if (isParenNegative) d = d.negated();
    return d;
  } catch {
    return null;
  }
}

/** Parse a date in common formats. Handles "YYYY-MM-DD", "DD/MM/YYYY", "DD MMM YYYY", ISO 8601. */
export function parseFlexibleDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ISO 8601 with T
  if (trimmed.includes('T')) {
    const iso = new Date(trimmed);
    return isNaN(iso.getTime()) ? null : iso;
  }
  // ISO-ish "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(trimmed)) {
    const iso = new Date(trimmed.replace(' ', 'T') + (trimmed.includes('Z') ? '' : 'Z'));
    if (!isNaN(iso.getTime())) return iso;
  }
  // Plain "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = new Date(trimmed + 'T00:00:00Z');
    if (!isNaN(iso.getTime())) return iso;
  }
  // UK "DD/MM/YYYY"
  const ukMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ukMatch) {
    const [, d, m, y] = ukMatch;
    const iso = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (!isNaN(iso.getTime())) return iso;
  }
  // US "MM/DD/YYYY" — disambiguate by month value being > 12
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, a, b, y] = usMatch;
    // Only treat as MM/DD/YYYY if the first part can't be a day > 12
    if (parseInt(a, 10) <= 12 && parseInt(b, 10) > 12) {
      const iso = new Date(`${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}T00:00:00Z`);
      if (!isNaN(iso.getTime())) return iso;
    }
  }
  // "DD MMM YYYY" or "MMM DD, YYYY" → let Date handle it as a last resort.
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}
