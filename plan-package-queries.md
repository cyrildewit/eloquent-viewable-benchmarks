# Plan: `bench-explain` keyed on the benchmark subjects, with a JSON output

This plan is for the package repository, `cyrildewit/eloquent-viewable`, on the branch that carries the benchmark
harness. It is the package half of [`plan-benchmark-pages.md`](plan-benchmark-pages.md) in the results repository,
which adds a page per benchmark to the website and shows the SQL and the query plan next to each timing. The two
plans share one file format, `queries.json`, defined in [The queries file](#the-queries-file). Implement this one
first: the results repository's workflow calls what this plan adds.

Today `benchmarks/explain.php` prints the SQL and plan of nine hand-picked read paths, named by hand ("count, hot
article, all time"). Those names mean nothing to the results repository, which matches everything on the benchmark
class, the subject method and phpbench's parameter set name. The change is to derive the cases from the benchmark
classes themselves, so the explain output is keyed exactly like phpbench's dump and can never drift from it, and to
add `--output=<file>` that writes the result as JSON, the way `describe.php` does.

## Goals

- `make bench-explain` reports every variant of the `read` group, named as phpbench names it, with nothing listed
  by hand.
- `make bench-explain ARGS="--output=build/queries.json"` writes the same as JSON for the results repository, next
  to `run.xml` and `dataset.json`.
- The console report stays as useful as it is: the same cases, the same plan lines, the same `--analyze`.

## Non-goals

- Explaining the `write` group. `record()` is one insert with nothing to explain, and `DestroyViewsBench` has to
  insert rows before it can delete them. `--group` is accepted so this can change, but `read` is the default and the
  only group CI captures.
- Running the explain through phpbench. phpbench runs each variant in a fresh process with its own bootstrap; the
  explain script boots the application once and runs every variant inside `pretend()`, which is what it does now.

## The queries file

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

| Key              | Meaning                                                                                                   |
|------------------|-----------------------------------------------------------------------------------------------------------|
| `schema_version` | `1`. Bump when a key changes meaning; adding keys is free, the reader ignores unknown ones                |
| `driver`         | the connection's driver name, as `describe.php` reports it                                                |
| `analyzed`       | whether `--analyze` was given, so the plans carry actual rows and timings                                 |
| `group`          | the phpbench group the subjects were taken from                                                           |
| `class`          | the fully qualified class name, no leading backslash                                                      |
| `subject`        | the method name, `benchCount`                                                                             |
| `set`            | the parameter set name exactly as phpbench names it, see [Naming](#naming)                                |
| `params`         | the resolved parameters of the variant, as the providers yield them                                       |
| `queries`        | every statement the variant ran, in order, bindings substituted, each with the plan the driver gave for it |
| `plan.columns`   | the column names of the explain result                                                                    |
| `plan.rows`      | one array per row, every value cast to string, `null` kept                                                |

The results repository stores this file byte for byte next to the dump and refuses one whose `class`, `subject` and
`set` do not match a variant in the dump. Pretty-printed, unescaped slashes, trailing newline, like `describe.php`.

### Naming

phpbench names a variant's parameter set from its providers: the key each generator yields, and with several
providers the keys joined with a comma and no space, in provider order. A subject without providers has the empty
name. So `#[ParamProviders(['provideTargets', 'providePeriods'])]` on `benchCount` gives `hot article,all time`,
`hot article,past year`, …, `all articles,past day`, twelve in all, and `benchOrderByViews` with
`#[ParamProviders('providePeriods')]` gives `all time` to `past day`. The dump in the results repository's test
fixture shows exactly these names. Discovery here reproduces the rule and a test pins it.

## Changes

### `benchmarks/Support/Variants.php`, discovery

A small final class that finds the benchmark classes and their variants the way phpbench does, from the same
attributes:

- Finds classes by globbing `benchmarks/**/*Bench.php`, which is `runner.path` and `runner.file_pattern` in
  `phpbench.json`, and maps the path to a class name by the autoload rule. Skips abstract classes.
- Reads `#[Groups]`, `#[BeforeMethods]` and, per public `bench*` method, `#[ParamProviders]`. `ParamProviders`
  takes a string or a list; both are handled.
- Yields a value object per variant: `class`, `method`, `set`, `params`, where `params` is the merge of one entry
  from each provider and `set` the joined keys. Providers are called on an instance of the class; their generators
  are iterated fully, so the cartesian product is built in provider order, outer loop first, as phpbench does.
- `Variants::inGroup('read')` filters on the class groups. Keep a method to list the before-methods of a class, the
  script runs them once per class before any variant.

No database access in this class, so it is unit-testable.

### `benchmarks/explain.php`, rewritten on top of it

Options: `--analyze` as now, `--group=<name>` default `read`, `--output=<file>`.

1. Boot the application, load the dataset, print the dataset line and driver as now.
2. For each class in the group: make one instance, call its before-methods in order (for the read group that is
   `setUp`, which boots nothing new and loads the dataset once more; cheap). Then for each variant, run the method
   inside `$connection->pretend()` with the variant's `params`, substitute the bindings into every captured query,
   and explain each with the statement the current driver needs. The explain statements and the driver `match`
   stay as they are.
3. The console output keeps its shape, with the heading now `CountViewsBench::benchCount (hot article, all time)`
   and the group in the first line. Plans print as they do now: one text column per line, or `column=value` pairs.
4. With `--output`, build the structure above and write it with the same flags and error as `describe.php`:
   pretty-printed, unescaped slashes, `JSON_THROW_ON_ERROR`, a `RuntimeException` naming the file when it cannot
   be written. The console report is still printed, so a run in CI shows the plans in its log as well.

Plan rows come from `$connection->select()` as objects; `(array)` them, take the keys of the first row as
`columns`, and cast every value with `is_null($v) ? null : (string) $v`. An empty result keeps `columns` empty.

Under `pretend()` nothing executes, so a `count()` returns zero and a `get()` an empty collection, which the
benchmark methods ignore. The `ViewSeries` returned by `countByInterval()` is built from no rows; fine.
`--analyze` executes the queries through the explain statement, not through the benchmark method, as now.

### `Makefile` and Composer

The target exists: `bench-explain: bench-db` running `bench:explain -- $(ARGS)`. Its help text changes to mention
`--output` and `--group`. The results repository calls it as
`make bench-explain DRIVER=<driver> ARGS="--output=build/queries.json"`, so that becomes part of the stable Make
interface listed in `benchmarks/README.md`.

### `benchmarks/README.md`

- "Quick start": the comment on `make bench-explain` becomes "the SQL and query plan of every read benchmark".
- "Query plans": say the cases are the variants of the `read` group, named as in the phpbench report, that
  `--group` picks another group and `--output=<file>` writes JSON. One sentence that the results repository stores
  this file with every run and shows the SQL on each benchmark's page.
- "Results over time", the Make interface: add `make bench-explain` with `ARGS=--output=<file>`, and
  `queries.json`'s keys to the list of things that are only ever added to.
- The description of `describe.php` is unchanged.

### Tests

The benchmarks namespace is autoloaded in development only, which is where Pest runs, so `tests/Unit/Benchmarks/`
can use it. Check `tests/Arch/DependencyRulesTest.php` and any deptrac layer first: if a rule forbids tests or
`src` from depending on the benchmarks namespace, add the directory to the allowed list rather than weakening the
rule.

- `VariantsTest`: discovery on the real benchmark classes. Asserts the full list of `class::method` and set names
  for `CountViewsBench` (twelve per subject), `CountViewsByIntervalBench` (ten), `OrderByViewsBench` (four) and
  that `RecordViewBench` yields two variants with the empty set name. Asserts `params` for one variant, with
  `days` being `null` for all time. These lists are the naming contract in test form; they must equal the
  `<parameter-set name="…">` values in a dump of the same classes.
- `ExplainOutputTest` or a function-level test: the plan normalisation on a fake result set with a null and an
  integer, and the JSON structure for one variant with a stubbed query list, so the format is pinned without a
  database.
- phpstan does not analyse `benchmarks/` (its `paths` are `src`, `config`, factories, fixtures). Keep it that way
  unless the harness is already clean at level 10; Pint covers style.

### By hand, before handing back

Run the four drivers on a seeded small dataset and keep the output of each in the pull request description, the
way `describe.php` was checked:

```bash
make bench-seed DRIVER=sqlite
make bench-explain DRIVER=sqlite ARGS="--output=build/queries.json"
make bench-explain DRIVER=mysql ARGS="--output=build/queries-mysql.json"   # after bench-seed DRIVER=mysql, and so on
make bench-explain DRIVER=pgsql ARGS=--analyze
```

Then, with a dump from the same checkout (`make bench DRIVER=sqlite ARGS="--dump-file=build/run.xml"`), check in
the results repository that `make import` accepts the four files together: it fails on any `set` name the dump does
not have. The SQLite `queries.json` from this check becomes `tests/fixtures/main_sqlite/queries.json` there, so
produce it on the same dataset size and seed as that fixture, which is `small` with the default seed.

## Order of work

1. `Variants` with its test. `chore(bench): discover the benchmark variants as phpbench names them`.
2. `explain.php` on `Variants`, console output only. Check the report on SQLite against the current one: same SQL,
   same plans, more cases. `chore(bench): explain every read variant`.
3. `--output` and `--group`, the normalisation test. `feat(bench): write the explained queries as JSON`.
4. README and Makefile help. `docs(bench): …`.
5. The manual check on four drivers, the import check in the results repository, the fixture over there.

`composer lint`, `composer test:types`, `composer test` before each step is handed back, as the package expects.

## Open questions

- **phpbench's own metadata instead of reflection.** phpbench's `MetadataFactory` and `BenchmarkFinder` produce
  exactly these variants, but reaching them means building its DI container with the project config. Reflection on
  three attributes is a page of code and the test pins the result against a real dump. Revisit if phpbench 2 changes
  the attributes.
- **Which `before` methods to run.** The read benchmarks only need `setUp`. If a later read benchmark adds a
  before-method that writes to the database, the explain script would write too; it runs outside `pretend()` by
  design, since `Dataset::load()` has to really query. Call it out in the class docblock.
- **Plans after `bench-indexes`.** The plan depends on the optional indexes present, which `Dataset` records and the
  results repository keeps as part of the series key, so a `queries.json` from an index run is stored in that
  series. Nothing to do here, just not a surprise.
