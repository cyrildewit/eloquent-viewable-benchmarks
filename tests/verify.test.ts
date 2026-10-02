import { describe, expect, it } from 'vitest';
import { buildResult, resultPaths, serialise } from '../src/lib/importer.ts';
import { verifyResult } from '../src/lib/verify.ts';
import { fixture, queries } from './support.ts';

const result = buildResult(fixture.xml, fixture.meta, fixture.dataset);
const path = resultPaths(result).json;
const withQueries = buildResult(fixture.xml, fixture.meta, fixture.dataset, queries);
const rawQueries = JSON.stringify(queries);

describe('verifyResult', () => {
  it('accepts a freshly imported result', () => {
    expect(verifyResult(path, serialise(result), fixture.xml)).toEqual([]);
  });

  it('rejects a timing edited by hand', () => {
    const [first, ...rest] = result.subjects;
    const edited = { ...result, subjects: [{ ...first, mode_us: 1 }, ...rest] };

    expect(verifyResult(path, serialise(edited), fixture.xml)).toEqual([
      expect.stringMatching(/does not match runs\/.+\.xml, import the run again/),
    ]);
  });

  it('rejects a result in the wrong place', () => {
    expect(verifyResult('results/gha/sqlite/small/x.json', serialise(result), fixture.xml)).toEqual([
      expect.stringContaining(`should be at ${path}`),
    ]);
  });

  it('rejects a result whose dump is missing', () => {
    expect(verifyResult(path, serialise(result), null)).toEqual([expect.stringContaining('is missing')]);
  });

  it('rejects a result whose dump cannot be read', () => {
    expect(verifyResult(path, serialise(result), '<html/>')).toEqual([expect.stringContaining('cannot be read')]);
  });

  it('rejects a result that breaks the schema, naming the field', () => {
    const broken = { ...result, runner: 'My Laptop', extra: true };

    expect(verifyResult(path, JSON.stringify(broken), fixture.xml)).toEqual([
      expect.stringMatching(/: runner lowercase/),
      expect.stringMatching(/\(root\).*extra/),
    ]);
  });

  it('rejects a file that is not JSON', () => {
    expect(verifyResult(path, '{', fixture.xml)).toEqual([expect.stringContaining('not valid JSON')]);
  });

  it('accepts a result imported with queries, against its raw queries file', () => {
    expect(verifyResult(path, serialise(withQueries), fixture.xml, rawQueries)).toEqual([]);
  });

  it('rejects a result whose queries file is missing', () => {
    expect(verifyResult(path, serialise(withQueries), fixture.xml, null)).toEqual([
      expect.stringMatching(/queries file runs\/.+\.queries\.json is missing/),
    ]);
  });

  it('rejects a queries file next to a result that says it has none', () => {
    expect(verifyResult(path, serialise(result), fixture.xml, rawQueries)).toEqual([
      expect.stringContaining('says it has no queries'),
    ]);
  });

  it('rejects a query edited by hand', () => {
    const edited = JSON.parse(serialise(withQueries));
    edited.queries.subjects[0].queries[0].sql = 'select 1';

    expect(verifyResult(path, JSON.stringify(edited), fixture.xml, rawQueries)).toEqual([
      expect.stringMatching(/does not match runs\/.+\.queries\.json/),
    ]);
  });

  it('rejects a queries file that cannot be read', () => {
    expect(verifyResult(path, serialise(withQueries), fixture.xml, '{')).toEqual([
      expect.stringMatching(/queries file .+ cannot be read/),
    ]);
  });
});
