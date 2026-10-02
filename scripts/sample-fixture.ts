/**
 * The real SQLite run from tests/fixtures, imported in memory, as the base the sample data is invented from.
 */
import { readFileSync } from 'node:fs';
import { buildResult } from '../src/lib/importer.ts';
import type { Result } from '../src/lib/schema.ts';

const DIR = 'tests/fixtures/main_sqlite';

export function fixtureRun(): Result {
  return buildResult(
    readFileSync(`${DIR}/run.xml`, 'utf8'),
    JSON.parse(readFileSync(`${DIR}/meta.json`, 'utf8')),
    JSON.parse(readFileSync(`${DIR}/dataset.json`, 'utf8')),
  );
}
