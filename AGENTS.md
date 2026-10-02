# Agent instructions

## Where things stand

This repository is being set up. [`benchmark-repo.md`](benchmark-repo.md) is the implementation plan and the source of
truth for the layout, the file formats and the decisions already taken. Read it before changing anything, and update
it when a decision changes. Its "Phases" section says what exists: the toolchain, the import and the validation do;
the workflows and the site do not yet.

## What this repository is

It stores benchmark results for `cyrildewit/eloquent-viewable` and publishes them as a static Astro site on GitHub
Pages. It never contains benchmark code. The harness lives in the package under `benchmarks/`, and every run is
produced by the harness of the ref being measured.

## Nothing runs on the host

There is no Node on the host. `node`, `pnpm`, `npm` and `npx` will fail. Do not install them. Every command goes through
`make`, which runs it in the `node` container:

```bash
make install    # pnpm install, after package.json changes
make check      # types, tests, validate, lint, lint-ci: run before handing work back
make test       # Vitest
make typecheck  # tsc
make validate   # every result against the schema and its dump
make lint       # Prettier, check only
make format     # Prettier, in place
make import DIR=<dir>  # import run.xml, meta.json, dataset.json and optionally queries.json from one directory
make run REF= DRIVER= SIZE=  # run a package ref on this machine and import it, see scripts/run.sh
make discover   # the runs the nightly schedule would start now
make sample     # made-up results in .cache/sample, for working on the site
make dev-sample # the site on them, http://localhost:4321/eloquent-viewable-benchmarks/
make build      # the site into dist/; build-sample and preview as well
make lint-ci    # actionlint on the workflows, shellcheck on run.sh
make shell      # a shell in the container
```

`scripts/run.sh` is the one script that runs on the host: it only drives git, make and Docker, and every PHP and
Node step still happens in a container. Never commit a run from a throwaway or unpushed package commit; the commit in
a result must exist upstream.

To pass flags to a tool, call it in the container directly, for example
`docker compose run --rm node pnpm exec vitest run tests/phpbench.test.ts`.

The package manager is pnpm, pinned in `package.json`'s `packageManager` and provided by Corepack in the container.
Do not add a `package-lock.json`, and use `pnpm run import` rather than `pnpm import`, which is a built-in command.

## Rules

- `runs/` and `results/` are generated. Never edit them by hand, and never "fix" a number. Re-import the run instead.
  `make validate` parses every dump again and fails on a result that disagrees with it.
- Do not import `tests/fixtures/` as data. The fixture is a test input, run on a laptop with Xdebug loaded.
- A change to the result file shape is a change to `src/lib/schema.ts`, a bump of `RESULT_FORMAT`, and a migration of
  every existing result file, in one commit, with the plan updated to match.
- Subjects are matched across runs on benchmark class, subject and parameter set name. Do not rename or normalise them
  on import.
- Scripts run with Node's type stripping, so TypeScript must stay erasable (no enums, namespaces or parameter
  properties) and relative imports carry the `.ts` extension. `tsc` enforces both.
- Keep the site free of external requests at runtime: no CDN scripts, fonts or analytics. Everything is bundled.
- Look at a site change in a browser, light and dark, before calling it done; `make build-sample` and `make preview`
  serve it. Sample data never goes into `results/`.
- Driver colours and order are fixed (`src/lib/drivers.ts`, `src/styles/global.css`) and were checked with a
  colour-vision validator. Do not reorder them or add a colour by eye.
- Code in `src/lib/` runs at build time and in the browser. Keep it free of Node imports, except `importer.ts`,
  `phpbench.ts`, `verify.ts`, `results.ts` and `source.ts`, which only the build and the scripts use.
- pnpm only runs the build scripts of dependencies listed under `allowBuilds` in `pnpm-workspace.yaml`, and fails the
  install on any other. When a new dependency needs one, check what it does before approving it with
  `docker compose run --rm node pnpm approve-builds <package>`.

## Conventions

Commit messages follow Conventional Commits, as in the package. Use `data:` for commits that only add runs, and
`feat`, `fix`, `docs`, `chore`, `ci`, `build` for the rest.
