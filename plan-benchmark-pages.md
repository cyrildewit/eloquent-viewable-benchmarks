# Plan: a page per benchmark, with the SQL it measures

> **Status:** implemented, see phase 9 in [`benchmark-repo.md`](benchmark-repo.md). The real fixture of step 6 came
> from the first 9.x run through the workflow.

This plan adds a page per benchmark class to the site, such as `/benchmarks/count-views/`, that shows how fast every
query of that benchmark is right now on every database, how it developed over the releases, and the SQL and query
plan behind each number. It extends [`benchmark-repo.md`](benchmark-repo.md), which stays the source of truth for
everything it does not change; the section [Changes to the main plan](#changes-to-the-main-plan) lists what to amend
there when this lands.

The SQL comes from the package. [`plan-package-queries.md`](plan-package-queries.md) is the matching plan for
`cyrildewit/eloquent-viewable`: it makes `make bench-explain` write a `queries.json` keyed on the same names as
phpbench's dump. The two plans share that file format, defined once in [The queries file](#the-queries-file). The
package side goes first; the pages here can be built on sample data in the meantime.

## Goals

- One address per benchmark that answers "how fast is `count()` on the hot article on each database" without
  reading a chart, and that can be linked from the package README and from issues.
- The same page shows the query a number stands for, and its plan, so a slower number can be read next to the
  statement that caused it.
- Nothing new in the browser: the data the page needs is already in the compact index, apart from the SQL, which is
  rendered at build time.

## Non-goals

- SQL for the write and PHP-only groups. `record()` is one insert, `destroy()` one delete, and `ViewSeries` and
  `CooldownManager` do not touch the database. The page shows "no queries captured" for those subjects.
- Query plans with actual row counts (`--analyze`) in CI. A plain plan is deterministic, so two releases can be
  compared on it; an analyzed plan carries timings that drift like every other timing. `--analyze` stays a local
  tool and the file records whether it was used.
- A page per subject or per parameter set. Seven class pages with anchors per subject are enough; the trends page
  already has a chart per parameter set.

## Decisions

| Topic                     | Decision                                                                                          |
|---------------------------|---------------------------------------------------------------------------------------------------|
| Page per                  | benchmark class, at `/benchmarks/<slug>/`, generated at build time for every class in the results |
| Slug                      | the class name without the `Bench` suffix, in kebab-case: `CountViewsBench` → `count-views`        |
| Timings and charts        | rendered in the browser from `/data/index.json`, with the same series filters as the trends page  |
| SQL and plans             | rendered at build time for the reference series, the latest release per database                  |
| Where the SQL is stored   | `queries.json` from the package, kept byte for byte in `runs/`, and a derived copy in the result   |
| Result format             | bumped to 2: `classes` and `queries` added. `results/` is still empty, so nothing is migrated     |
| Older refs without the file | allowed; the result carries `queries: null` and the page says so                               |
| Index page                | `/benchmarks/` lists the classes, replaces nothing, gets a navigation entry                       |

The slug rule exists so the page address survives a reorganisation of the namespaces in the package: only the class
short name goes in, and that name is part of the naming contract already. Two classes mapping to one slug fail the
build.

The timings are drawn in the browser because the reader will want to flip runner and dataset size, and the index
already holds every mode and deviation. The SQL is not put in the index: it would add tens of kilobytes per run to a
file every trends visit loads, and a query differs between runners and sizes only in the article id. Showing it for
the reference series at build time, labelled with the run it came from, is enough.

## The page

`/benchmarks/count-views/`, from top to bottom:

1. **Heading.** The class name, the sentence from `BENCHMARK_DESCRIPTIONS`, the group label, and a link to the class
   in the package at the latest measured commit. The link is built from the fully qualified class name recorded in
   the result (see [the result file](#the-result-file)) by PSR-4: `CyrildeWit\EloquentViewable\Benchmarks\` maps to
   `benchmarks/`, so `…\Querying\CountViewsBench` links to `benchmarks/Querying/CountViewsBench.php` at that commit.
   The prefix is a constant in `src/lib/site.ts` with a comment saying it is the package's autoload rule.

2. **The filter row** from the trends page: runner, dataset size, optional indexes, and along releases or weekly branch
   runs. No group filter, the page is one benchmark. Kept in the URL as on the trends page. The legend of databases
   sits in the row as it does there.

3. **"Right now", one table per subject.** For the last point of the selected series, which is the latest release
   or the latest weekly run: rows are the parameter sets in index order, columns the databases in their fixed order,
   each cell the mode with its deviation, linking to the run, with the noisy warning used on the run page. A database
   without a run at that point shows a dash. The heading above the tables names the point, for example
   "v9.2.0 on GitHub Actions, medium dataset", and the subject name is a heading with an anchor
   (`#benchUniqueCount`), so a chart or an issue can link to one subject. Lower is faster, said once.

   This is the last point of the trend the trends page already builds, so it is a pure function over a `Trend`:
   `latestPoint(trend, subjects)` in `src/lib/snapshot.ts`, unit-tested.

4. **Trend charts** for this benchmark's subjects only, the same cards as the trends page, same tooltip, same table
   behind a disclosure, same version markers. The trends page's `renderTrends` is split so both pages call one
   `renderSubjectCards(index, filter, subjects, …)`; the trends page passes every subject grouped by class, the
   benchmark page passes its own.

5. **Queries**, build time. For every subject that has queries in the reference series: one block per parameter set
   with the SQL in a `<pre>` that wraps, and the plan per database behind a `<details>`, the database name with its
   colour mark as the summary. The plan is a table when it has several columns (SQLite, MySQL, MariaDB) and
   preformatted lines when it has one (PostgreSQL). Above the blocks, one sentence says which run the queries come
   from per database, each linking to the run, and whether they were analyzed. When the latest release's plan differs
   from the previous release's on the same database, the summary gets a "plan changed in v9.2.0" note: the rows are
   compared as strings, nothing cleverer. Subjects without captured queries get one line saying so, with a link to
   the class.

   Without any run in the reference series, the section says so and nothing else.

6. **Noscript**: the SQL section works without JavaScript; the timings do not, and the note points to the run pages.

`/benchmarks/` lists every class with its description, group, number of subjects and a link, in the group order used
everywhere (reading, writing, PHP only). "Benchmarks" joins the header navigation between Trends and Compare.

Links in: the benchmark name becomes a link on the overview's largest-changes list, on the run page's table, on the
compare page's table, in the trends page headings, and in the about page's "What is measured" table.

## The queries file

`queries.json` is written by the package, `make bench-explain DRIVER=<driver> ARGS="--output=build/queries.json"`,
after a run, and travels with `run.xml`, `meta.json` and `dataset.json`. Its shape is a contract with the package,
the same way `dataset.json` is; the package plan defines how it is produced, this plan how it is read.

```json
{
  "schema_version": 1,
  "driver": "mysql",
  "analyzed": false,
  "group": "read",
  "subjects": [
    {
      "class": "CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\CountViewsBench",
      "subject": "benchCount",
      "set": "hot article,all time",
      "params": { "target": "hot", "days": null },
      "queries": [
        {
          "sql": "select count(*) as aggregate from `views` where `views`.`viewable_type` = 'article' and `views`.`viewable_id` = 1",
          "plan": {
            "columns": ["id", "select_type", "table", "partitions", "type", "possible_keys", "key", "key_len", "ref", "rows", "filtered", "Extra"],
            "rows": [["1", "SIMPLE", "views", null, "ref", "views_viewable_type_viewable_id_viewed_at_index", "…", "…", "const,const", "1200310", "100.00", "Using index"]]
          }
        }
      ]
    }
  ]
}
```

- `class` is the fully qualified class name without a leading backslash. `subject` is the method. `set` is the
  parameter set name exactly as phpbench names it: the provider keys joined with a comma and no space, or an empty
  string for a subject without providers. The triple must match a variant in the dump; the import refuses a file
  with a key the dump does not have, since that means the names have drifted.
- `queries` holds every statement the subject ran, in order, with bindings substituted so the statement is what was
  explained. Most subjects run one.
- `plan.columns` and `plan.rows` are the explain statement's result as strings, `null` kept as `null`. The columns
  differ per driver and that is fine; the site does not interpret them.
- `analyzed` says whether the queries were executed (`--analyze`), and `group` which phpbench group was captured.
- Unknown keys are ignored, so the package can add fields first, as with `dataset.json`.

## Data changes in this repository

### The result file

`RESULT_FORMAT` becomes 2. Two fields are added to the result, and nothing else moves:

```json
{
  "format": 2,
  "classes": {
    "CountViewsBench": "CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\CountViewsBench"
  },
  "queries": {
    "analyzed": false,
    "group": "read",
    "subjects": [
      { "benchmark": "CountViewsBench", "subject": "benchCount", "set": "hot article,all time", "queries": [ { "sql": "…", "plan": { "columns": [], "rows": [] } } ] }
    ]
  }
}
```

- `classes` maps every short class name in `subjects` and `errors` to the fully qualified name from the dump, with
  the leading backslash stripped. It comes from the XML, so `verify.ts` compares it like the other dump-derived
  fields, and the benchmark page uses it for the source link.
- `queries` is `null` when no `queries.json` was imported. Otherwise it is the file's subjects with `class` replaced
  by the short `benchmark` name and `params` dropped, since the dump already has them. `analyzed` and `group` are
  kept.

`results/` is empty, so no migration; the fixture-based tests and `tests/support.ts` change with the schema. The
zod schema for `queries.json` itself (`queriesSchema`) lives in `src/lib/schema.ts` next to `datasetSchema`.

### Import, storage and validation

- `scripts/import.ts` reads `queries.json` from the directory when present. The raw file is stored unchanged as
  `runs/<runner>/<driver>/<size>/<id>.queries.json`, next to the dump; `resultPaths()` gains a `queries` path. The
  import fails on an existing file as it does for the dump, and on a subject key missing from the dump.
- `src/lib/importer.ts`: `buildResult(xml, meta, dataset, queries?)` does the conversion; a `fromQueries()`
  counterpart of `fromDump()` gives `verify.ts` the derived form to compare.
- `scripts/validate.ts` and `src/lib/verify.ts`: when the result has `queries`, the raw file must exist and
  re-derive to the same value; when the result has `queries: null`, no raw file may exist. A `.queries.json` under
  `runs/` without a result is reported like a dump without one.
- `scripts/run.sh` runs `make bench-explain DRIVER=… ARGS="--output=build/queries.json"` after the benchmarks and
  copies the file into the import directory when it exists. An older ref whose `explain.php` does not know
  `--output` prints its console report and writes nothing; the step tolerates that with a warning, and the run is
  imported without queries.
- `.github/workflows/benchmark.yml`, the `run` job: the same step between "Run the benchmarks" and "Collect the
  run", tolerant the same way, and `queries.json` joins the files copied to `out/`. Nothing changes in `collect`.
- `scripts/sample.ts` writes a `queries` block for the read subjects of every sample run, from a template per driver
  with the article id and period filled in, and a plan of two or three made-up rows in that driver's columns. One
  release changes the plan on one database so the "plan changed" note can be seen.
- `src/lib/data.ts`: the index gains nothing. `RunSummary` gets `hasQueries: boolean` so the page can say which runs
  have SQL, which costs one byte per run.

### Tests

- `tests/importer.test.ts`: a result from the fixture with and without a queries file; the drift check; `classes`
  derived from the dump; the slug function on the seven class names and on a collision.
- `tests/verify.test.ts`: a result whose raw queries file is missing, edited, or present while the result says
  `null`.
- `tests/snapshot.test.ts`: `latestPoint()` on a small index, including a database missing at the last point and a
  subject present only in older runs.
- `tests/fixtures/main_sqlite/queries.json`: the real output of the package's `bench-explain --output` on the same
  SQLite small dataset, once the package side exists. Its keys must match the fixture dump's subjects, which the
  import test asserts; that is the end-to-end check of the naming rule across the two repositories. Until the
  package produces it, `tests/support.ts` builds a minimal queries file for the tests, and the fixture is added in
  the commit that lands the real one.

## Site changes

| File                                             | Change                                                                          |
|--------------------------------------------------|---------------------------------------------------------------------------------|
| `src/lib/benchmarks.ts`                          | `benchmarkSlug()`, `benchmarkFromSlug()`, the collision check                   |
| `src/lib/site.ts`                                | `benchmarkHref()`, `sourceUrl(fqcn, commit)` with the PSR-4 prefix constant     |
| `src/lib/snapshot.ts`                            | `latestPoint(trend, subjects)`, the cells of the "right now" tables             |
| `src/lib/queries.ts`                             | picks the latest release per database of the reference series, pairs subjects with their queries, compares plans with the previous release |
| `src/lib/schema.ts`                              | `queriesSchema`, `classes` and `queries` on the result, `RESULT_FORMAT = 2`     |
| `src/components/SeriesFilters.astro`             | the filter row, extracted from `trends.astro`, with a prop that hides the group filter |
| `src/scripts/series-filters.ts`                  | `readFilters()` and `restoreFilters()`, extracted from `trends.ts`              |
| `src/scripts/subject-cards.ts`                   | `renderSubjectCards()`, the card, chart option, tooltip and table from `trends.ts` |
| `src/scripts/trends.ts`                          | keeps only the page wiring and the grouping by class                            |
| `src/scripts/benchmark.ts`                       | the page wiring: filters, the "right now" tables, then the cards                |
| `src/pages/benchmarks/index.astro`               | the list                                                                        |
| `src/pages/benchmarks/[slug].astro`               | the page; `getStaticPaths` over the classes in the index                        |
| `src/layouts/Base.astro`                         | the navigation entry                                                            |
| `index.astro`, `runs/[id].astro`, `compare.ts`, `trends.ts`, `about.astro` | benchmark names become links                          |
| `src/styles/global.css`                          | only if the plan table needs a rule the data table does not have                |

`src/lib/queries.ts` runs at build time only and may read nothing from Node either: the result objects already hold
the queries. The pure functions in `src/lib/` keep their unit tests and stay free of DOM and Node.

## Changes to the main plan

When this lands, amend `benchmark-repo.md` in the same commit:

- "Decisions taken": a row for the benchmark pages and one for `queries.json`.
- "Repository layout": `src/pages/benchmarks/`, `src/lib/snapshot.ts`, `src/lib/queries.ts`, the raw
  `runs/…/<id>.queries.json`.
- "The input files": a fourth row for `queries.json`, with a pointer to the format in this file or the format moved
  there.
- "The result file": the example and the paragraph gain `classes` and `queries`, and `format` becomes 2.
- "The workflows", `benchmark.yml` step 2, and "The local script" step 5: the explain step.
- "The website", "Pages": a paragraph for `/benchmarks/` and `/benchmarks/<slug>/`.
- "Changes in the package": item 5, `bench-explain --output`, done or pending.
- "Phases": a phase 9 for this work, and `AGENTS.md`'s list of Node-importing files if `queries.ts` ends up needing
  Node, which it should not.

## Order of work

1. **Schema and import** (`format` 2, `classes`, `queries`, raw file, verify, tests, `tests/support.ts`). Can be
   done before the package side exists, against the hand-built queries file. One commit, `feat(import): …`.
2. **Sample data** with queries and a plan change, so the page has something to show. `feat(sample): …`.
3. **Refactor the trends page** into the shared filter row and subject cards, with no visible change. Check the
   trends page in the browser before and after. `refactor(site): …`.
4. **The benchmark pages and the index page**, links in, navigation. Check on `make build-sample` and
   `make preview`, light and dark, desktop and phone width. `feat(site): …`.
5. **Workflow and local script** steps. `ci: …` and `feat(run): …`; `make lint-ci` for actionlint and shellcheck.
6. **The real fixture** once the package's `bench-explain --output` is merged: generate it on SQLite small, add it,
   switch the tests to it, remove the hand-built file. `test: …`.
7. **Plan update** per the list above, in the commit of step 4 or a `docs:` commit right after.

`make check` before handing each step back, as always.

## Open questions

- **Which run supplies the SQL when the reference series has no release yet.** The plan says the latest release of
  the reference series; before the first release that is nothing, and the page would show no SQL even with weekly
  runs present. Fallback to the newest run of the series, labelled, seems right, and is what `referenceSeries()`
  already does for the overview.
- **Plans across dataset sizes.** A plan can differ between small and medium on the same release, since the
  optimiser sees different statistics. The page shows the reference series only. If that turns out to matter, the
  SQL section could take the size from the URL and be rendered per size at build time, which is four times the HTML.
