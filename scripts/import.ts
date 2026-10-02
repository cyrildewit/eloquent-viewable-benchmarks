/**
 * Imports one run: copies its phpbench dump to runs/ and writes the result file to results/.
 *
 *   make import DIR=build/mysql
 *
 * DIR holds `run.xml` (phpbench --dump-file), `meta.json` (written by the workflow or scripts/run.sh) and
 * `dataset.json` (make bench-describe in the package). An existing run is never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildResult, resultPaths, serialise } from '../src/lib/importer.ts';

const dir = process.argv[2];
if (dir === undefined || process.argv.length > 3) {
  console.error('Usage: node scripts/import.ts <directory with run.xml, meta.json and dataset.json>');
  process.exit(2);
}

try {
  const xml = readFileSync(join(dir, 'run.xml'), 'utf8');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const dataset = JSON.parse(readFileSync(join(dir, 'dataset.json'), 'utf8'));

  const result = buildResult(xml, meta, dataset);
  const paths = resultPaths(result);

  for (const path of [paths.xml, paths.json]) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists`);
    }
  }

  for (const [path, contents] of [
    [paths.xml, xml],
    [paths.json, serialise(result)],
  ] as const) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  console.log(`Imported ${result.id}: ${result.subjects.length} subjects, ${result.errors.length} errors`);
  console.log(`  ${paths.json}`);
  console.log(`  ${paths.xml}`);
} catch (error) {
  console.error(`Import failed: ${(error as Error).message}`);
  process.exit(1);
}
