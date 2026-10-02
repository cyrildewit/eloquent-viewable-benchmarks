/**
 * Ordering runs along a trend: releases by semantic version, everything else by when its commit was made.
 */

export interface Orderable {
  ref: string;
  kind: 'release' | 'branch' | 'commit';
  committed_at: string;
  ran_at: string;
}

/** `v9.10.0` → `[9, 10, 0, '']`, `v10.0.0-beta.1` → `[10, 0, 0, 'beta.1']`. */
export function parseVersion(ref: string): [number, number, number, string] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(ref);
  if (match === null) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
}

/** Semantic version order. A pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) {
    return a.localeCompare(b);
  }

  for (let i = 0; i < 3; i++) {
    const difference = (left[i] as number) - (right[i] as number);
    if (difference !== 0) {
      return difference;
    }
  }

  if (left[3] === right[3]) {
    return 0;
  }
  if (left[3] === '') {
    return 1;
  }
  if (right[3] === '') {
    return -1;
  }

  return left[3].localeCompare(right[3], 'en', { numeric: true });
}

/** Releases first, in version order, then everything else by commit date, then by when it ran. */
export function compareRuns(a: Orderable, b: Orderable): number {
  const aRelease = a.kind === 'release';
  const bRelease = b.kind === 'release';
  if (aRelease && bRelease) {
    return compareVersions(a.ref, b.ref) || a.ran_at.localeCompare(b.ran_at);
  }
  if (aRelease !== bRelease) {
    return aRelease ? -1 : 1;
  }

  return a.committed_at.localeCompare(b.committed_at) || a.ran_at.localeCompare(b.ran_at);
}
