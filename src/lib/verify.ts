/**
 * Checks a stored result: that it matches the schema, sits where its contents say it should, and still says what its
 * XML dump says. A result edited by hand fails here.
 */
import { isDeepStrictEqual } from 'node:util';
import { deriveQueries, fromDump, resultPaths } from './importer.ts';
import { parseDump } from './phpbench.ts';
import { resultSchema } from './schema.ts';

/**
 * @param path the result's path relative to the repository root
 * @param json the result file's contents
 * @param xml the contents of the dump the result says it came from, or null when that file is missing
 * @param queries the contents of the raw queries file next to the dump, or null when there is none
 * @returns the problems found, empty when the result is sound
 */
export function verifyResult(path: string, json: string, xml: string | null, queries: string | null = null): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return [`${path}: not valid JSON, ${(error as Error).message}`];
  }

  const checked = resultSchema.safeParse(parsed);
  if (!checked.success) {
    return checked.error.issues.map((issue) => `${path}: ${issue.path.join('.') || '(root)'} ${issue.message}`);
  }

  const result = checked.data;
  const expected = resultPaths(result);
  const problems: string[] = [];

  if (path !== expected.json) {
    problems.push(`${path}: should be at ${expected.json} according to its contents`);
  }

  if (xml === null) {
    problems.push(`${path}: its dump ${expected.xml} is missing`);

    return problems;
  }

  let dump;
  try {
    dump = parseDump(xml);
  } catch (error) {
    problems.push(`${path}: its dump ${expected.xml} cannot be read, ${(error as Error).message}`);

    return problems;
  }
  if (!isDeepStrictEqual(fromDump(result), dump)) {
    problems.push(`${path}: does not match ${expected.xml}, import the run again instead of editing the result`);
  }

  if (result.queries === null) {
    if (queries !== null) {
      problems.push(`${path}: says it has no queries, but ${expected.queries} exists; import the run again`);
    }
  } else if (queries === null) {
    problems.push(`${path}: its queries file ${expected.queries} is missing`);
  } else {
    try {
      if (!isDeepStrictEqual(result.queries, deriveQueries(JSON.parse(queries), dump, result.database.driver))) {
        problems.push(
          `${path}: does not match ${expected.queries}, import the run again instead of editing the result`,
        );
      }
    } catch (error) {
      problems.push(`${path}: its queries file ${expected.queries} cannot be read, ${(error as Error).message}`);
    }
  }

  return problems;
}
