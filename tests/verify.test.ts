import { describe, expect, it } from 'vitest';
import { buildResult, resultPaths, serialise } from '../src/lib/importer.ts';
import { verifyResult } from '../src/lib/verify.ts';
import { fixture } from './support.ts';

const result = buildResult(fixture.xml, fixture.meta, fixture.dataset);
const path = resultPaths(result).json;

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
});
