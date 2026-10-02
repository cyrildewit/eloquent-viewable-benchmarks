/**
 * The result files as Astro's content collection, at build time.
 */
import { getCollection } from 'astro:content';
import { buildIndex, type IndexData } from './data.ts';
import type { Result } from './schema.ts';

let results: Promise<Result[]> | undefined;
let index: Promise<IndexData> | undefined;

export function loadResults(): Promise<Result[]> {
  results ??= getCollection('runs').then((entries) => entries.map((entry) => entry.data));

  return results;
}

export function loadIndex(): Promise<IndexData> {
  index ??= loadResults().then(buildIndex);

  return index;
}
