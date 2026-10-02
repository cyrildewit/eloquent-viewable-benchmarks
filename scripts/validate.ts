/**
 * Checks every result file against the schema and against the dump and queries file it came from, and every dump
 * and queries file for a result.
 *
 *   make validate
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { verifyResult } from '../src/lib/verify.ts';

const results = globSync('results/**/*.json').sort();
const dumps = globSync('runs/**/*.xml').sort();
const queries = globSync('runs/**/*.queries.json').sort();
const problems: string[] = [];

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

for (const path of results) {
  const base = path.replace(/^results\//, 'runs/').replace(/\.json$/, '');
  problems.push(...verifyResult(path, readFileSync(path, 'utf8'), read(`${base}.xml`), read(`${base}.queries.json`)));
}

for (const path of [...dumps, ...queries]) {
  const jsonPath = path.replace(/^runs\//, 'results/').replace(/(\.queries\.json|\.xml)$/, '.json');
  if (!existsSync(jsonPath)) {
    problems.push(`${path}: has no result, import it or remove it`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${results.length} result(s)`);
  process.exit(1);
}

console.log(`${results.length} result(s), ${dumps.length} dump(s) and ${queries.length} queries file(s) are valid`);
