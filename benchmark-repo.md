# Implementation plan: a results repository for the benchmarks

This plan describes a second repository, `eloquent-viewable-benchmarks`, that keeps the history of benchmark results
for `cyrildewit/eloquent-viewable`, the automation that produces them, and a static website on GitHub Pages that shows
them. The benchmark harness itself stays in the package repository under `benchmarks/`, because it calls package
internals and has to change in the same commit as the code it measures. This repository treats the package as the
thing under test: it checks out a tag or branch, runs that ref's own `make bench-*` targets as they are, and keeps what
comes out.

The plan is written against the harness on the package's `feature/benchmarks` branch and phpbench 1.7.

## Goals

- A permanent, browsable history of benchmark runs per release, per driver, per dataset size and per runner.
- A website that answers three questions without a terminal: did the last release get slower, how has one query
  developed over the releases, and what changed between two specific runs.
- Runs from CI and runs from a maintainer's machine side by side, labelled so they are never compared with each other.
- No change to the package's release flow, protected branches, secrets or CI time.

## Non-goals

- Gating any CI on timings. GitHub-hosted runners drift by 10 to 30% between runs; the data is for trends.
- Benchmarking versions before 9.0. The harness does not exist there, and the subjects would differ anyway.
- Comparing numbers across machines. Each runner is its own series.
- Replacing `make bench-compare` for day-to-day work on a branch. That stays local, in the package repository.

## Decisions taken

| Topic                 | Decision                                                                                           |
|-----------------------|----------------------------------------------------------------------------------------------------|
| Website               | Astro with Tailwind CSS, built and deployed to GitHub Pages by a workflow                           |
| Charts                | Apache ECharts, SVG, drawn in the browser by plain scripts as each chart scrolls into view          |
| Tooling language      | TypeScript on Node, one `package.json` for the site and the scripts, run in Docker                  |
| Package manager       | pnpm, pinned through `packageManager` and provided by Corepack                                     |
| Source of truth       | phpbench's XML dump of each run, kept as is, next to a JSON file derived from it                    |
| phpbench in this repo | Not needed. The XML dump already holds `<stats mode rstdev …>` per variant, so the import parses it |
| CI execution          | The package's own `make build`, `make bench-seed` and `make bench`, the same as on a laptop        |
| New releases          | Discovered by a scheduled workflow here, so the package needs no token and no release hook          |
| Commits from CI       | One collector job commits all drivers of a run at once, rebasing and retrying when the push races  |
| Run ids               | `<ref>_<sha7>_<driver>_<size>_<runner>_<time>`, unique across the repository and the page address  |
| Retention             | Keep everything                                                                                    |

The reasoning behind the less obvious ones:

- **Parsing the XML instead of using phpbench's storage.** phpbench writes to its storage only with `--store` during a
  run, and has no command to import a dump afterwards. Its storage is a hash tree that is unreadable in a pull
  request. The dump is a single self-describing file, and its `<stats>` element per variant carries the mode, mean,
  min, max and relative deviation that phpbench itself reports. Anyone who wants phpbench's console view of an old run
  can still point `phpbench report --file=<dump>` at it from a package checkout.
- **The package's `make` targets in CI.** GitHub Actions `services:` cannot pass startup arguments to a container, so
  the `--innodb-buffer-pool-size=1G` and `shared_buffers=1GB` that the `bench-*` compose services rely on cannot be
  reproduced there. Without them a medium dataset's indexes do not fit in memory and the run measures disk. Docker is
  available on GitHub-hosted Ubuntu runners, so CI runs the very same compose services. Building the image costs one
  to two minutes per job, which is noise next to seeding.
- **ECharts over Chart.js.** Chart.js had its last release in October 2025 and has gone quiet. Apache ECharts 6 is
  actively released under the Apache foundation, ships light and dark themes, zooming on the x axis, error bands and
  tree-shakeable imports, which is everything the trend view needs without plugins.
- **Polling for releases instead of a dispatch from the package.** A `repository_dispatch` needs a fine-grained token
  with write access to this repository stored as a secret in the package. A daily `git ls-remote --tags` from here
  needs nothing, and a missed release is picked up the next day.
- **A collector job.** The driver jobs finish minutes apart. Letting each push means retrying on non-fast-forward;
  uploading artifacts and committing once in a final job gives one commit per run and one Pages deploy.
- **No concurrency group.** GitHub keeps at most one pending run per concurrency group and cancels the others, so a
  group would silently drop runs when discover starts several at once. Runs do not need one: every job has its own
  VM, result paths never collide, and the collector rebases and retries its push.

## Versions

Checked against the npm registry and GitHub releases on 2026-10-02. Pin the majors in `package.json` and in the
workflows; Dependabot keeps the minors moving.

| Dependency                      | Version  | Note                                                                       |
|---------------------------------|----------|----------------------------------------------------------------------------|
| Node                            | 24 LTS   | moving to 26 at its LTS, late October 2026, also means installing Corepack: Node 25 and later no longer bundle it |
| pnpm                            | 12.8.1   | exact version in `packageManager`; Corepack in the container, `pnpm/action-setup` v6 in CI |
| `astro`                         | ^7.3     | needs Node 22.12 or later                                                  |
| `tailwindcss`, `@tailwindcss/vite` | ^4.3  | CSS-first configuration, no `tailwind.config.js`                           |
| `echarts`                       | ^6.1     |                                                                            |
| `zod`                           | ^4       | imported through `astro/zod`, so the site and the scripts share Astro's copy |
| `fast-xml-parser`               | ^5.11    | parses the phpbench dump                                                   |
| `vitest`                        | ^5.0     | unit tests for `src/lib` and the import                                    |
| `typescript`                    | ^6       | **not 7**: `@astrojs/check` 0.9 only accepts TypeScript 5 or 6 so far       |
| `@astrojs/check`                | ^0.9     | `astro check` in CI                                                        |
| `eslint`                        | ^10      | flat config, with `eslint-plugin-astro`                                    |
| `prettier`, `prettier-plugin-astro` | ^3.9, ^1.1 | formatting                                                         |
| `withastro/action`              | v6       | builds the site in `pages.yml`                                             |
| `actions/deploy-pages`          | v5       | with `actions/upload-pages-artifact` v5                                    |
| `actions/checkout`              | v7       |                                                                            |
| `actions/upload-artifact`       | v7       | with `actions/download-artifact` v8                                        |

## How the pieces fit

```
eloquent-viewable (package)                       eloquent-viewable-benchmarks
┌──────────────────────────────┐                  ┌──────────────────────────────────────────┐
│ benchmarks/   harness        │   checkout ref   │ .github/workflows/benchmark.yml          │
│ phpbench.json                │ ◄─────────────── │ scripts/run.sh   (local equivalent)      │
│ Makefile      bench-* targets│                  │                                          │
│ docker-compose.yml           │  run.xml +       │ runs/      phpbench XML dumps            │
│                              │  dataset.json    │ results/   JSON per run, derived         │
│                              │ ───────────────► │ src/       Astro site → GitHub Pages     │
└──────────────────────────────┘                  └──────────────────────────────────────────┘
```

A run is always produced by the harness of the ref being measured. This repository never contains benchmark code,
only the glue that runs it, the data it produced, and the site that shows it.

## Repository layout

```
eloquent-viewable-benchmarks/
├── README.md                    what the data means, how to add a run, how to work on the site
├── AGENTS.md                    instructions for coding agents
├── LICENSE
├── Makefile                     every command, run in the node container
├── docker-compose.yml           a node service, nothing else
├── docker/node.Dockerfile       Node with git, for `git ls-remote` in discover
├── package.json                 Astro, Tailwind, ECharts, fast-xml-parser, see [versions](#versions)
├── pnpm-lock.yaml
├── pnpm-workspace.yaml          pnpm settings: which dependencies may run build scripts
├── astro.config.mjs             site and base for GitHub Pages
├── eslint.config.js, .prettierrc.json, tsconfig.json
├── scripts/
│   ├── run.sh                   local: check out a ref, drive its make targets, import
│   ├── import.ts                run.xml + metadata → runs/ and results/
│   ├── validate.ts              check every results/ file against the schema and its XML
│   ├── discover.ts              which runs the schedule should start
│   └── sample.ts                made-up results in .cache/sample, for working on the site
├── src/
│   ├── content.config.ts        the results/ collection, using the schema from lib/
│   ├── lib/                     plain TypeScript, shared by the scripts, the build and the browser
│   │   ├── schema.ts            zod schemas of meta.json, dataset.json and the result file
│   │   ├── phpbench.ts          reads a phpbench XML dump
│   │   ├── importer.ts          run ids, paths, dump + metadata → result
│   │   ├── verify.ts            checks a stored result against the schema and its dump
│   │   ├── data.ts              run summaries, series, the compact index the browser loads
│   │   ├── compare.ts           two runs subject by subject, the noise rule
│   │   ├── trends.ts            the points, lines and version markers of a trend chart
│   │   ├── discover.ts          the schedule's rules
│   │   └── refs.ts, format.ts, drivers.ts, benchmarks.ts, site.ts, source.ts, results.ts
│   ├── scripts/                 browser code: trends, compare, charts, sortable tables, the theme toggle
│   ├── components/              DriverName, Verdict
│   ├── layouts/Base.astro       header, sample banner, footer
│   ├── styles/global.css        Tailwind, and the validated colour roles for light and dark
│   └── pages/
│       ├── index.astro          the overview
│       ├── trends.astro         one chart per subject across refs
│       ├── runs/[id].astro      one run in full
│       ├── compare.astro        any two runs, picked in the URL
│       ├── about.astro          the dataset, the runners, how to read the numbers
│       └── data/index.json.ts   every run in compact form, for trends and compare
├── public/favicon.svg
├── tests/                       Vitest, with a real run in tests/fixtures/main_sqlite/
├── runs/<runner>/<driver>/<size>/<id>.xml        raw phpbench dumps
├── results/<runner>/<driver>/<size>/<id>.json    derived, one per dump
└── .github/
    ├── dependabot.yml           the npm ecosystem (which covers pnpm) and github-actions, grouped, monthly
    └── workflows/
        ├── ci.yml               types, tests, results, lint, workflows, and the site built twice
        ├── benchmark.yml        produce a run
        ├── discover.yml         daily, start benchmark.yml for new releases and the weekly branch run
        └── pages.yml            build and deploy the site, also callable from benchmark.yml
```

Nothing runs on the host, as in the package: every `make` target goes through `docker compose run --rm node`, except
`run`, which drives git, make and Docker. The Node image is the active LTS, see [versions](#versions). Node runs the
TypeScript scripts directly with its built-in type stripping, so there is no `tsx` or build step for them; imports
between them carry the `.ts` extension.

| Target                     | Does                                                                          |
|----------------------------|-------------------------------------------------------------------------------|
| `make install`             | `pnpm install`                                                                |
| `make check`               | types, tests, validation, Prettier, ESLint, actionlint, shellcheck            |
| `make import DIR=`         | import a run, see [the input files](#the-input-files)                         |
| `make run REF= DRIVER= SIZE=` | run a ref of the package on this machine and import it                     |
| `make validate`            | every result against the schema and its dump, and every dump for a result     |
| `make discover`            | the runs the schedule would start now                                         |
| `make dev`, `make dev-sample` | the site with live reload, on `results/` or on sample data                 |
| `make build`, `make build-sample`, `make preview` | the static site in `dist/`, and serving it         |
| `make format`              | Prettier and ESLint fixes, in place                                           |

## Runs, identifiers and series

### What makes two runs comparable

A **series** is the set of runs whose numbers may be drawn on one line. Two runs are in the same series only when all
of these match:

| Key              | Example        | Where it comes from                                    |
|------------------|----------------|--------------------------------------------------------|
| `runner`         | `gha`, `cyril` | the workflow, or `--runner` on the local script        |
| `driver`         | `mysql`        | the run's input                                        |
| `size`           | `medium`       | the run's input                                        |
| `indexes`        | `none`         | the dataset, see [optional indexes](#optional-indexes) |
| `dataset_schema` | `1`            | `Dataset::SCHEMA_VERSION` in the package               |

The path under `runs/` and `results/` carries the first three, so a directory listing is already grouped. The other
two live in the file. A change in PHP, Laravel or database version does not start a new series, but the site marks
the point where it happened, because it is a likely explanation for a step in the line.

### Run identifier

```
<ref-slug>_<sha7>_<driver>_<size>_<runner>_<YYYYMMDDTHHMMSS>

v9_0_0_a1b2c3d_mysql_medium_gha_20261005T031244        a release on GitHub Actions
9_x_e4f5a6b_pgsql_medium_gha_20261012T030012           the weekly run of the 9.x branch
feature_x_0c1d2e3_sqlite_small_cyril_20261014T153007   a branch, run locally before merging
```

`<ref-slug>` is the ref lowercased, with every run of characters outside letters and digits replaced by an underscore.
The id is unique across the repository, because it is also the address of the run's page: CI measures one commit on
every driver at the same moment, so the driver, size and runner are part of it, and the timestamp, to the second,
makes a re-run of the same series a separate, later run instead of an overwrite. Where a series has several
runs of the same release, the trend chart uses the newest and the run page lists the others.

The `kind` field in the file says whether the ref was a `release` (a tag matching `v*`), a `branch` or a `commit`.
Trend charts order releases by semantic version and everything else by commit date.

### Subject names are a contract

The site matches subjects across runs on benchmark class, subject and parameter set name. Once results are kept, those
names are a contract between versions of the package. Renaming one is allowed, but it is a conscious choice: the old
line ends and a new one starts. The package's `benchmarks/README.md` says so (see
[changes in the package](#changes-in-the-package)).

### The input files

`make import DIR=<dir>` reads three files from one directory, which is also the shape of a workflow artifact:

| File           | Written by                                  | Contents                                                |
|----------------|---------------------------------------------|---------------------------------------------------------|
| `run.xml`      | `make bench ARGS="--dump-file=build/run.xml"` | phpbench's dump, kept byte for byte in `runs/`        |
| `meta.json`    | the workflow, or `scripts/run.sh`           | what neither phpbench nor the package can know          |
| `dataset.json` | `make bench-describe` in the package        | the seeded dataset and the database server             |

```json
{
  "ref": "v9.0.0",
  "commit": "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0",
  "committed_at": "2026-10-01T11:00:00+02:00",
  "runner": "gha",
  "machine_label": "ubuntu-24.04, 4 vCPU",
  "database_image": "mysql:8.4",
  "workflow_run": "https://github.com/cyrildewit/eloquent-viewable-benchmarks/actions/runs/123"
}
```

`package` defaults to `cyrildewit/eloquent-viewable`; `database_image` and `workflow_run` may be left out. The commit
must be the full hash and the runner lowercase letters, digits and dashes, since it becomes part of a path.

`dataset.json` is the contract for `bench-describe` in the package. It is what `Dataset` already stores, typed, plus
the database the connection points at and the installed Laravel version. Unknown keys are ignored, so the package can add fields first:

```json
{
  "schema_version": 1, "size": "small", "seed": 20260101, "anchor": "2026-01-01 00:00:00",
  "articles": 1000, "videos": 100, "views": 1000000, "max_view_id": 1000000,
  "hot_article_id": 1, "hot_article_views": 120031, "cold_article_id": 979, "cold_article_views": 95,
  "indexes": [], "seeded_at": "2026-10-02 10:27:15",
  "database": { "driver": "sqlite", "server_version": "3.53.4" },
  "laravel": "13.34.0"
}
```

An import never overwrites an existing run; it fails instead.

### The result file

`scripts/import.ts` copies the dump to `runs/` and writes:

```json
{
  "format": 1,
  "id": "v9_0_0_a1b2c3d_mysql_medium_gha_20261005T031244",
  "package": "cyrildewit/eloquent-viewable",
  "ref": "v9.0.0",
  "kind": "release",
  "commit": "a1b2c3d4e5f6…",
  "committed_at": "2026-10-01T09:00:00Z",
  "ran_at": "2026-10-05T03:12:00Z",
  "runner": "gha",
  "machine": {
    "label": "ubuntu-24.04, 4 vCPU", "os": "Linux", "arch": "x86_64", "kernel": "6.8.0-1015-azure",
    "load": [0.78, 0.88, 0.63]
  },
  "php": { "version": "8.5.11", "opcache": true, "xdebug": true },
  "laravel": "13.34.0",
  "database": { "driver": "mysql", "image": "mysql:8.4", "server_version": "8.4.6" },
  "dataset": {
    "schema_version": 1, "size": "medium", "seed": 20260101, "anchor": "2026-01-01 00:00:00",
    "articles": 10000, "videos": 1000, "views": 10000000,
    "hot_article_views": 1200310, "cold_article_views": 95, "indexes": "none"
  },
  "phpbench": "1.7.0",
  "workflow_run": "https://github.com/cyrildewit/eloquent-viewable-benchmarks/actions/runs/123",
  "subjects": [
    {
      "benchmark": "CountViewsBench",
      "subject": "benchUniqueCount",
      "set": "hot article,all time",
      "params": { "target": "hot", "days": null },
      "groups": ["read"],
      "revs": 3, "iterations": 5,
      "mode_us": 139335.379, "mean_us": 139812.0, "min_us": 138020.1, "max_us": 142001.9, "stdev_us": 1546.2,
      "rstdev": 1.106,
      "mem_peak": 5447000,
      "rejects": 0
    }
  ],
  "errors": []
}
```

Times are in microseconds per revolution, as in phpbench's XML, whatever `runner.time_unit` the package's
`phpbench.json` sets for its console, rounded to the nanosecond. `benchmark` is the class name without the namespace;
the import refuses a dump in which two classes share a short name. `params` are the parameter set's values with their
declared types, `null` for an absent one. `mem_peak` is the highest over the iterations, `rejects` the number of
iterations phpbench retried because they deviated too much. A variant that threw lands in `errors` with its message
instead of in `subjects`. `php.xdebug` says whether the extension was loaded, which it is in the package's image; the
harness refuses to run unless its mode is off, so it costs nothing measurable. `laravel` is the framework version that
was installed: the package does not commit `composer.lock`, so a release measured a year later runs on a newer Laravel
than it shipped with, and the framework builds the queries being timed. `format` is the version of this file's shape; a change to it migrates the existing files in
the same commit. `machine`, `php` and
`phpbench` come from the `<env>` and root elements of the dump. `dataset` and `database.server_version` come from the
package, see below. A subject whose `rstdev` stays above the retry threshold even after retries is kept, and the site
shows it with a warning instead of hiding it.

The schema lives once, as zod, in `src/lib/schema.ts`, imported from `astro/zod` so the scripts and the site share
Astro's copy. `src/content.config.ts` uses it for the collection, and the import and `validate.ts` use it too, so a
malformed file fails CI before it can break the site. `validate.ts` also parses each result's dump again and compares,
so a number edited by hand in a result file fails as well.

### Optional indexes

The package can measure with its two optional indexes added (`make bench-indexes`). A run with indexes is a separate
series (`indexes` is part of the key), and the import reads the value from the dataset rather than trusting a flag.
Index runs are only produced locally to begin with; the workflow always measures the plain dataset.

## The workflows

All four pass actionlint, which also runs shellcheck over every `run:` block; `ci.yml` keeps it that way. None has
run on GitHub yet: `benchmark.yml` needs the harness on an upstream ref of the package first.

### `benchmark.yml`, produce a run

Started by hand or by `discover.yml`, with three inputs: `ref` (tag, branch or commit of the package), `size` (`small`
or `medium`, default `small`) and `drivers` (comma-separated, default all four).

1. **`prepare`** checks the package out at the ref, refuses one without `benchmarks/describe.php`, resolves the commit
   and its date, and turns `drivers` into a matrix after checking every name.
2. **`run`**, one job per driver on `ubuntu-24.04`, 90 minutes at most, `fail-fast` off. In the package checkout:
   `mkdir -p build` (gitignored, and phpbench only warns when it cannot write its dump there), `make build`,
   `make install`, `make bench-seed`, `make bench-describe ARGS=--output=build/dataset.json`, and
   `make bench ARGS=--dump-file=build/run.xml`. A failing subject makes phpbench exit non-zero but still write the dump,
   so that step only warns and then requires the dump to exist; the import records the failure in `errors`. The job
   writes `meta.json` with `jq` (the database image from the package's compose file, a machine label from the OS, CPU
   count and memory, the workflow run URL) and uploads the three files as an artifact `run-<driver>`, kept 90 days.
3. **`collect`** runs when `prepare` succeeded, even if some drivers failed. It checks out `main`, installs with pnpm,
   downloads every `run-*` artifact, imports each, validates everything, and commits `runs/` and `results/` as
   `data: <ref> on gha, <size>, <drivers>`. The push rebases and retries up to five times, since another run may have
   pushed in between. `contents: write` is granted to this job only.
4. **`pages`** calls `pages.yml`, because a push made with `GITHUB_TOKEN` starts no other workflow.

Sizes in CI: `small` on a manual dispatch by default, `medium` for releases and the weekly run, `large` never. Fifty
million rows take too long to seed on a shared runner, and a hosted runner's free disk is tight for it.

### `discover.yml`, start runs on a schedule

Daily at 03:17 UTC, and by hand. It runs `scripts/discover.ts`, which:

- lists the package's tags and branches with `git ls-remote`;
- plans every release from `v9.0.0` on, pre-releases excluded, that lacks a `gha` run at `medium` without indexes on
  any of the four drivers, with only the missing drivers, oldest release first;
- plans a `medium` run of the branch in the `WEEKLY_BRANCH` repository variable when its last such run is six or more
  days old. It is off while the variable is unset, so it can be switched on once the harness is on that branch.

Each planned run is started with `gh workflow run benchmark.yml`. A `workflow_dispatch` made with `GITHUB_TOKEN` does
start a run, unlike a push, so this needs only `actions: write` and no personal token. `make discover` prints the
plan locally.

### `pages.yml`, publish the site

Runs on a push to `main` that touches the site, its dependencies or `results/`, when called from `benchmark.yml`, and
by hand. It always checks out `main`: when called after a data commit, the commit that triggered the caller predates
the data. It builds with `withastro/action` and deploys with `actions/deploy-pages`; the repository's Pages source must
be set to GitHub Actions. A manual run has a `sample` input that deploys the sample data instead, with its banner, so
the site can be looked at before real runs exist.

### `ci.yml`, keep the repository healthy

On pull requests and pushes to `main`: `astro check`, Vitest, `validate.ts`, Prettier and ESLint, shellcheck on
`run.sh`, actionlint on the workflows, and the site built twice, on `results/` and on sample data, so every page is
exercised even while the real data is thin. It runs pnpm and Node directly on the runner, with the store cached, rather
than through the container; the commands are the same.

### Resource notes

- One run of four drivers at medium takes roughly 15 to 25 minutes of wall time in parallel, about an hour of billed
  runner minutes. Public repositories run free on standard hosted runners.
- The package's `docker-compose.yml` is used as checked out at the ref, so an old release is measured with the service
  settings it shipped with.

## The local script

`scripts/run.sh` (or `make run`) is the same sequence for a maintainer's machine, where the large size and quiet
conditions are available. It needs git, make and Docker on the host, like the package does; PHP and Node run in
containers.

```bash
scripts/run.sh v9.0.0 mysql medium --runner=cyril --label="MacBook Pro M3, Docker Desktop 8 GB"
scripts/run.sh v9.1.0 mysql medium                      # later runs reuse the stored runner
make run REF=9.x DRIVER=pgsql SIZE=large ARGS="--indexes=visitor"
```

1. Clones the package into `.cache/package` (gitignored), or fetches it, from GitHub or from `--repo=<url or path>`
   (also `PACKAGE_REPO`). The ref is looked up as a tag, then as a branch on the remote, then as a commit.
2. Checks it out detached in that one checkout, and refuses a ref without `benchmarks/describe.php`.
3. Runs the package's `make build` and `make install`.
4. Seeds the dataset, unless `make bench-describe` shows one of the asked size is already there. Every ref runs under
   one Compose project, `eloquent-viewable-bench`, so the `bench-*` volumes carry over from ref to ref, and a medium
   MySQL dataset is seeded once rather than once per release. A dataset from an older seeder fails to describe and is
   seeded again. The seed is deterministic, so a reused dataset is the same data a fresh seed would give.
5. Sets the optional indexes to `--indexes` (default `none`), describes the dataset, and runs the benchmarks with
   `--dump-file`.
6. Writes `meta.json`, with the database image read from the package's compose file, and runs `make import` from
   `build/<runner>-<driver>-<size>/`.

It does not commit, so a run can be looked at first. The maintainer opens a pull request with it, and `ci.yml`
validates it.

`--runner` is a short, stable name per machine and `--label` describes the machine. Both are required on the first
run and stored in `.cache/runner.env`; later runs reuse them, and a different `--runner` is refused, so one laptop
stays one series over the years. `gha` is reserved for GitHub Actions.

## The website

Built and checked on 64 sample runs: four releases and six weekly runs on four drivers, plus two laptop series, with
an invented regression, a speed-up and a PHP and a Laravel upgrade along the way. `make dev-sample` serves it; every
page then carries a banner saying the numbers are made up, and is marked `noindex`.

### Pages

**Overview (`/`).** Answers "did the last release get slower". For the reference series (`gha`, `medium`, no indexes,
newest dataset schema; else the series that ran last) it shows a tile per database with the latest release against
the one before: how many subjects got slower, faster, or stayed within noise, a thin bar of the three, and a link to
the full comparison. Below that the ten largest changes across databases, and the twelve most recent runs.

**Trends (`/trends/`).** One chart per subject, grouped by benchmark with reading first, then writing, then PHP-only,
one line per database. A filter row (runner, dataset size, optional indexes, group, and along releases or along the
weekly branch runs) holds the shared legend and is sticky from tablet width up. The filters are kept in the URL. The x
axis is the releases in version order, or the dates of the weekly runs; a database without a run at a point leaves a
gap rather than a line drawn through it. The y axis starts at zero, in one unit per chart. The tooltip lists every
database at that point, the value first, with its deviation, and the PHP and Laravel versions. A vertical hairline marks
each point where PHP or Laravel changed, explained once above the charts. Each chart has a table of the same numbers,
each linking to its run. Charts are drawn as they scroll into view and redrawn when the theme changes.

**Run (`/runs/<id>/`).** Generated at build time, one page per result file: every metadata field, links to the commit,
the raw XML and the workflow run, a comparison with the previous run in the same series, other runs of the same ref,
any failed subjects with their messages, and a sortable table of all measurements, with a warning on a deviation
above phpbench's retry threshold.

**Compare (`/compare/?a=<id>&b=<id>`).** Any two runs, picked from lists grouped by series. Without a choice in the
URL it shows the last two releases of the reference series. It says which series the runs are from, warns when they
are from different series or when PHP, Laravel or the database changed in between, and shows tiles of the three
verdicts and a sortable table with both modes, their deviations, the change and the verdict. A swap button and a
filter for changes beyond noise; all of it kept in the URL.

**About (`/about/`).** What is measured, the dataset, how to read a number, the runners, and where the data lives.

### Design

- Tailwind CSS v4 through its Vite plugin, system fonts, and colour roles as CSS custom properties in
  `src/styles/global.css`, with a dark set of their own. The theme follows the system, with a toggle (system, light,
  dark) remembered in `localStorage` and applied before the first paint.
- The four drivers take the first four slots of a validated categorical palette, in a fixed order, so a driver keeps
  its colour whatever the filters hide. The palette was checked with a colour-vision validator in both themes: it
  passes, with aqua and yellow under 3:1 on the light surface, which is why every chart has a legend, a table, and a
  marker shape per driver (circle, square, triangle, diamond) as a second channel.
- Faster and slower are the blue and red poles of a diverging pair, with grey for within noise, and every verdict
  also carries a word and an arrow.
- Lines are 2px, markers 8px with a ring in the surface colour, gridlines solid hairlines. Text never takes a series
  colour; identity comes from the mark beside it.
- Numbers are formatted with a unit per value (µs, ms, s) to three significant digits, changes with a sign. Tables
  scroll in their own box on narrow screens; the page body never does.
- ECharts is imported per part (line chart, grid, tooltip, mark line, SVG renderer). That is still about 500 kB
  minified, 175 kB compressed, and only the trends page loads it.

### Data at build time

`src/content.config.ts` defines a `runs` collection with Astro's glob loader over `results/**/*.json` (or
`RESULTS_DIR`), validated by the schema from `src/lib/schema.ts`. The overview and run pages are computed at build time;
trends and compare load `/data/index.json`, every run's metadata and modes aligned to one list of subjects, and compute
in the browser with the same functions from `src/lib/`, which have unit tests. With no results at all, every page shows
an empty state instead of failing.

GitHub Pages serves the site at `https://cyrildewit.github.io/eloquent-viewable-benchmarks/`, so `astro.config.mjs`
sets `site` and `base` accordingly and every internal link goes through one `href()` helper. A custom domain can
replace that later with a `CNAME` in `public/` and a change of `base`.

## Changes in the package

Small, and each useful on its own:

1. **A `bench-describe` target and `bench:describe` Composer script** that prints the seeded dataset as JSON: the
   attributes `Dataset` already stores (schema version, size, seed, counts, hot and cold article, indexes) plus the
   driver and server version of the connection and the installed Laravel version, or writes it to a file with
   `ARGS=--output=<file>`, failing when it cannot. Before this, that
   information was only printed as a sentence by the seeder. *Done*, as `Dataset::toArray()` and
   `benchmarks/describe.php`; checked on all four drivers, and the output of each passes `datasetSchema` here. The
   server versions read `3.53.4`, `8.4.11`, `11.8.9` and `17.11 (Debian 17.11-1.pgdg13+2)`.
2. **A sentence in `benchmarks/README.md`** declaring benchmark class, subject and parameter set names stable, with a
   link to this repository. *Done*, in a "Results over time" section, together with item 4.
3. **A link from the Optimizing section of the package README** to the website. Waits until the site is live, at
   the end of phase 5, so the README never links to a page that does not exist.
4. **A stable `make` interface.** The workflow relies on `make build`, `make install`, `make bench-seed`,
   `make bench-describe` and `make bench` with `DRIVER`, `SIZE` and `ARGS`. That is noted in `benchmarks/README.md`
   too, so a refactor of the Makefile keeps those working or updates this repository in the same breath.

The `git` env provider in `phpbench.json` stays off, since the harness runs inside containers that cannot see a
worktree. The commit is recorded by this repository instead.

Nothing has to be added to the package's workflows, secrets or release process.

## Phases

1. **Repository basics.** README, AGENTS.md, LICENSE, `.gitignore`, `.gitattributes`, `.editorconfig`. *Done.*
2. **Toolchain and import.** `docker-compose.yml`, `Makefile`, `package.json`, the zod schema, `scripts/import.ts` and
   `scripts/validate.ts`, with tests against the `main_sqlite` dump from the `feature/benchmarks` branch. *Done.* The
   parsed modes, deviations and memory match what `phpbench report --ref=main_sqlite` prints for the same run.
3. **Package changes.** `bench-describe` and the README sentences. *Done* on `feature/benchmarks`, except the README
   link, which waits for the site. Merged before the first CI run, since the workflow depends on them.
4. **Local runner.** `scripts/run.sh` and `make run`. *Done*, and tested end to end against a throwaway clone of the
   package with the harness committed: a fresh clone, seed and full suite, then a second run that reused the seeded
   dataset and the stored runner. The first real data, 9.x on SQLite small and MySQL medium, waits until the harness
   is pushed: a run must point at a commit that exists upstream and contains the code it measured.
5. **Site.** *Done* on sample data: overview, trends, run, compare and about pages, light and dark, checked in a
   browser at desktop and phone width. `ci.yml`, `pages.yml`, Dependabot, ESLint. Waits for its first deploy.
6. **Workflow.** `benchmark.yml` *written* and linted. Still to do on GitHub: one manual run on one driver, then all
   four; measure how long a medium seed takes per driver and set the timeouts from that.
7. **Schedule.** `discover.yml` *written* and linted, its rules unit-tested and checked against the real package
   remote. Set `WEEKLY_BRANCH` once the harness is on 9.x.
8. **Backfill.** Once 9.0 is tagged, run it on every driver at medium on `gha` and on one maintainer's machine, so the
   first release has a complete baseline in both series.

If running this turns out to be rare, a few times a year before releases, phases 6 and 7 can wait. Phases 2 to 5 and
8 alone give a versioned store of runs and a site to read them, fed by hand.

## Risks and how they are handled

| Risk                                                         | Handling                                                                     |
|--------------------------------------------------------------|------------------------------------------------------------------------------|
| Hosted runners are noisy                                     | Trends only, a noise threshold in comparisons, the weekly branch run shows drift |
| An old ref's Makefile differs from the one this repo expects | The `make` interface is documented as stable in the package                  |
| phpbench changes its XML format in a 2.0                     | The phpbench version is recorded per run; the parser checks it and fails loudly |
| A subject is renamed                                         | The line ends and a new one starts; the naming contract makes it deliberate  |
| The seeder changes what it generates                         | `dataset_schema` is part of the series key, so lines break instead of lying  |
| The repository grows                                         | About 100 KB of XML and a few KB of JSON per driver run, under 25 MB a year  |
| A data commit does not deploy the site                       | `benchmark.yml` calls `pages.yml` directly instead of relying on `push`      |
| Runs started together are cancelled by a concurrency group   | No concurrency group; the collector's push rebases and retries               |
| Dependabot moves TypeScript to 7, which `astro check` refuses | TypeScript majors are ignored in `dependabot.yml` until `@astrojs/check` follows |

## Open questions

- **The noise rule on GitHub Actions.** A change counts when it exceeds 5% and twice the two runs' combined deviation.
  phpbench's deviation only measures the spread *within* a run, and hosted runners drift 10 to 30% *between* runs, so
  on `gha` the rule will call drift a change. The sample data shows it: about a third of the subjects in each tile
  are flagged with no change in the code. Two ways out: a higher floor per runner (say 15% for `gha`), or, better,
  a floor per subject measured from the weekly branch runs, whose spread is exactly that drift. The second needs a
  few weeks of weekly runs first; the first is a one-line change now.

- **Reference runner.** The site defaults to `gha` because it is always there. If a maintainer's machine turns out to be
  run as regularly, it is more trustworthy and could become the default.
- **Custom domain.** `github.io` to start; a subdomain such as `benchmarks.cyrildewit.nl` only needs a `CNAME` later.
- **Index runs in CI.** Worth adding once the plain series is stable, as a second matrix dimension on releases only.
