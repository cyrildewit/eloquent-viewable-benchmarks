import { describe, expect, it } from 'vitest';
import { parseDump, utc } from '../src/lib/phpbench.ts';
import { benchmark, dump, failing, fixture, passing } from './support.ts';

describe('parseDump on a real run', () => {
  const parsed = parseDump(fixture.xml);

  it('reads every variant', () => {
    expect(parsed.subjects).toHaveLength(64);
    expect(parsed.errors).toEqual([]);
  });

  it('reads the run itself', () => {
    expect(parsed.phpbench).toBe('1.7.0');
    expect(parsed.ranAt).toBe('2026-10-02T10:53:51Z');
    expect(parsed.php).toEqual({ version: '8.5.11', opcache: true, xdebug: true });
    expect(parsed.machine).toEqual({
      os: 'Linux',
      arch: 'aarch64',
      kernel: '6.12.76-linuxkit',
      load: [0.779296875, 0.87548828125, 0.630859375],
    });
  });

  it('reads a subject without parameters', () => {
    expect(parsed.subjects[0]).toEqual({
      benchmark: 'RecordViewBench',
      subject: 'benchRecord',
      set: '',
      params: {},
      groups: ['write'],
      revs: 50,
      iterations: 5,
      mode_us: 762.649,
      mean_us: 754.028,
      min_us: 719.28,
      max_us: 764.88,
      stdev_us: 17.471,
      rstdev: 2.317,
      mem_peak: 6775000,
      rejects: 3,
    });
  });

  it('reads typed parameters, an absent one as null', () => {
    const subject = parsed.subjects.find(
      (s) => s.benchmark === 'CountViewsBench' && s.subject === 'benchUniqueCount' && s.set === 'hot article,all time',
    );

    expect(subject?.params).toEqual({ target: 'hot', days: null });
    expect(subject?.mode_us).toBe(139335.379);
  });

  it('keeps every variant distinct', () => {
    const keys = new Set(parsed.subjects.map((s) => `${s.benchmark}::${s.subject}::${s.set}`));

    expect(keys.size).toBe(parsed.subjects.length);
  });
});

describe('parseDump on edge cases', () => {
  it('converts integer, double, boolean and string parameters', () => {
    const parameters = `
      <parameter name="i" value="7" type="integer"/>
      <parameter name="d" value="1.5" type="double"/>
      <parameter name="b" value="1" type="boolean"/>
      <parameter name="s" value="x" type="string"/>`;

    const [subject] = parseDump(dump(benchmark('\\A\\B\\OneBench', passing(parameters)))).subjects;

    expect(subject?.params).toEqual({ i: 7, d: 1.5, b: true, s: 'x' });
    expect(subject?.mode_us).toBe(10.123);
    expect(subject?.mem_peak).toBe(300);
    expect(subject?.rejects).toBe(2);
  });

  it('records a failed variant as an error instead of a subject', () => {
    const parsed = parseDump(dump(benchmark('\\A\\OneBench', failing('Table views does not exist'))));

    expect(parsed.subjects).toEqual([]);
    expect(parsed.errors).toEqual([
      { benchmark: 'OneBench', subject: 'benchIt', set: 'one', message: 'Table views does not exist' },
    ]);
  });

  it('has no load when the sysload provider is off, and no opcache when that provider is off', () => {
    const parsed = parseDump(dump(benchmark('\\A\\OneBench')));

    expect(parsed.machine.load).toBeNull();
    expect(parsed.php).toEqual({ version: '8.5.11', opcache: false, xdebug: false });
  });

  it('refuses an unknown phpbench major', () => {
    expect(() => parseDump(dump(benchmark('\\A\\OneBench'), { version: '2.0.0' }))).toThrow(/phpbench 2\.0\.0/);
  });

  it('refuses a dump with more than one suite', () => {
    expect(() => parseDump(dump(benchmark('\\A\\OneBench'), { suites: 2 }))).toThrow(/one suite/);
  });

  it('refuses two classes that share a short name', () => {
    const xml = dump(benchmark('\\A\\OneBench') + benchmark('\\B\\OneBench'));

    expect(() => parseDump(xml)).toThrow(/both called OneBench/);
  });

  it('refuses an unsupported parameter type', () => {
    const xml = dump(benchmark('\\A\\OneBench', passing('<parameter name="c" type="collection"/>')));

    expect(() => parseDump(xml)).toThrow(/Unsupported type collection/);
  });

  it('refuses a variant without stats', () => {
    const xml = dump(benchmark('\\A\\OneBench', passing().replace(/<stats[^>]*>/, '')));

    expect(() => parseDump(xml)).toThrow(/stats of OneBench::benchIt/);
  });

  it('refuses something that is not a dump', () => {
    expect(() => parseDump('<html></html>')).toThrow(/<phpbench> root/);
  });
});

describe('utc', () => {
  it('normalises an offset to UTC, to the second', () => {
    expect(utc('2026-09-30T08:25:49+02:00')).toBe('2026-09-30T06:25:49Z');
  });

  it('refuses something that is not a date', () => {
    expect(() => utc('yesterday')).toThrow(/Not a date/);
  });
});
