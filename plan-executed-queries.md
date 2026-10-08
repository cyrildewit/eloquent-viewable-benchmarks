# Plan: every statement of a variant, with its time, from `bench-explain --execute`

This plan is for this repository. Its package half is done in
[cyrildewit/eloquent-viewable#388](https://github.com/cyrildewit/eloquent-viewable/pull/388), commit
`test(benchmarks): explain every statement of a subject that reads rows`. Read the package section first: it fixes the
file format this plan reads.

## Why

`make bench-explain` runs every variant inside `$connection->pretend()`. Under `pretend()` a `select` returns no rows,
so a subject whose later statements depend on the rows of an earlier one only reports its first statement. The first
subject where this matters is `RecommendedBench`: `recommended()` reads the visitor's recent views, then pairs them,
then counts the visitors of every model in a pair, then loads the models. The site shows one statement out of six, and
not the one that costs the time.

The package now has `--execute`, which runs each variant for real inside a transaction that is rolled back and
captures every statement it made, with the time each took. This repository should ask for it, store what it adds, and
show it on the benchmark pages.

## What the package writes now

`make bench-explain ARGS="--execute --output=build/queries.json"` writes the same `queries.json` as before, with two
keys added. Nothing is renamed or removed and `schema_version` stays `1`, as the format's rules allow.

```json
{
  "schema_version": 1,
  "driver": "sqlite",
  "analyzed": false,
  "executed": true,
  "group": "read",
  "subjects": [
    {
      "class": "CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\RecommendedBench",
      "subject": "benchRecommended",
      "set": "occasional visitor,five hundred visitors,past 30 days",
      "params": { "visitor": "occasional", "max_visitors": 500, "days": 30 },
      "queries": [
        { "sql": "select …", "plan": { "columns": ["id", "parent", "notused", "detail"], "rows": [["…"]] } },
        { "sql": "select …", "plan": { "columns": ["…"], "rows": [] } }
      ],
      "timings_ms": [0.1, 3.68]
    }
  ]
}
```

| Key          | Where             | Meaning                                                                                                     |
|--------------|-------------------|-------------------------------------------------------------------------------------------------------------|
| `executed`   | header, always    | whether the variants ran for real (`--execute`). `false`, or absent in a file from an older package, means `pretend()` |
| `timings_ms` | per subject, only when `executed` | the time of each statement in milliseconds, one per entry of `queries`, in the same order, as Laravel's query log measured it (two decimals) |

**The timings sit beside `queries`, not inside each query.** This repository's `querySchema` is a `strictObject`, so
a `time` key inside a query would make every importer in use today refuse the file. The header and the subject entries
are parsed with `z.object`, which drops unknown keys. I checked the package's output against `queriesSchema` at
`98d8900`: it parses, and `executed` and `timings_ms` are dropped.

**Old refs keep working.** A package ref whose `explain.php` predates `--execute` ignores the option, since PHP's
`getopt()` only returns the options it was asked for. It writes a `pretend()` file without `executed`, which this
repository then reads as `executed: false`. So `run.sh` and the workflow can pass `--execute` to every ref.

**Times are one execution, not a benchmark.** Each statement ran once, right after phpbench's run, with a warm cache.
They show where a variant's time goes. They are not comparable with phpbench's mode, and not stable enough to chart.

## Changes

### 1. `src/lib/schema.ts`, the raw file

- `queriesSchema` header: add `executed: z.boolean().default(false)`.
- The subject entry: add `timings_ms: z.array(z.number().nonnegative()).optional()`.
- Refine the subject entry: when `timings_ms` is present, its length equals `queries.length`. The error names the
  class, subject and set.
- Leave `querySchema` as it is: `sql` and `plan`, strict.

### 2. `src/lib/schema.ts`, the result file: format 3

The result's `queries` object and its subjects are `strictObject`s, so storing the new data changes the result shape.
Following the rule in `AGENTS.md`, do all of this in one commit:

- Bump `RESULT_FORMAT` to `3`.
- The result's `queries` gains `executed: z.boolean()`.
- `subjectQueriesSchema` gains `timings_ms: z.array(z.number().nonnegative()).nullable()`: `null` when the run was not
  executed, otherwise one number per query.
- Migrate every file in `results/`. Do not edit by hand: re-derive each one through the importer from its `runs/`
  dump, `.queries.json` and the metadata already in the result, or write a one-off script that sets `format: 3`, adds
  `executed: false` and adds `timings_ms: null` to each subject entry, and delete the script afterwards. Either way
  `make validate` must pass afterwards, which proves every result equals what `deriveQueries()` makes of its raw file.
  Every raw file stored today predates `--execute`, so all of them become `executed: false` and `timings_ms: null`.

### 3. `src/lib/importer.ts`

`deriveQueries()` carries the new data through: `executed: file.executed`, and per subject
`timings_ms: subject.timings_ms ?? null`. The class, subject and set checks stay as they are. Leave `buildResult()`
and `resultPaths()` alone; the raw file is still stored byte for byte.

### 4. `src/lib/queries.ts`

- `QuerySource` gains `executed: boolean`.
- `DriverQueries` gains `timings: number[] | null`.
- **Compare plans only between files captured the same way.** An executed run reports statements that a `pretend()`
  run never saw, so `samePlans()` would mark every subject of `RecommendedBench` as changed the first time a release is
  executed. When `current.queries.executed !== before.queries.executed`, set `planChanged` to `null`, and say why in a
  comment. `samePlans()` itself is unchanged.

### 5. `src/pages/benchmarks/[slug].astro`

- **Intro sentence:** when any source is executed, add "run for real, each statement timed once" next to the
  existing analyzed wording. Keep it one sentence.
- **Per statement:** when `item.timings` is not null, show its time next to the SQL as `3.68 ms`, using the site's
  number formatting in `src/lib/format.ts`, in the same muted style as the statement count.
- **Per variant:** add the total to the `<summary>`: "6 statements, 3.2 s".
- **No chart and no comparison** of these times between runs. They are a single execution; see
  [Open questions](#open-questions).
- **Check in a browser,** light and dark, with `make build-sample` and `make preview`, as `AGENTS.md` asks.

### 6. `scripts/sample-queries.ts`

- Mark half of the sample runs as executed, with plausible made-up timings per statement, so `make dev-sample` shows
  both kinds.
- Give `RecommendedBench`'s samples four or more statements, so the multi-statement layout is visible.
- Sample data never goes into `results/`.

### 7. Running it: `scripts/run.sh` and `.github/workflows/benchmark.yml`

- **Pass the flag:** in both places, change `ARGS="--output=build/queries.json"` to
  `ARGS="--execute --output=build/queries.json"`, and update the comment above each: the explain step now runs every
  read variant once more, for real.
- **Check the time budget.** The step now costs roughly one more iteration of the `read` group per driver. On the
  `small` SQLite dataset, the slowest variant, `RecommendedBench` with every visitor over all time, takes about 45 s
  on its own. The `run` job has `timeout-minutes: 90`. Before merging, run the workflow once at `medium` on all
  drivers and note the explain step's duration in the pull request. If it gets close, see the open question on a
  time limit.
- **Failure stays a warning.** A failing explain step keeps doing what it does now: warn and import without queries.

### 8. Tests

- **`tests/importer.test.ts`:**
  - the existing fixture `tests/fixtures/main_sqlite/queries.json` still imports, with `executed: false` and every
    `timings_ms: null`;
  - a new executed case keeps its timings;
  - a file whose `timings_ms` length differs from `queries` is refused, with the variant named;
  - a query object with an extra key is still refused, which pins the strictness the package relies on.
- **`tests/verify.test.ts`:** a hand-edited `timings_ms` in a result is reported as not matching its raw file.
- **`tests/benchmark-pages.test.ts`:**
  - `queriesFor()` passes `executed` and the timings through;
  - `planChanged` stays `null` between an executed run and a `pretend()` run, even when the statement counts differ;
  - it is still set between two executed runs whose plans differ.
- **New fixture:** produce the executed file from the package rather than by hand, on the same dataset as
  `main_sqlite`:

  ```bash
  make bench-explain ARGS="--execute --output=build/queries.json"
  ```

  Keep only the subjects the test needs. If that makes it disagree with the `main_sqlite` dump, store it as its own
  fixture directory with the dump it came from.

### 9. Documentation

- **`benchmark-repo.md`:**
  - the input table gets `--execute`;
  - the result format section shows format 3 with `executed` and `timings_ms`;
  - "Phases" gets an entry for this plan, marked done once a real executed run is imported.
- **`plan-benchmark-pages.md`, "The queries file":** add the two keys with the table above. That section is the
  format's reference.
- **`README.md`, "What is kept":** the queries file row mentions that executed runs carry each statement's time.

## Order of work

1. Schema of the raw file, importer, format 3, the migration of `results/`, and their tests, in one commit:
   `feat(import): keep the statement timings of an executed queries.json`.
2. `queries.ts`, the page and the samples: `feat(site): show every statement of a variant with its time`. Look at it
   in a browser, light and dark.
3. `run.sh` and the workflow: `feat(run): explain the queries by running them`. Then run the workflow once at
   `medium` and record the explain step's time.
4. The docs: `docs: describe executed queries.json`.

Run `make check` before each commit is handed back.

## Open questions

- **A time limit for the explain step.** If executing the `read` group at `medium` or `large` is too slow, there are
  three options:
  - have the package stop starting new variants after a number of seconds, with an option such as
    `--max-seconds`, as its maintenance commands do;
  - execute only for `small`;
  - keep `pretend()` for the slowest benchmarks.

  Decide once the duration is measured.
- **Charting the times.** They are one execution each. If a stable number per statement is wanted, the package would
  need to repeat each statement and report a median, which is a package change and a `schema_version` question.
- **`--analyze` together with `--execute`.** Both run the queries. Executed plus analyzed works but runs everything
  twice; leave the workflow on `--execute` alone unless the actual-row counts are wanted on the page.
