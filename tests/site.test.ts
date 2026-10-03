import { describe, expect, it } from 'vitest';
import { setLabel, subjectLabel } from '../src/lib/benchmarks.ts';
import { compare, largestChanges, noiseThreshold, summariseComparison } from '../src/lib/compare.ts';
import {
  buildIndex,
  latestPerRef,
  measurements,
  parseSeriesKey,
  referenceSeries,
  seriesKey,
  subjectKey,
} from '../src/lib/data.ts';
import { formatBytes, formatChange, formatDate, formatTime, timeUnit } from '../src/lib/format.ts';
import { buildResult } from '../src/lib/importer.ts';
import { compareRuns, compareVersions } from '../src/lib/refs.ts';
import type { Result } from '../src/lib/schema.ts';
import { href } from '../src/lib/site.ts';
import { buildTrend } from '../src/lib/trends.ts';
import { fixture } from './support.ts';

const base = buildResult(fixture.xml, fixture.meta, fixture.dataset);

/** A copy of the fixture run as another run, with every mode scaled by `factor`. */
function variant(overrides: {
  ref: string;
  kind?: Result['kind'];
  commit?: string;
  runner?: string;
  driver?: Result['database']['driver'];
  size?: Result['dataset']['size'];
  ran_at: string;
  php?: string;
  laravel?: string;
  factor?: number;
}): Result {
  const factor = overrides.factor ?? 1;

  return {
    ...base,
    id: `${overrides.ref.replace(/\W/g, '_')}_${overrides.driver ?? 'sqlite'}_${overrides.ran_at}`,
    ref: overrides.ref,
    kind: overrides.kind ?? 'release',
    commit: overrides.commit ?? base.commit,
    runner: overrides.runner ?? 'gha',
    ran_at: overrides.ran_at,
    committed_at: overrides.ran_at,
    php: { ...base.php, version: overrides.php ?? base.php.version },
    laravel: overrides.laravel ?? base.laravel,
    database: { ...base.database, driver: overrides.driver ?? 'sqlite' },
    dataset: { ...base.dataset, size: overrides.size ?? 'medium' },
    subjects: base.subjects.map((subject) => ({ ...subject, mode_us: subject.mode_us * factor })),
  };
}

describe('format', () => {
  it.each([
    [762.649, '763 µs'],
    [12.5, '12.5 µs'],
    [4239.075, '4.24 ms'],
    [139335.379, '139 ms'],
    [1202473, '1.20 s'],
  ])('formats %d µs as %s', (micros, text) => {
    expect(formatTime(micros)).toBe(text);
  });

  it('formats in a given unit, so one chart shares one', () => {
    expect(formatTime(500, timeUnit(2000))).toBe('0.50 ms');
  });

  it('signs changes with a real minus', () => {
    expect(formatChange(12.345)).toBe('+12.3%');
    expect(formatChange(-4)).toBe('−4.0%');
    expect(formatChange(0)).toBe('±0.0%');
  });

  it('formats bytes and dates', () => {
    expect(formatBytes(6775000)).toBe('6.8 MB');
    expect(formatBytes(512000)).toBe('512 kB');
    expect(formatDate('2026-10-02T23:59:00Z')).toBe('2 Oct 2026');
  });
});

describe('labels and links', () => {
  it('names subjects the way the package API does', () => {
    expect(subjectLabel('benchCountByInterval')).toBe('countByInterval');
    expect(setLabel('hot article,all time')).toBe('hot article, all time');
    expect(setLabel('')).toBe('—');
  });

  it('builds links under the Pages base, with or without its trailing slash', () => {
    expect(href('/runs/x/', '/eloquent-viewable-benchmarks/')).toBe('/eloquent-viewable-benchmarks/runs/x/');
    expect(href('data/index.json', '/eloquent-viewable-benchmarks')).toBe(
      '/eloquent-viewable-benchmarks/data/index.json',
    );
  });
});

describe('refs', () => {
  it('orders versions numerically, a pre-release before its release', () => {
    const refs = ['v9.10.0', 'v9.2.0', 'v10.0.0', 'v10.0.0-beta.2', 'v10.0.0-beta.10', 'v9.2.1'];

    expect(refs.sort(compareVersions)).toEqual([
      'v9.2.0',
      'v9.2.1',
      'v9.10.0',
      'v10.0.0-beta.2',
      'v10.0.0-beta.10',
      'v10.0.0',
    ]);
  });

  it('puts releases before branch runs, and branch runs in commit order', () => {
    const run = (ref: string, kind: Result['kind'], at: string) => ({ ref, kind, committed_at: at, ran_at: at });
    const runs = [
      run('9.x', 'branch', '2026-09-02'),
      run('v9.1.0', 'release', '2026-08-01'),
      run('9.x', 'branch', '2026-09-01'),
      run('v9.0.0', 'release', '2026-09-30'),
    ];

    expect(runs.sort(compareRuns).map((r) => `${r.ref} ${r.committed_at}`)).toEqual([
      'v9.0.0 2026-09-30',
      'v9.1.0 2026-08-01',
      '9.x 2026-09-01',
      '9.x 2026-09-02',
    ]);
  });
});

describe('compare', () => {
  const at = (mode: number, rstdev = 1) => ({ mode, rstdev });

  it('needs at least 5%, and more when the runs are noisy', () => {
    expect(noiseThreshold(at(1), at(1))).toBe(5);
    expect(noiseThreshold(at(1, 3), at(1, 4))).toBe(10);
  });

  it('judges every subject, including ones only one run has', () => {
    const before = new Map([
      ['same', at(100)],
      ['slower', at(100)],
      ['faster', at(100)],
      ['gone', at(100)],
    ]);
    const after = new Map([
      ['same', at(103)],
      ['slower', at(120)],
      ['faster', at(80)],
      ['new', at(100)],
    ]);
    const rows = compare(before, after, ['same', 'slower', 'faster', 'gone', 'new', 'neither']);

    expect(rows.map((row) => [row.key, row.verdict])).toEqual([
      ['same', 'noise'],
      ['slower', 'slower'],
      ['faster', 'faster'],
      ['gone', 'removed'],
      ['new', 'added'],
    ]);
    expect(rows[1]?.change).toBeCloseTo(20);
    expect(summariseComparison(rows)).toEqual({ faster: 1, slower: 1, noise: 1, added: 1, removed: 1 });
    expect(largestChanges(rows, 1).map((row) => row.key)).toEqual(['slower']);
  });
});

describe('the index', () => {
  const runs = [
    variant({ ref: 'v9.1.0', ran_at: '2026-08-01T03:00:00Z', factor: 1.5 }),
    variant({ ref: 'v9.0.0', ran_at: '2026-07-01T03:00:00Z' }),
    variant({ ref: 'v9.1.0', ran_at: '2026-08-02T03:00:00Z', factor: 2 }),
    variant({ ref: 'v9.0.0', driver: 'mysql', ran_at: '2026-07-01T03:00:00Z' }),
    variant({ ref: 'v9.0.0', runner: 'cyril', size: 'large', ran_at: '2026-09-01T03:00:00Z' }),
  ];
  const index = buildIndex(runs);

  it('aligns every run to one list of subjects, reading benchmarks first', () => {
    expect(index.subjects).toHaveLength(64);
    expect(index.subjects[0]?.groups).toEqual(['read']);
    expect(index.subjects.at(-1)?.groups).toEqual(['php']);
    for (const run of index.runs) {
      expect(run.modes).toHaveLength(64);
    }
  });

  it('keeps the measurements of each run', () => {
    const run = index.runs.find((candidate) => candidate.id === runs[0]?.id);
    const first = base.subjects[0];
    if (run === undefined || first === undefined) {
      throw new Error('missing');
    }

    expect(measurements(index, run).get(subjectKey(first))?.mode).toBeCloseTo(first.mode_us * 1.5);
  });

  it('keeps the newest run of each ref along a series', () => {
    const series = seriesKey({ runner: 'gha', driver: 'sqlite', size: 'medium', indexes: 'none', schema: 1 });
    const trend = latestPerRef(index.runs.filter((run) => run.series === series));

    expect(trend.map((run) => `${run.ref} ${run.ran_at.slice(0, 10)}`)).toEqual([
      'v9.0.0 2026-07-01',
      'v9.1.0 2026-08-02',
    ]);
    expect(parseSeriesKey(series)).toEqual({
      runner: 'gha',
      driver: 'sqlite',
      size: 'medium',
      indexes: 'none',
      schema: 1,
    });
  });

  it('leads with GitHub Actions at medium, even when another runner ran later', () => {
    expect(referenceSeries(index.runs)).toMatchObject({ runner: 'gha', size: 'medium' });
    expect(referenceSeries([])).toBeNull();
  });

  it('falls back to the newest series when there is no GitHub Actions run at medium', () => {
    const local = buildIndex([runs[4] as Result]);

    expect(referenceSeries(local.runs)).toMatchObject({ runner: 'cyril', size: 'large' });
  });
});

describe('buildTrend', () => {
  const index = buildIndex([
    variant({ ref: 'v9.0.0', ran_at: '2026-07-01T03:00:00Z' }),
    variant({ ref: 'v9.10.0', ran_at: '2026-09-01T03:00:00Z', laravel: '13.40.0' }),
    variant({ ref: 'v9.2.0', ran_at: '2026-08-01T03:00:00Z', php: '8.5.14' }),
    variant({ ref: 'v9.2.0', driver: 'pgsql', ran_at: '2026-08-01T03:00:00Z', php: '8.5.14' }),
    variant({ ref: '9.x', kind: 'branch', commit: 'b64eec6aaaa', ran_at: '2026-09-07T03:00:00Z' }),
    variant({ ref: '9.x', kind: 'branch', commit: '10b5b1ebbbb', ran_at: '2026-09-14T17:00:00Z' }),
    variant({ ref: '9.x', kind: 'branch', commit: '95c87e7cccc', ran_at: '2026-09-14T07:00:00Z' }),
    variant({ ref: '9.x', kind: 'branch', commit: '95c87e7cccc', ran_at: '2026-09-14T09:00:00Z', factor: 2 }),
  ]);
  const filter = { runner: 'gha', size: 'medium', indexes: 'none' } as const;

  it('lays releases out in version order, a line per driver with gaps where it was not measured', () => {
    const trend = buildTrend(index, { ...filter, view: 'releases' });

    expect(trend.categories.map((category) => category.label)).toEqual(['v9.0.0', 'v9.2.0', 'v9.10.0']);
    expect(trend.lines.map((line) => line.driver)).toEqual(['sqlite', 'pgsql']);
    expect(trend.lines[1]?.runs.map((run) => run?.ref ?? null)).toEqual([null, 'v9.2.0', null]);
  });

  it('marks where PHP or Laravel changed', () => {
    expect(buildTrend(index, { ...filter, view: 'releases' }).markers).toEqual([
      { index: 1, text: 'PHP 8.5.14' },
      { index: 2, text: 'PHP 8.5.11 · Laravel 13.40.0' },
    ]);
  });

  it('lays branch runs out per day and commit, in the order they ran, the newest run of each', () => {
    const trend = buildTrend(index, { ...filter, view: 'branch' });

    expect(trend.categories).toEqual([
      { key: '2026-09-07_b64eec6', label: '7 Sept · b64eec6' },
      { key: '2026-09-14_95c87e7', label: '14 Sept · 95c87e7' },
      { key: '2026-09-14_10b5b1e', label: '14 Sept · 10b5b1e' },
    ]);
    expect(trend.lines[0]?.runs.map((run) => run?.ran_at)).toEqual([
      '2026-09-07T03:00:00Z',
      '2026-09-14T09:00:00Z',
      '2026-09-14T17:00:00Z',
    ]);
  });

  it('is empty for a series without runs', () => {
    expect(buildTrend(index, { ...filter, runner: 'nobody', view: 'releases' })).toEqual({
      categories: [],
      lines: [],
      markers: [],
      schema: null,
    });
  });
});
