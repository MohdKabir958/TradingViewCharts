/** Server-side limits for public API routes (abuse / accidental huge requests). */
export const MAX_CHART_SYMBOLS = 32;
export const MAX_SYMBOL_LENGTH = 24;
export const MAX_SEARCH_QUERY_LENGTH = 80;

const SYMBOL_PATTERN = /^[A-Z0-9.\-^]+$/i;

export function parseChartSymbols(param: string | null, fallback: string[]): string[] {
  const raw = param
    ? param
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [...fallback];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (s.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_CHART_SYMBOLS) break;
  }
  return out;
}
