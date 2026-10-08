# Eloquent Viewable benchmarks

The benchmark history of [`cyrildewit/eloquent-viewable`](https://github.com/cyrildewit/eloquent-viewable), and the
website that shows it: **https://cyrildewit.github.io/eloquent-viewable-benchmarks/**

The benchmarks themselves live in the package, under
[`benchmarks/`](https://github.com/cyrildewit/eloquent-viewable/tree/9.x/benchmarks). This repository checks out a
release or branch of the package, runs that version's own benchmarks against a seeded dataset of a million rows or
more, and keeps the results. It contains no benchmark code.

> **Status:** in preparation. [`benchmark-repo.md`](benchmark-repo.md) is the implementation plan. The import, the
> local runner and the website work; the workflows are written but have not run yet, and there is no real data until
> the package's benchmark harness is released.

## What is kept

| Path                                         | Contents                                                           |
|----------------------------------------------|--------------------------------------------------------------------|
| `runs/<runner>/<driver>/<size>/<id>.xml`     | the raw phpbench dump of a run, exactly as phpbench wrote it       |
| `runs/<runner>/<driver>/<size>/<id>.queries.json` | the SQL and query plans the package captured for that run, when it did, with the time of each statement when it ran them for real |
| `results/<runner>/<driver>/<size>/<id>.json` | the same run reduced to what the website draws, plus its metadata  |

Both are generated. Do not edit them by hand; import a run again instead.

## Reading the numbers

- A run is only comparable with runs from the same **runner**, **driver**, **dataset size** and **dataset version**.
  The website draws each such series as its own line and never mixes them.
- `gha` runs come from GitHub-hosted runners. They are always available but drift by 10 to 30% between runs, so they
  show trends, not small differences. Runs labelled with a person's name come from a quieter machine.
- Each time is phpbench's **mode** over several iterations, per call, with the relative standard deviation next to
  it. A difference smaller than the noise is shown as such rather than as faster or slower.
- The dataset is deterministic: the same size and seed give the same rows on every machine. The package's
  [benchmark README](https://github.com/cyrildewit/eloquent-viewable/blob/9.x/benchmarks/README.md) describes it.

## How runs are produced

- **New releases** are picked up daily and run on every driver at the `medium` size on GitHub Actions.
- **The `9.x` branch** runs weekly, so drift in the runners themselves is visible.
- **Any ref** can be run by hand from the Actions tab.
- **A maintainer's machine** can run any ref, including the `large` size, and contribute the result in a pull request.

## Working on this repository

Nothing runs on the host. Every command goes through `make`, which runs it in a Node container, so Docker is all you
need.

```bash
make install                              # once, and after package.json changes
make check                                # types, tests, validation, lint, workflow lint, as CI does
make dev-sample                           # the site on made-up data, at http://localhost:4321/eloquent-viewable-benchmarks/
make import DIR=tests/fixtures/main_sqlite # import a run: run.xml, meta.json, dataset.json and optionally queries.json
```

To add a run from your own machine, which needs git, make and Docker:

```bash
scripts/run.sh v9.0.0 mysql medium --runner=<your-name> --label="<machine, Docker memory>"
```

The first run stores the runner name and label in `.cache/runner.env`. The script seeds the dataset when needed, runs
the release's own benchmarks, and imports the result. Commit `runs/` and `results/` in a pull request.

`make` on its own lists every target.

## Publishing

The site deploys to GitHub Pages from `main` through `.github/workflows/pages.yml`, on every change to the site or to
`results/`. The repository's Pages source has to be set to **GitHub Actions** once, under Settings → Pages. A manual
run of the Pages workflow with `sample` ticked deploys the sample data instead, with a banner saying so.

`.github/workflows/discover.yml` checks the package every night and starts a benchmark run for every release that has
not been measured yet. Setting the repository variable `WEEKLY_BRANCH` (for example to `9.x`) adds a weekly run of
that branch, which shows how much the hosted runners drift on their own.

## License

The MIT License (MIT). See [LICENSE](LICENSE).
