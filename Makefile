# Every command runs in the node container, nothing runs on the host.
# `make` or `make help` lists the targets.

.DEFAULT_GOAL := help
.PHONY: help install check typecheck test validate lint lint-ci format import run discover sample dev dev-sample build build-sample preview shell

RUN = docker compose run --rm node
# The dev server and preview publish port 4321.
SERVE = docker compose run --rm --service-ports node
SAMPLE_ENV = -e RESULTS_DIR=./.cache/sample/results

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (run once, or after package.json changes)
	$(RUN) pnpm install

check: typecheck test validate lint lint-ci ## Everything CI checks, run before handing work back

typecheck: ## Type check the scripts and the site
	$(RUN) pnpm typecheck

test: ## Run the unit tests
	$(RUN) pnpm test

validate: ## Check every result file against the schema and its XML dump
	$(RUN) pnpm validate

lint: ## Check formatting without changing anything
	$(RUN) pnpm lint

lint-ci: ## Lint the workflows (actionlint) and the shell script (shellcheck)
	docker run --rm -v "$(CURDIR):/repo" -w /repo rhysd/actionlint:1.7.12 -color
	docker run --rm -v "$(CURDIR):/mnt" -w /mnt koalaman/shellcheck:v0.11.0 scripts/run.sh

format: ## Fix formatting in place
	$(RUN) pnpm format

import: ## Import a run from DIR, which holds run.xml, meta.json and dataset.json
	@test -n "$(DIR)" || (echo "Usage: make import DIR=<directory>" && exit 1)
	$(RUN) pnpm run import "$(DIR)"

run: ## Run REF of the package on DRIVER and SIZE on this machine and import it, see scripts/run.sh
	@test -n "$(REF)" -a -n "$(DRIVER)" -a -n "$(SIZE)" || (echo "Usage: make run REF=<ref> DRIVER=<driver> SIZE=<size> [ARGS=...]" && exit 1)
	scripts/run.sh "$(REF)" "$(DRIVER)" "$(SIZE)" $(ARGS)

discover: ## List the runs the scheduled workflow would start now
	$(RUN) pnpm --silent discover

sample: ## Generate made-up results in .cache/sample, for working on the site without real runs
	$(RUN) pnpm sample

dev: ## Serve the site on http://localhost:4321/eloquent-viewable-benchmarks/, reloading on changes
	$(SERVE) pnpm dev

dev-sample: sample ## The same, on the sample results
	docker compose run --rm --service-ports $(SAMPLE_ENV) node pnpm dev

build: ## Build the site into dist/
	$(RUN) pnpm build

build-sample: sample ## Build the site on the sample results
	docker compose run --rm $(SAMPLE_ENV) node pnpm build

preview: ## Serve the built site from dist/
	$(SERVE) pnpm preview

shell: ## Open a shell in the node container
	$(RUN) sh
