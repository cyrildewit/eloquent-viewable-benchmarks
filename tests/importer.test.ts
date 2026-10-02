import { describe, expect, it } from 'vitest';
import { buildResult, indexKey, refKind, resultPaths, runId, serialise, slugRef } from '../src/lib/importer.ts';
import { resultSchema } from '../src/lib/schema.ts';
import { fixture } from './support.ts';

const COMMIT = 'b4cb9993b30724a1b83aaa2e2830e008dcd1f8a9';

describe('identifiers', () => {
  it.each([
    ['v9.0.0', 'v9_0_0'],
    ['9.x', '9_x'],
    ['feature/My-Change', 'feature_my_change'],
    ['--odd--', 'odd'],
  ])('slugs %s as %s', (ref, slug) => {
    expect(slugRef(ref)).toBe(slug);
  });

  it('refuses a ref with nothing to slug', () => {
    expect(() => slugRef('///')).toThrow(/identifier/);
  });

  it.each([
    ['v9.0.0', 'release'],
    ['9.1.0', 'release'],
    ['v10.0.0-beta.1', 'release'],
    ['b4cb999', 'commit'],
    [COMMIT, 'commit'],
    ['abcdef1', 'branch'],
    ['9.x', 'branch'],
    ['main', 'branch'],
  ] as const)('sees %s as a %s', (ref, kind) => {
    expect(refKind(ref, COMMIT)).toBe(kind);
  });

  it('builds a run id from the ref, the commit and the time it ran', () => {
    const run = { ref: 'v9.0.0', commit: COMMIT, runner: 'gha', driver: 'mysql', size: 'medium' };

    expect(runId({ ...run, ran_at: '2026-10-05T03:12:44Z' })).toBe('v9_0_0_b4cb999_mysql_medium_gha_20261005T031244');
  });

  it('gives runs of one commit on two drivers at the same moment different ids', () => {
    const run = { ref: 'v9.0.0', commit: COMMIT, runner: 'gha', size: 'medium', ran_at: '2026-10-05T03:12:44Z' };

    expect(runId({ ...run, driver: 'mysql' })).not.toBe(runId({ ...run, driver: 'pgsql' }));
  });

  it.each([
    [[], 'none'],
    [['visitor'], 'visitor'],
    [['visitor', 'type-viewed-at', 'visitor'], 'type-viewed-at,visitor'],
  ])('keys the indexes %j as %s', (indexes, key) => {
    expect(indexKey(indexes)).toBe(key);
  });
});

describe('buildResult', () => {
  const result = buildResult(fixture.xml, fixture.meta, fixture.dataset);

  it('combines the dump, the metadata and the dataset', () => {
    const { subjects, ...rest } = result;

    expect(subjects).toHaveLength(64);
    expect(rest).toEqual({
      format: 1,
      id: 'main_b4cb999_sqlite_small_cyril_20261002T105351',
      package: 'cyrildewit/eloquent-viewable',
      ref: 'main',
      kind: 'branch',
      commit: COMMIT,
      committed_at: '2026-09-30T06:25:49Z',
      ran_at: '2026-10-02T10:53:51Z',
      runner: 'cyril',
      machine: {
        label: 'MacBook Pro, Docker Desktop',
        os: 'Linux',
        arch: 'aarch64',
        kernel: '6.12.76-linuxkit',
        load: [0.779296875, 0.87548828125, 0.630859375],
      },
      php: { version: '8.5.11', opcache: true, xdebug: true },
      laravel: '13.34.0',
      database: { driver: 'sqlite', image: null, server_version: '3.53.4' },
      dataset: {
        schema_version: 1,
        size: 'small',
        seed: 20260101,
        anchor: '2026-01-01 00:00:00',
        articles: 1000,
        videos: 100,
        views: 1000000,
        hot_article_views: 120031,
        cold_article_views: 95,
        indexes: 'none',
      },
      phpbench: '1.7.0',
      workflow_run: null,
      errors: [],
    });
  });

  it('places the run by runner, driver and size', () => {
    expect(resultPaths(result)).toEqual({
      xml: 'runs/cyril/sqlite/small/main_b4cb999_sqlite_small_cyril_20261002T105351.xml',
      json: 'results/cyril/sqlite/small/main_b4cb999_sqlite_small_cyril_20261002T105351.json',
    });
  });

  it('serialises to JSON that reads back as the same result', () => {
    expect(resultSchema.parse(JSON.parse(serialise(result)))).toEqual(result);
    expect(serialise(result).endsWith('}\n')).toBe(true);
  });

  it('refuses metadata with a short commit hash', () => {
    expect(() => buildResult(fixture.xml, { ...fixture.meta, commit: 'b4cb999' }, fixture.dataset)).toThrow(
      /40-character/,
    );
  });

  it('refuses a runner name that would break the path', () => {
    expect(() => buildResult(fixture.xml, { ...fixture.meta, runner: 'My Laptop' }, fixture.dataset)).toThrow(
      /lowercase/,
    );
  });

  it('refuses a dataset description without the Laravel version', () => {
    const { laravel: _laravel, ...dataset } = fixture.dataset;

    expect(() => buildResult(fixture.xml, fixture.meta, dataset)).toThrow(/laravel/);
  });

  it('refuses a dataset from an unknown driver', () => {
    const dataset = { ...fixture.dataset, database: { driver: 'oracle', server_version: '23' } };

    expect(() => buildResult(fixture.xml, fixture.meta, dataset)).toThrow();
  });
});
