/**
 * Comparing two runs subject by subject. The base is the run compared against, the head the run being judged.
 */
import type { Measurement } from './data.ts';

export type Verdict = 'faster' | 'slower' | 'noise' | 'added' | 'removed';

export interface ComparisonRow {
  key: string;
  base: Measurement | null;
  head: Measurement | null;
  /** Head against base, in percent: positive is slower. Null when either side lacks the subject. */
  change: number | null;
  /** The smallest change, in percent, that counts as real for this subject. */
  threshold: number | null;
  verdict: Verdict;
}

export type Summary = Record<Verdict, number>;

/** No difference under 5% is trusted, and none under twice the two runs' combined deviation. */
export const MIN_THRESHOLD = 5;

export function noiseThreshold(base: Measurement, head: Measurement): number {
  return Math.max(MIN_THRESHOLD, 2 * Math.hypot(base.rstdev, head.rstdev));
}

/**
 * @param keys the subjects to compare, in display order; subjects in neither run are skipped
 */
export function compare(
  base: Map<string, Measurement>,
  head: Map<string, Measurement>,
  keys: readonly string[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  for (const key of keys) {
    const before = base.get(key) ?? null;
    const after = head.get(key) ?? null;

    if (before === null && after === null) {
      continue;
    }
    if (before === null || after === null) {
      rows.push({
        key,
        base: before,
        head: after,
        change: null,
        threshold: null,
        verdict: before === null ? 'added' : 'removed',
      });
      continue;
    }

    const change = before.mode === 0 ? 0 : ((after.mode - before.mode) / before.mode) * 100;
    const threshold = noiseThreshold(before, after);

    rows.push({
      key,
      base: before,
      head: after,
      change,
      threshold,
      verdict: Math.abs(change) < threshold ? 'noise' : change > 0 ? 'slower' : 'faster',
    });
  }

  return rows;
}

export function summariseComparison(rows: readonly ComparisonRow[]): Summary {
  const summary: Summary = { faster: 0, slower: 0, noise: 0, added: 0, removed: 0 };
  for (const row of rows) {
    summary[row.verdict]++;
  }

  return summary;
}

/** The rows that changed beyond noise, largest change first. */
export function largestChanges(rows: readonly ComparisonRow[], limit: number): ComparisonRow[] {
  return rows
    .filter((row) => row.verdict === 'faster' || row.verdict === 'slower')
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
    .slice(0, limit);
}
