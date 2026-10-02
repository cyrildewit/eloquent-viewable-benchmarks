/**
 * Which runs the scheduled workflow should start: every release of the package without a complete reference run, and
 * the weekly run of the main branch when the last one is a week old. Pure, so it is tested without git or GitHub.
 */
import type { RunSummary } from './data.ts';
import { DRIVER_ORDER, type Driver } from './drivers.ts';
import { compareVersions, parseVersion } from './refs.ts';

export interface PlannedRun {
  ref: string;
  size: 'medium';
  drivers: Driver[];
  reason: 'release' | 'weekly';
}

export interface DiscoverInput {
  /** Output of `git ls-remote --tags --heads <package>`. */
  remote: string;
  runs: Pick<RunSummary, 'ref' | 'kind' | 'runner' | 'size' | 'driver' | 'indexes' | 'ran_at'>[];
  now: Date;
  /** The branch measured weekly, so drift in the runners shows as a line that moves while the code does not. */
  branch: string;
  /** The first release with the benchmark harness. */
  since: string;
}

/** Days after which the weekly run is due again; a little under seven, so a daily check never skips a week. */
export const WEEKLY_AFTER_DAYS = 6;

export interface RemoteRefs {
  tags: string[];
  branches: string[];
}

/** Tag and branch names from `git ls-remote --tags --heads`, without the `^{}` lines of annotated tags. */
export function parseRemote(output: string): RemoteRefs {
  const tags = new Set<string>();
  const branches = new Set<string>();
  for (const line of output.split('\n')) {
    const name = line.split('\t')[1]?.trim();
    if (name?.startsWith('refs/tags/')) {
      tags.add(name.slice('refs/tags/'.length).replace(/\^\{\}$/, ''));
    } else if (name?.startsWith('refs/heads/')) {
      branches.add(name.slice('refs/heads/'.length));
    }
  }

  return { tags: [...tags], branches: [...branches] };
}

export function planRuns(input: DiscoverInput): PlannedRun[] {
  const remote = parseRemote(input.remote);
  const reference = input.runs.filter((run) => run.runner === 'gha' && run.size === 'medium' && run.indexes === 'none');
  const planned: PlannedRun[] = [];

  const releases = remote.tags
    .filter((tag) => {
      const version = parseVersion(tag);

      return version !== null && version[3] === '' && compareVersions(tag, input.since) >= 0;
    })
    .sort(compareVersions);

  for (const tag of releases) {
    const measured = new Set(
      reference.filter((run) => run.kind === 'release' && run.ref === tag).map((run) => run.driver),
    );
    const drivers = DRIVER_ORDER.filter((driver) => !measured.has(driver));
    if (drivers.length > 0) {
      planned.push({ ref: tag, size: 'medium', drivers, reason: 'release' });
    }
  }

  if (remote.branches.includes(input.branch)) {
    const last = reference
      .filter((run) => run.kind === 'branch' && run.ref === input.branch)
      .reduce<string | null>((latest, run) => (latest === null || run.ran_at > latest ? run.ran_at : latest), null);
    const age = last === null ? Infinity : (input.now.getTime() - new Date(last).getTime()) / 86_400_000;
    if (age >= WEEKLY_AFTER_DAYS) {
      planned.push({ ref: input.branch, size: 'medium', drivers: [...DRIVER_ORDER], reason: 'weekly' });
    }
  }

  return planned;
}
