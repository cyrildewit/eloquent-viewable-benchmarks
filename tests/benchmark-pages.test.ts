import { describe, expect, it } from 'vitest';
import { benchmarkSlug, benchmarkSlugs } from '../src/lib/benchmarks.ts';
import { buildIndex, referenceSeries } from '../src/lib/data.ts';
import { buildResult } from '../src/lib/importer.ts';
import { queriesFor, samePlans } from '../src/lib/queries.ts';
import type { Result } from '../src/lib/schema.ts';
import { latestPoint } from '../src/lib/snapshot.ts';
import { sourceUrl } from '../src/lib/site.ts';
import { buildTrend } from '../src/lib/trends.ts';
import { fixture, queries } from './support.ts';

const base = buildResult(fixture.xml, fixture.meta, fixture.dataset, queries);

function run(overrides: {
  ref: string;
  kind?: Result['kind'];
  driver?: Result['database']['driver'];
  ran_at: string;
  factor?: number;
  queries?: Result['queries'];
  dropSubject?: string;
}): Result {
  const factor = overrides.factor ?? 1;

  return {
    ...base,
    id: `${overrides.ref.replace(/\W/g, '_')}_${overrides.driver ?? 'sqlite'}_${overrides.ran_at}`,
    ref: overrides.ref,
    kind: overrides.kind ?? 'release',
    runner: 'gha',
    ran_at: overrides.ran_at,
    committed_at: overrides.ran_at,
    database: { ...base.database, driver: overrides.driver ?? 'sqlite' },
    dataset: { ...base.dataset, size: 'medium' },
    subjects: base.subjects
      .filter((subject) => subject.subject !== overrides.dropSubject)
      .map((subject) => ({ ...subject, mode_us: subject.mode_us * factor })),
    queries: overrides.queries === undefined ? base.queries : overrides.queries,
  };
}

describe('benchmark pages', () => {
  it.each([
    ['CountViewsBench', 'count-views'],
    ['CountViewsByIntervalBench', 'count-views-by-interval'],
    ['OrderByViewsBench', 'order-by-views'],
    ['ViewSeriesBench', 'view-series'],
    ['CooldownManagerBench', 'cooldown-manager'],
    ['HTTPCacheBench', 'http-cache'],
  ])('slugs %s as %s', (benchmark, slug) => {
    expect(benchmarkSlug(benchmark)).toBe(slug);
  });

  it('maps every class to a page and refuses two classes on one', () => {
    expect([...benchmarkSlugs(['CountViewsBench', 'OrderByViewsBench', 'CountViewsBench'])]).toEqual([
      ['count-views', 'CountViewsBench'],
      ['order-by-views', 'OrderByViewsBench'],
    ]);
    expect(() => benchmarkSlugs(['CountViews', 'CountViewsBench'])).toThrow(/both be at/);
  });

  it('links a class to its file in the package by the autoload rule', () => {
    expect(sourceUrl('CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\CountViewsBench', 'abc')).toBe(
      'https://github.com/cyrildewit/eloquent-viewable/blob/abc/benchmarks/Querying/CountViewsBench.php',
    );
    expect(sourceUrl('Elsewhere\\Bench', 'abc')).toBe(
      'https://github.com/cyrildewit/eloquent-viewable/tree/abc/benchmarks',
    );
  });
});

describe('latestPoint', () => {
  const index = buildIndex([
    run({ ref: 'v9.0.0', ran_at: '2026-07-01T03:00:00Z' }),
    run({ ref: 'v9.1.0', ran_at: '2026-08-01T03:00:00Z', factor: 2, dropSubject: 'benchUniqueCount' }),
    run({ ref: 'v9.0.0', driver: 'pgsql', ran_at: '2026-07-01T03:00:00Z' }),
  ]);
  const trend = buildTrend(index, { runner: 'gha', size: 'medium', indexes: 'none', view: 'releases' });
  const subjects = index.subjects
    .map((subject, position) => ({ subject, position }))
    .filter(({ subject }) => subject.benchmark === 'CountViewsBench');

  it('takes the last point of the trend, one table per subject method', () => {
    const snapshot = latestPoint(trend, subjects);

    expect(snapshot.point?.label).toBe('v9.1.0');
    expect(snapshot.drivers).toEqual(['sqlite', 'pgsql']);
    expect(snapshot.tables.map((table) => [table.subject, table.rows.length])).toEqual([
      ['benchCount', 12],
      ['benchUniqueCount', 12],
    ]);
  });

  it('leaves a cell empty where a database has no run at that point or lacks the subject', () => {
    const snapshot = latestPoint(trend, subjects);
    const count = snapshot.tables[0]?.rows[0];
    const unique = snapshot.tables[1]?.rows[0];
    const original = base.subjects.find((subject) => subject.subject === 'benchCount');

    expect(count?.cells[0]?.mode).toBeCloseTo((original?.mode_us ?? 0) * 2);
    expect(count?.cells[1]).toBeNull();
    expect(unique?.cells).toEqual([null, null]);
  });

  it('is empty for an empty trend', () => {
    expect(latestPoint({ categories: [], lines: [], markers: [], schema: null }, subjects)).toEqual({
      point: null,
      drivers: [],
      tables: [],
    });
  });
});

describe('queriesFor', () => {
  const changed: Result['queries'] = {
    ...(base.queries as NonNullable<Result['queries']>),
    subjects: (base.queries?.subjects ?? []).map((subject, i) =>
      i === 0
        ? {
            ...subject,
            queries: subject.queries.map((query) => ({
              ...query,
              plan: { ...query.plan, rows: [['1', '0', '0', 'SCAN views']] },
            })),
          }
        : subject,
    ),
  };
  const results = [
    run({ ref: 'v9.0.0', ran_at: '2026-07-01T03:00:00Z' }),
    run({ ref: 'v9.1.0', ran_at: '2026-08-01T03:00:00Z', queries: changed }),
    run({ ref: 'v9.1.0', driver: 'mysql', ran_at: '2026-08-01T03:00:00Z', queries: null }),
    run({ ref: '9.x', kind: 'branch', driver: 'pgsql', ran_at: '2026-09-01T03:00:00Z' }),
  ];
  const reference = referenceSeries(buildIndex(results).runs);

  it('takes the latest release with queries per database, or the newest run without one', () => {
    const found = queriesFor(results, 'CountViewsBench', reference);

    expect(found.sources.map((source) => `${source.driver} ${source.run.ref}`)).toEqual(['sqlite v9.1.0', 'pgsql 9.x']);
  });

  it('pairs the subjects of the benchmark with their SQL per database and notes a changed plan', () => {
    const found = queriesFor(results, 'CountViewsBench', reference);
    const entry = found.subjects.get('CountViewsBench::benchCount::hot article,all time');

    expect([...found.subjects.keys()]).toEqual(['CountViewsBench::benchCount::hot article,all time']);
    expect(entry?.map((item) => [item.driver, item.planChanged])).toEqual([
      ['sqlite', 'v9.1.0'],
      ['pgsql', null],
    ]);
    expect(entry?.[0]?.queries[0]?.sql).toMatch(/^select count\(\*\)/);
  });

  it('finds nothing without a reference series or for a benchmark without SQL', () => {
    expect(queriesFor(results, 'CountViewsBench', null).sources).toEqual([]);
    expect(queriesFor(results, 'ViewSeriesBench', reference).subjects.size).toBe(0);
  });

  it('compares plans row for row, not the SQL', () => {
    const [query] = base.queries?.subjects[0]?.queries ?? [];
    if (query === undefined) {
      throw new Error('missing');
    }

    expect(samePlans([query], [{ ...query, sql: 'select 1' }])).toBe(true);
    expect(samePlans([query], [{ ...query, plan: { ...query.plan, rows: [] } }])).toBe(false);
    expect(samePlans([query], [])).toBe(false);
  });
});
