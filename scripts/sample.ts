/**
 * Writes made-up result files to .cache/sample/results, so the site can be developed before real runs exist.
 *
 *   make sample          # generate
 *   make dev-sample      # generate and serve the site on them, with a banner saying so
 *
 * The subjects and their rough proportions come from the real SQLite run in tests/fixtures; everything else is
 * invented: four releases and six weekly 9.x runs on every driver, a regression in v9.1.0 that v9.2.0 fixes, a
 * speed-up in v9.1.0, and a PHP and a Laravel upgrade along the way. Every run carries made-up SQL and plans for
 * its read subjects, and v9.2.0 changes one plan on MySQL. The output is the same on every run.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fixtureRun } from './sample-fixture.ts';
import { sampleQueries } from './sample-queries.ts';
import { resultPaths, runId, serialise } from '../src/lib/importer.ts';
import { resultSchema, type Result } from '../src/lib/schema.ts';

const OUT = '.cache/sample';

const RELEASES = [
  { ref: 'v9.0.0', date: '2026-04-06', php: '8.5.11', laravel: '13.34.0' },
  { ref: 'v9.0.1', date: '2026-05-11', php: '8.5.11', laravel: '13.34.0' },
  { ref: 'v9.1.0', date: '2026-06-22', php: '8.5.11', laravel: '13.38.0' },
  { ref: 'v9.2.0', date: '2026-08-31', php: '8.5.14', laravel: '13.38.0' },
];
const WEEKLY = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-09-07', '2026-09-14'];

const DRIVERS = {
  sqlite: { read: 1, write: 1, image: null, server: '3.53.4' },
  mysql: { read: 0.8, write: 1.6, image: 'mysql:8.4', server: '8.4.11' },
  mariadb: { read: 0.9, write: 1.5, image: 'mariadb:11', server: '11.8.9' },
  pgsql: { read: 0.55, write: 1.3, image: 'postgres:17', server: '17.11' },
} as const;

const SIZES = {
  small: { factor: 1, views: 1_000_000, articles: 1_000, videos: 100, hot: 120_031 },
  medium: { factor: 9, views: 10_000_000, articles: 10_000, videos: 1_000, hot: 1_200_310 },
  large: { factor: 42, views: 50_000_000, articles: 50_000, videos: 5_000, hot: 6_001_550 },
} as const;

const RUNNERS = {
  gha: { label: 'ubuntu-24.04, 4 vCPU (sample)', arch: 'x86_64', kernel: '6.8.0-1015-azure', noise: 0.07, spread: 4 },
  cyril: {
    label: 'MacBook Pro M3, Docker Desktop 8 GB (sample)',
    arch: 'aarch64',
    kernel: '6.12.76-linuxkit',
    noise: 0.015,
    spread: 1.2,
  },
} as const;

type Runner = keyof typeof RUNNERS;
type Driver = keyof typeof DRIVERS;
type Size = keyof typeof SIZES;

/** Which runner measures what: CI everything at two sizes, the laptop a few series at the larger sizes. */
const PLAN: { runner: Runner; driver: Driver; size: Size; weekly: boolean }[] = [
  ...(['sqlite', 'mysql', 'mariadb', 'pgsql'] as const).flatMap((driver) => [
    { runner: 'gha' as const, driver, size: 'small' as const, weekly: false },
    { runner: 'gha' as const, driver, size: 'medium' as const, weekly: true },
  ]),
  { runner: 'cyril', driver: 'mysql', size: 'medium', weekly: false },
  { runner: 'cyril', driver: 'pgsql', size: 'large', weekly: false },
];

/** Release effects on top of the baseline, by subject. */
function effect(ref: string, benchmark: string, subject: string, driver: Driver): number {
  const after = (version: string) =>
    RELEASES.findIndex((r) => r.ref === ref) >= RELEASES.findIndex((r) => r.ref === version);
  let factor = 1;
  if (benchmark === 'OrderByViewsBench' && after('v9.1.0')) {
    factor *= 0.68;
  }
  if (
    benchmark === 'CountViewsByIntervalBench' &&
    subject.includes('Unique') &&
    (driver === 'mysql' || driver === 'mariadb')
  ) {
    if (ref === 'v9.1.0') {
      factor *= 1.28;
    }
  }
  if (benchmark === 'CooldownManagerBench' && after('v9.0.1')) {
    factor *= 0.9;
  }

  return factor;
}

function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

/** A deterministic number in [0, 1) per text. */
function random(text: string): number {
  return parseInt(hash(text).slice(0, 8), 16) / 0x1_0000_0000;
}

/** Roughly normal noise around 1, deterministic per text. */
function jitter(text: string, spread: number): number {
  const u = random(`${text}:u`) || 1e-9;
  const v = random(`${text}:v`);
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);

  return Math.exp(normal * spread);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function run(
  base: Result,
  runner: Runner,
  driver: Driver,
  size: Size,
  ref: string,
  kind: Result['kind'],
  date: string,
  versions: { php: string; laravel: string },
): Result {
  const machine = RUNNERS[runner];
  const db = DRIVERS[driver];
  const dataset = SIZES[size];
  const commit = hash(`commit:${ref}:${date}`);
  const ranAt = `${date}T03:${String(Math.floor(random(`${runner}${driver}${size}${ref}`) * 50) + 10).padStart(2, '0')}:00Z`;
  const seed = `${runner}:${driver}:${size}:${ref}:${date}`;

  const subjects = base.subjects.map((subject) => {
    const scale = subject.groups.includes('php')
      ? 1
      : (subject.groups.includes('write') ? db.write : db.read) *
        dataset.factor ** (subject.set.includes('cold') ? 0.15 : 1);
    const mode =
      subject.mode_us *
      scale *
      effect(ref, subject.benchmark, subject.subject, driver) *
      jitter(`${seed}:${subject.benchmark}:${subject.subject}:${subject.set}`, machine.noise);
    const rstdev = machine.spread * (0.5 + random(`${seed}:${subject.subject}:${subject.set}:d`));

    return {
      ...subject,
      mode_us: round(mode),
      mean_us: round(mode * 1.01),
      min_us: round(mode * 0.97),
      max_us: round(mode * 1.05),
      stdev_us: round((mode * rstdev) / 100),
      rstdev: round(rstdev),
    };
  });

  const id = runId({ ref, commit, runner, driver, size, ran_at: ranAt });

  const result: Result = {
    ...base,
    id,
    ref,
    kind,
    commit,
    committed_at: `${date}T00:00:00Z`,
    ran_at: ranAt,
    runner,
    machine: { label: machine.label, os: 'Linux', arch: machine.arch, kernel: machine.kernel, load: null },
    php: { ...base.php, version: versions.php },
    laravel: versions.laravel,
    database: { driver, image: db.image, server_version: db.server },
    dataset: {
      ...base.dataset,
      size,
      articles: dataset.articles,
      videos: dataset.videos,
      views: dataset.views,
      hot_article_views: dataset.hot,
    },
    workflow_run: null,
    subjects,
    queries: null,
  };

  return resultSchema.parse({ ...result, queries: sampleQueries(result, ref) });
}

const base = fixtureRun();
rmSync(OUT, { recursive: true, force: true });
let count = 0;

for (const { runner, driver, size, weekly } of PLAN) {
  const runs = RELEASES.map((release) =>
    run(base, runner, driver, size, release.ref, 'release', release.date, release),
  );
  if (weekly) {
    const latest = RELEASES[RELEASES.length - 1] as (typeof RELEASES)[number];
    runs.push(...WEEKLY.map((date) => run(base, runner, driver, size, '9.x', 'branch', date, latest)));
  }

  for (const result of runs) {
    const path = `${OUT}/${resultPaths(result).json}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialise(result));
    count++;
  }
}

console.log(`Wrote ${count} sample results to ${OUT}/results`);
