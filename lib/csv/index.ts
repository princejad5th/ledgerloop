/**
 * Multi-platform CSV parser dispatcher.
 *
 * Given a CSV's parsed rows (from PapaParse with header: true), detect which
 * marketplace produced it and route to the right parser. The user can also
 * force a specific platform via the second arg if auto-detection is unsure.
 */

import type { ParseResult, SupportedPlatform } from './types';
import { parseEbay, EBAY_SIGNATURE_HEADERS } from './parsers/ebay';
import { parseEtsy, ETSY_SIGNATURE_HEADERS } from './parsers/etsy';
import { parseDepop, DEPOP_SIGNATURE_HEADERS } from './parsers/depop';

export * from './types';
export { parseEbay, parseEtsy, parseDepop };
export { pickHeader, parseDecimal, parseFlexibleDate } from './shared';

/** Backwards-compat alias so existing callers keep working. */
export { parseEbay as parseEbayTransactionReport };

/**
 * Pick the parser whose signature headers best match the file. The detection
 * is intentionally simple — count how many "signature" headers are present
 * for each platform and pick the winner. Ties broken by precedence: eBay > Etsy > Depop.
 */
export function detectPlatform(headers: string[]): SupportedPlatform | null {
  if (headers.length === 0) return null;
  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
  const score = (sig: string[]) =>
    sig.reduce((n, h) => n + (lower.has(h.toLowerCase()) ? 1 : 0), 0);

  const scores: Array<[SupportedPlatform, number]> = [
    ['EBAY',  score(EBAY_SIGNATURE_HEADERS)],
    ['ETSY',  score(ETSY_SIGNATURE_HEADERS)],
    ['DEPOP', score(DEPOP_SIGNATURE_HEADERS)],
  ];
  scores.sort((a, b) => b[1] - a[1]);

  // Require at least one signature header to match.
  if (scores[0][1] === 0) return null;
  return scores[0][0];
}

/**
 * Top-level parser. Auto-detects the platform unless one is forced.
 */
export function parseCsv(
  rows: Record<string, string>[],
  forcedPlatform?: SupportedPlatform,
): ParseResult {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const platform = forcedPlatform ?? detectPlatform(headers);

  if (platform === 'EBAY')  return parseEbay(rows);
  if (platform === 'ETSY')  return parseEtsy(rows);
  if (platform === 'DEPOP') return parseDepop(rows);

  return {
    platform: null,
    items: [],
    transactions: [],
    unmatched: rows.map((row, idx) => ({
      rowNumber: idx + 1,
      reason: 'Could not detect marketplace from column headers',
      raw: row,
    })),
    headers,
  };
}
