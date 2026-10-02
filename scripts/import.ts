/**
 * Imports one run: copies its phpbench dump to runs/ and writes the result file to results/.
 *
 *   make import DIR=build/mysql
 *
 * DIR holds `run.xml` (phpbench --dump-file), `meta.json` (written by the workflow or scripts/run.sh) and
 * `dataset.json` (make bench-describe in the package), and may hold `queries.json` (make bench-explain --output),
 * which is kept raw next to the dump. An existing run is never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildResult, resultPaths, serialise } from '../src/lib/importer.ts';

const dir = process.argv[2];
if (dir === undefined || process.argv.length > 3) {
  console.error(
    'Usage: node scripts/import.ts <directory with run.xml, meta.json, dataset.json and optionally queries.json>',
  );
  process.exit(2);
}

try {
  const xml = readFileSync(join(dir, 'run.xml'), 'utf8');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const dataset = JSON.parse(readFileSync(join(dir, 'dataset.json'), 'utf8'));
  const queriesPath = join(dir, 'queries.json');
  const queries = existsSync(queriesPath) ? readFileSync(queriesPath, 'utf8') : null;

  const result = buildResult(xml, meta, dataset, queries === null ? undefined : JSON.parse(queries));
  const paths = resultPaths(result);

  const files: [string, string][] = [
    [paths.xml, xml],
    [paths.json, serialise(result)],
  ];
  if (queries !== null) {
    files.push([paths.queries, queries]);
  }

  for (const [path] of files) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists`);
    }
  }

  for (const [path, contents] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  const captured = result.queries === null ? 'no queries' : `queries of ${result.queries.subjects.length} subjects`;
  console.log(`Imported ${result.id}: ${result.subjects.length} subjects, ${result.errors.length} errors, ${captured}`);
  for (const [path] of files) {
    console.log(`  ${path}`);
  }
} catch (error) {
  console.error(`Import failed: ${(error as Error).message}`);
  process.exit(1);
}
