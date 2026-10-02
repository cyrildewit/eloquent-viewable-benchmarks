/**
 * The compact form of every run that the browser pages load as /data/index.json, and the series a run belongs to.
 * Built from the result files at build time; everything here also runs in the browser, so it imports types only.
 */
import type { Driver } from './drivers.ts';
import { compareRuns } from './refs.ts';
import type { Result } from './schema.ts';

/** The order subject groups are shown in. */
export const GROUP_ORDER = ['read', 'write', 'php'];

export interface RunSummary {
  id: string;
  ref: string;
  kind: Result['kind'];
  commit: string;
  committed_at: string;
  ran_at: string;
  runner: string;
  label: string;
  driver: Driver;
  size: Result['dataset']['size'];
  indexes: string;
  schema: number;
  php: string;
  laravel: string;
  database: string;
  image: string | null;
  phpbench: string;
  series: string;
  errors: number;
  /** Whether the run was imported with the SQL of its queries. */
  hasQueries: boolean;
}

export interface SubjectInfo {
  key: string;
  benchmark: string;
  subject: string;
  set: string;
  groups: string[];
}

export interface IndexedRun extends RunSummary {
  /** Mode in microseconds per subject, aligned with `IndexData.subjects`; null where the run lacks the subject. */
  modes: (number | null)[];
  /** Relative standard deviation in percent, aligned the same way. */
  rstdevs: (number | null)[];
}

export interface IndexData {
  subjects: SubjectInfo[];
  /** Ordered by series, then along the trend. */
  runs: IndexedRun[];
}

export interface Measurement {
  mode: number;
  rstdev: number;
}

export interface SeriesParts {
  runner: string;
  driver: string;
  size: string;
  indexes: string;
  schema: number;
}

/** Which subject a measurement is of, the same in every run: `CountViewsBench::benchCount::hot article,all time`. */
export function subjectKey(subject: { benchmark: string; subject: string; set: string }): string {
  return `${subject.benchmark}::${subject.subject}::${subject.set}`;
}

/** Runs whose numbers may share a line: `gha/mysql/medium/none/1`. */
export function seriesKey(parts: SeriesParts): string {
  return `${parts.runner}/${parts.driver}/${parts.size}/${parts.indexes}/${parts.schema}`;
}

export function parseSeriesKey(key: string): SeriesParts {
  const [runner = '', driver = '', size = '', indexes = '', schema = '0'] = key.split('/');

  return { runner, driver, size, indexes, schema: Number(schema) };
}

export function summarise(result: Result): RunSummary {
  const parts = {
    runner: result.runner,
    driver: result.database.driver,
    size: result.dataset.size,
    indexes: result.dataset.indexes,
    schema: result.dataset.schema_version,
  };

  return {
    id: result.id,
    ref: result.ref,
    kind: result.kind,
    commit: result.commit,
    committed_at: result.committed_at,
    ran_at: result.ran_at,
    runner: result.runner,
    label: result.machine.label,
    driver: result.database.driver,
    size: result.dataset.size,
    indexes: result.dataset.indexes,
    schema: result.dataset.schema_version,
    php: result.php.version,
    laravel: result.laravel,
    database: result.database.server_version,
    image: result.database.image,
    phpbench: result.phpbench,
    series: seriesKey(parts),
    errors: result.errors.length,
    hasQueries: result.queries !== null,
  };
}

/** Every run, sorted by series and along the trend, with its measurements aligned to one list of subjects. */
export function buildIndex(results: Result[]): IndexData {
  const ordered = [...results].sort((a, b) => {
    const left = summarise(a);
    const right = summarise(b);

    return left.series.localeCompare(right.series) || compareRuns(left, right);
  });

  // Subjects in the order of the newest run, then any that only older runs have.
  const newestFirst = [...results].sort((a, b) => b.ran_at.localeCompare(a.ran_at));
  const subjects = new Map<string, SubjectInfo>();
  for (const result of newestFirst) {
    for (const subject of result.subjects) {
      const key = subjectKey(subject);
      if (!subjects.has(key)) {
        subjects.set(key, {
          key,
          benchmark: subject.benchmark,
          subject: subject.subject,
          set: subject.set,
          groups: subject.groups,
        });
      }
    }
  }
  // Reading first, the paths most people care about, then writing, then the PHP-only groups.
  const rank = (subject: SubjectInfo) =>
    Math.min(...subject.groups.map((group) => GROUP_ORDER.indexOf(group)).filter((at) => at >= 0), GROUP_ORDER.length);
  const orderedSubjects = [...subjects.values()]
    .map((subject, at) => ({ subject, at }))
    .sort((a, b) => rank(a.subject) - rank(b.subject) || a.at - b.at)
    .map(({ subject }) => subject);
  const keys = orderedSubjects.map((subject) => subject.key);

  return {
    subjects: orderedSubjects,
    runs: ordered.map((result) => {
      const byKey = new Map(result.subjects.map((subject) => [subjectKey(subject), subject]));

      return {
        ...summarise(result),
        modes: keys.map((key) => byKey.get(key)?.mode_us ?? null),
        rstdevs: keys.map((key) => byKey.get(key)?.rstdev ?? null),
      };
    }),
  };
}

/** A run's measurements by subject key. */
export function measurements(index: IndexData, run: IndexedRun): Map<string, Measurement> {
  const result = new Map<string, Measurement>();
  index.subjects.forEach((subject, i) => {
    const mode = run.modes[i];
    const rstdev = run.rstdevs[i];
    if (mode !== null && mode !== undefined && rstdev !== null && rstdev !== undefined) {
      result.set(subject.key, { mode, rstdev });
    }
  });

  return result;
}

/** The runs of one series along the trend, keeping only the newest run of each ref. */
export function latestPerRef<T extends RunSummary>(runs: T[]): T[] {
  const newest = new Map<string, T>();
  for (const run of runs) {
    const seen = newest.get(run.ref);
    if (seen === undefined || run.ran_at > seen.ran_at) {
      newest.set(run.ref, run);
    }
  }

  return [...newest.values()].sort(compareRuns);
}

/**
 * The series the site leads with: GitHub Actions at the medium size without optional indexes, on the newest dataset
 * schema. When no such run exists yet, the series of whatever ran most recently.
 */
export function referenceSeries(runs: RunSummary[], driver?: string): SeriesParts | null {
  const candidates = runs.filter((run) => driver === undefined || run.driver === driver);
  if (candidates.length === 0) {
    return null;
  }

  const schema = Math.max(...candidates.map((run) => run.schema));
  const preferred = candidates.filter(
    (run) => run.runner === 'gha' && run.size === 'medium' && run.indexes === 'none' && run.schema === schema,
  );
  const pool = preferred.length > 0 ? preferred : candidates;
  const newest = pool.reduce((a, b) => (b.ran_at > a.ran_at ? b : a));

  return parseSeriesKey(newest.series);
}

/** `GitHub Actions · MySQL · medium`, with the indexes when there are any. */
export function seriesLabel(parts: SeriesParts, driverLabels: Record<string, string>): string {
  const runner = parts.runner === 'gha' ? 'GitHub Actions' : parts.runner;
  const indexes = parts.indexes === 'none' ? '' : ` · indexes ${parts.indexes}`;

  return `${runner} · ${driverLabels[parts.driver] ?? parts.driver} · ${parts.size}${indexes}`;
}
