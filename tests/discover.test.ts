import { describe, expect, it } from 'vitest';
import { parseRemote, planRuns, type DiscoverInput } from '../src/lib/discover.ts';

const REMOTE = [
  'a1\trefs/heads/9.x',
  'a2\trefs/heads/main',
  'b1\trefs/tags/v8.3.0',
  'b2\trefs/tags/v9.0.0',
  'b3\trefs/tags/v9.0.0^{}',
  'b4\trefs/tags/v9.1.0-beta.1',
  'b5\trefs/tags/v9.1.0',
  'b6\trefs/tags/v10.0.0',
  '',
].join('\n');

type Run = DiscoverInput['runs'][number];

const run = (overrides: Partial<Run>): Run => ({
  ref: 'v9.0.0',
  kind: 'release',
  runner: 'gha',
  size: 'medium',
  driver: 'sqlite',
  indexes: 'none',
  ran_at: '2026-09-01T03:00:00Z',
  ...overrides,
});

const plan = (runs: Run[], now = '2026-10-02T03:17:00Z') =>
  planRuns({ remote: REMOTE, runs, now: new Date(now), branch: '9.x', since: 'v9.0.0' });

describe('parseRemote', () => {
  it('reads tags once each, without the peeled lines, and branches', () => {
    expect(parseRemote(REMOTE)).toEqual({
      tags: ['v8.3.0', 'v9.0.0', 'v9.1.0-beta.1', 'v9.1.0', 'v10.0.0'],
      branches: ['9.x', 'main'],
    });
  });
});

describe('planRuns', () => {
  it('starts every release since v9.0.0 without a reference run, oldest first, and the weekly run', () => {
    expect(plan([])).toEqual([
      { ref: 'v9.0.0', size: 'medium', drivers: ['sqlite', 'mysql', 'mariadb', 'pgsql'], reason: 'release' },
      { ref: 'v9.1.0', size: 'medium', drivers: ['sqlite', 'mysql', 'mariadb', 'pgsql'], reason: 'release' },
      { ref: 'v10.0.0', size: 'medium', drivers: ['sqlite', 'mysql', 'mariadb', 'pgsql'], reason: 'release' },
      { ref: '9.x', size: 'medium', drivers: ['sqlite', 'mysql', 'mariadb', 'pgsql'], reason: 'weekly' },
    ]);
  });

  it('only reruns the drivers a release is missing', () => {
    const runs = ['sqlite', 'mysql', 'pgsql'].map((driver) => run({ driver: driver as Run['driver'] }));

    expect(plan(runs).find((planned) => planned.ref === 'v9.0.0')?.drivers).toEqual(['mariadb']);
  });

  it('does not count runs outside the reference series', () => {
    const runs = [run({ runner: 'cyril' }), run({ size: 'small' }), run({ indexes: 'visitor' })];

    expect(plan(runs).find((planned) => planned.ref === 'v9.0.0')?.drivers).toHaveLength(4);
  });

  it('waits six days between weekly runs', () => {
    const weekly = (ran_at: string) => [run({ ref: '9.x', kind: 'branch', ran_at })];

    expect(plan(weekly('2026-09-27T03:20:00Z')).some((p) => p.reason === 'weekly')).toBe(false);
    expect(plan(weekly('2026-09-26T03:00:00Z')).some((p) => p.reason === 'weekly')).toBe(true);
  });

  it('skips the weekly run when the branch does not exist', () => {
    const planned = planRuns({ remote: REMOTE, runs: [], now: new Date(), branch: '10.x', since: 'v9.0.0' });

    expect(planned.some((p) => p.reason === 'weekly')).toBe(false);
  });
});
