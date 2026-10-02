/**
 * Prints, as a JSON array, the runs the scheduled workflow should start. See src/lib/discover.ts for the rules.
 *
 *   make discover
 *   node scripts/discover.ts [--repo=<url or path>] [--branch=9.x] [--since=v9.0.0]
 *
 * The weekly branch run is off unless --branch or WEEKLY_BRANCH names a branch that has the benchmark harness.
 */
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { summarise } from '../src/lib/data.ts';
import { planRuns } from '../src/lib/discover.ts';
import { resultSchema } from '../src/lib/schema.ts';

const { values } = parseArgs({
  options: {
    repo: {
      type: 'string',
      default: process.env.PACKAGE_REPO ?? 'https://github.com/cyrildewit/eloquent-viewable.git',
    },
    // Empty turns the weekly run off. The workflow sets it from the WEEKLY_BRANCH repository variable.
    branch: { type: 'string', default: process.env.WEEKLY_BRANCH ?? '' },
    since: { type: 'string', default: 'v9.0.0' },
  },
});

const runs = globSync('results/**/*.json').map((path) =>
  summarise(resultSchema.parse(JSON.parse(readFileSync(path, 'utf8')))),
);
const remote = execFileSync('git', ['ls-remote', '--tags', '--heads', values.repo], { encoding: 'utf8' });

const planned = planRuns({ remote, runs, now: new Date(), branch: values.branch, since: values.since });

console.log(JSON.stringify(planned, null, 2));
