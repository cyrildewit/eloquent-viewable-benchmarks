/**
 * The shape of the trend charts: which points go along the x axis, which run sits at each point for each driver, and
 * where PHP or Laravel changed version. Pure, so it runs in the browser and in tests.
 */
import type { IndexData, IndexedRun } from './data.ts';
import { DRIVER_ORDER, type Driver } from './drivers.ts';
import { formatDate } from './format.ts';
import { compareVersions } from './refs.ts';

export interface TrendFilter {
  runner: string;
  size: string;
  indexes: string;
  /** Along the releases, or along the runs of a branch, one point per day and commit. */
  view: 'releases' | 'branch';
}

export interface Trend {
  categories: { key: string; label: string }[];
  lines: { driver: Driver; runs: (IndexedRun | null)[] }[];
  /** Points where PHP or Laravel changed against the point before, with what it changed to. */
  markers: { index: number; text: string }[];
  /** The dataset schema shown; runs on an older one belong to another series and are left out. */
  schema: number | null;
}

export function buildTrend(index: IndexData, filter: TrendFilter): Trend {
  const matching = index.runs.filter(
    (run) =>
      run.runner === filter.runner &&
      run.size === filter.size &&
      run.indexes === filter.indexes &&
      (filter.view === 'releases') === (run.kind === 'release'),
  );
  if (matching.length === 0) {
    return { categories: [], lines: [], markers: [], schema: null };
  }

  const schema = Math.max(...matching.map((run) => run.schema));
  const runs = matching.filter((run) => run.schema === schema);
  // Two commits run on one day stay two points, and a commit run again a week later is a new point.
  const keyOf = (run: IndexedRun) =>
    filter.view === 'releases' ? run.ref : `${run.ran_at.slice(0, 10)}_${run.commit.slice(0, 7)}`;

  const firstRan = new Map<string, string>();
  for (const run of runs) {
    const key = keyOf(run);
    const seen = firstRan.get(key);
    if (seen === undefined || run.ran_at < seen) {
      firstRan.set(key, run.ran_at);
    }
  }
  const byRun = (a: string, b: string) => (firstRan.get(a) ?? '').localeCompare(firstRan.get(b) ?? '');
  const keys = [...firstRan.keys()].sort(filter.view === 'releases' ? compareVersions : byRun);
  const position = new Map(keys.map((key, i) => [key, i]));

  const lines = DRIVER_ORDER.flatMap((driver) => {
    const own = runs.filter((run) => run.driver === driver);
    if (own.length === 0) {
      return [];
    }
    const slots: (IndexedRun | null)[] = keys.map(() => null);
    for (const run of own) {
      const at = position.get(keyOf(run)) ?? -1;
      const seen = slots[at];
      if (at >= 0 && (seen === null || seen === undefined || run.ran_at > seen.ran_at)) {
        slots[at] = run;
      }
    }

    return [{ driver, runs: slots }];
  });

  const representative = (at: number) => lines.map((line) => line.runs[at]).find((run) => run) ?? null;
  const markers: Trend['markers'] = [];
  for (let at = 1; at < keys.length; at++) {
    const before = representative(at - 1);
    const now = representative(at);
    if (before === null || now === null) {
      continue;
    }
    const changes = [
      now.php !== before.php ? `PHP ${now.php}` : null,
      now.laravel !== before.laravel ? `Laravel ${now.laravel}` : null,
    ].filter((change) => change !== null);
    if (changes.length > 0) {
      markers.push({ index: at, text: changes.join(' · ') });
    }
  }

  return {
    categories: keys.map((key) => ({
      key,
      label: filter.view === 'releases' ? key : branchLabel(key),
    })),
    lines,
    markers,
    schema,
  };
}

/** `2026-10-03_10b5b1e` → `3 Oct · 10b5b1e`. */
function branchLabel(key: string): string {
  const [day, commit] = key.split('_');

  return `${formatDate(`${day}T00:00:00Z`).replace(/ \d{4}$/, '')} · ${commit}`;
}
