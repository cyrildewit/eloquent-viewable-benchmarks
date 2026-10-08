/**
 * Which SQL a benchmark page shows: for the reference series, the latest release per database that was imported
 * with queries, its statements and plans per subject, and whether the plan differs from the release before.
 * Build time only; it reads nothing but the result objects.
 */
import { latestPerRef, seriesKey, summarise, type RunSummary, type SeriesParts } from './data.ts';
import { DRIVER_ORDER, type Driver } from './drivers.ts';
import type { Query, Result, SubjectQueries } from './schema.ts';

export interface QuerySource {
  driver: Driver;
  run: RunSummary;
  analyzed: boolean;
  /** Whether the variants ran for real, so every statement is listed with its time. */
  executed: boolean;
}

export interface DriverQueries {
  driver: Driver;
  run: RunSummary;
  queries: Query[];
  /** The time of each query in milliseconds, one execution each, or null when the run was not executed. */
  timings: number[] | null;
  /** The ref whose run changed the plan against the release before it, when it did. */
  planChanged: string | null;
}

export interface BenchmarkQueries {
  /** The run each database's SQL comes from, in driver order; only databases with one. */
  sources: QuerySource[];
  /** By subject key (`class::subject::set`), the SQL per database. */
  subjects: Map<string, DriverQueries[]>;
}

/** The subject key the index uses, from a result's queries entry. */
function keyOf(subject: Pick<SubjectQueries, 'benchmark' | 'subject' | 'set'>): string {
  return `${subject.benchmark}::${subject.subject}::${subject.set}`;
}

export function queriesFor(results: Result[], benchmark: string, reference: SeriesParts | null): BenchmarkQueries {
  const sources: QuerySource[] = [];
  const subjects = new Map<string, DriverQueries[]>();
  if (reference === null) {
    return { sources, subjects };
  }

  for (const driver of DRIVER_ORDER) {
    const key = seriesKey({ ...reference, driver });
    const inSeries = results.filter((result) => result.queries !== null && summarise(result).series === key);
    if (inSeries.length === 0) {
      continue;
    }
    const byId = new Map(inSeries.map((result) => [result.id, result]));

    // The latest release, else whatever ran last; the previous release for the plan comparison.
    const releases = latestPerRef(inSeries.filter((result) => result.kind === 'release').map(summarise));
    const chosen = releases.at(-1) ?? inSeries.map(summarise).reduce((a, b) => (b.ran_at > a.ran_at ? b : a));
    const previous = releases.length > 1 ? releases.at(-2) : undefined;
    const current = byId.get(chosen.id);
    const before = previous === undefined ? undefined : byId.get(previous.id);
    if (current?.queries == null) {
      continue;
    }
    sources.push({ driver, run: chosen, analyzed: current.queries.analyzed, executed: current.queries.executed });

    // An executed run lists statements a pretend() run never saw, so two runs are only compared when they were
    // captured the same way; otherwise every multi-statement subject would show as a changed plan.
    const comparable = before?.queries?.executed === current.queries.executed;
    const earlier = new Map(
      comparable ? (before?.queries?.subjects.map((subject) => [keyOf(subject), subject]) ?? []) : [],
    );
    for (const subject of current.queries.subjects) {
      if (subject.benchmark !== benchmark) {
        continue;
      }
      const old = earlier.get(keyOf(subject));
      const planChanged = old !== undefined && !samePlans(old.queries, subject.queries) ? chosen.ref : null;
      const key = keyOf(subject);
      subjects.set(key, [
        ...(subjects.get(key) ?? []),
        { driver, run: chosen, queries: subject.queries, timings: subject.timings_ms, planChanged },
      ]);
    }
  }

  return { sources, subjects };
}

/** Whether two lists of queries have the same plans, row for row. The SQL itself may differ, say in an id. */
export function samePlans(a: Query[], b: Query[]): boolean {
  return a.length === b.length && a.every((query, i) => JSON.stringify(query.plan) === JSON.stringify(b[i]?.plan));
}
