/**
 * Checks every result file against the schema and against the dump it came from, and every dump for a result.
 *
 *   make validate
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { verifyResult } from '../src/lib/verify.ts';

const results = globSync('results/**/*.json').sort();
const dumps = globSync('runs/**/*.xml').sort();
const problems: string[] = [];

for (const path of results) {
  const xmlPath = path.replace(/^results\//, 'runs/').replace(/\.json$/, '.xml');
  const xml = existsSync(xmlPath) ? readFileSync(xmlPath, 'utf8') : null;
  problems.push(...verifyResult(path, readFileSync(path, 'utf8'), xml));
}

for (const path of dumps) {
  const jsonPath = path.replace(/^runs\//, 'results/').replace(/\.xml$/, '.json');
  if (!existsSync(jsonPath)) {
    problems.push(`${path}: has no result, import it or remove it`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${results.length} result(s)`);
  process.exit(1);
}

console.log(`${results.length} result(s) and ${dumps.length} dump(s) are valid`);
