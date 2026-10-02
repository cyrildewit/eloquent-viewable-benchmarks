/**
 * The last point of a trend as tables: for one benchmark, every subject's parameter sets against the databases, each
 * cell the measurement of the latest release or weekly run. Pure, so it runs in the browser and in tests.
 */
import type { IndexedRun, SubjectInfo } from './data.ts';
import type { Driver } from './drivers.ts';
import type { Trend } from './trends.ts';

export interface SnapshotCell {
  run: IndexedRun;
  mode: number;
  rstdev: number;
}

export interface SnapshotRow {
  subject: SubjectInfo;
  /** One per driver in `Snapshot.drivers`; null where that database has no run at the point or lacks the subject. */
  cells: (SnapshotCell | null)[];
}

export interface Snapshot {
  /** The point the tables show, null when the trend is empty. */
  point: Trend['categories'][number] | null;
  drivers: Driver[];
  /** One table per subject method, in index order, with its parameter sets as rows. */
  tables: { subject: string; rows: SnapshotRow[] }[];
}

export function latestPoint(trend: Trend, subjects: { subject: SubjectInfo; position: number }[]): Snapshot {
  const at = trend.categories.length - 1;
  const point = trend.categories[at] ?? null;
  const tables = new Map<string, SnapshotRow[]>();
  if (point === null) {
    return { point, drivers: [], tables: [] };
  }

  for (const { subject, position } of subjects) {
    const cells = trend.lines.map((line) => {
      const run = line.runs[at];
      const mode = run?.modes[position];
      const rstdev = run?.rstdevs[position];
      if (!run || typeof mode !== 'number' || typeof rstdev !== 'number') {
        return null;
      }

      return { run, mode, rstdev };
    });
    tables.set(subject.subject, [...(tables.get(subject.subject) ?? []), { subject, cells }]);
  }

  return {
    point,
    drivers: trend.lines.map((line) => line.driver),
    tables: [...tables].map(([subject, rows]) => ({ subject, rows })),
  };
}
