/**
 * Reads a phpbench XML dump, the file `phpbench run --dump-file` writes. Only the parts the result file needs are
 * read; the dump itself is kept unchanged in `runs/`.
 */
import { XMLParser } from 'fast-xml-parser';
import type { Subject, SubjectError } from './schema.ts';

/** The phpbench major versions whose dump format this parser understands. */
const SUPPORTED_MAJORS = ['1'];

export interface Dump {
  phpbench: string;
  ranAt: string;
  machine: { os: string; arch: string; kernel: string; load: [number, number, number] | null };
  php: { version: string; opcache: boolean; xdebug: boolean };
  subjects: Subject[];
  errors: SubjectError[];
}

type Node = Record<string, unknown>;

const LISTS = new Set([
  'suite',
  'benchmark',
  'subject',
  'variant',
  'iteration',
  'group',
  'parameter',
  'value',
  'error',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => LISTS.has(name),
});

export function parseDump(xml: string): Dump {
  const root = node(parser.parse(xml).phpbench, 'the <phpbench> root element');
  const phpbench = text(root.version, 'the phpbench version');

  if (!SUPPORTED_MAJORS.includes(phpbench.split('.')[0] ?? '')) {
    throw new Error(`The dump was written by phpbench ${phpbench}, this parser reads ${SUPPORTED_MAJORS.join(', ')}.x`);
  }

  const suites = list(root.suite);
  const [suite] = suites;
  if (suite === undefined || suites.length !== 1) {
    throw new Error(`Expected one suite in the dump, found ${suites.length}`);
  }
  const env = node(suite.env, 'the <env> element');
  const uname = values(env.uname);
  const php = values(env.php);
  const opcache = values(env.opcache);
  const sysload = values(env['unix-sysload']);

  const subjects: Subject[] = [];
  const errors: SubjectError[] = [];
  const classes = new Map<string, string>();

  for (const benchmark of list(suite.benchmark)) {
    const className = text(benchmark.class, 'a benchmark class');
    const name = className.split('\\').at(-1) ?? className;
    const seen = classes.get(name);
    if (seen !== undefined && seen !== className) {
      throw new Error(`Two benchmark classes are both called ${name}: ${seen} and ${className}`);
    }
    classes.set(name, className);

    for (const subject of list(benchmark.subject)) {
      const subjectName = text(subject.name, `a subject of ${name}`);
      const groups = list(subject.group).map((group) => text(group.name, 'a group name'));

      for (const variant of list(subject.variant)) {
        const parameterSet = node(variant['parameter-set'], `the parameter set of ${name}::${subjectName}`);
        const set = String(parameterSet.name ?? '');
        const label = `${name}::${subjectName} (${set === '' ? 'no parameters' : set})`;
        const failures = list(node(variant.errors ?? {}, 'errors').error);

        if (failures.length > 0) {
          errors.push({
            benchmark: name,
            subject: subjectName,
            set,
            message: failures.map((failure) => String(failure['#text'] ?? '').trim()).join('\n'),
          });
          continue;
        }

        const stats = node(variant.stats, `the stats of ${label}`);
        const iterations = list(variant.iteration);

        subjects.push({
          benchmark: name,
          subject: subjectName,
          set,
          params: params(list(parameterSet.parameter), label),
          groups,
          revs: integer(variant.revs, `the revs of ${label}`),
          iterations: iterations.length,
          mode_us: round(number(stats.mode, `the mode of ${label}`)),
          mean_us: round(number(stats.mean, `the mean of ${label}`)),
          min_us: round(number(stats.min, `the min of ${label}`)),
          max_us: round(number(stats.max, `the max of ${label}`)),
          stdev_us: round(number(stats.stdev, `the stdev of ${label}`)),
          rstdev: round(number(stats.rstdev, `the rstdev of ${label}`)),
          mem_peak: Math.max(0, ...iterations.map((it) => integer(it['mem-peak'], `the memory of ${label}`))),
          rejects: iterations.reduce(
            (sum, it) => sum + (it['reject-count'] === undefined ? 0 : integer(it['reject-count'], label)),
            0,
          ),
        });
      }
    }
  }

  return {
    phpbench,
    ranAt: utc(text(suite.date, 'the suite date')),
    machine: {
      os: String(uname.os ?? ''),
      arch: String(uname.machine ?? ''),
      kernel: String(uname.release ?? ''),
      load: sysload.l1 === undefined ? null : [Number(sysload.l1), Number(sysload.l5), Number(sysload.l15)],
    },
    php: {
      version: text(php.version, 'the PHP version'),
      opcache: opcache.enabled === true,
      xdebug: php.xdebug === true,
    },
    subjects,
    errors,
  };
}

/** Normalises a date with any offset to UTC, to the second: `2026-10-02T10:53:51Z`. */
export function utc(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Not a date: ${date}`);
  }

  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The `<value>` children of an env provider, converted to their declared type. */
function values(provider: unknown): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const value of list(node(provider ?? {}, 'an env provider').value)) {
    result[text(value.name, 'an env value name')] = typed(value, 'an env value');
  }

  return result;
}

function params(parameters: Node[], label: string): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const parameter of parameters) {
    result[text(parameter.name, `a parameter name of ${label}`)] = typed(parameter, `a parameter of ${label}`);
  }

  return result;
}

/** A parameter or env value. The value sits in an attribute for parameters and in the text for env values. */
function typed(element: Node, what: string): string | number | boolean | null {
  const raw = element.value ?? element['#text'] ?? '';
  switch (element.type) {
    case undefined:
      return null;
    case 'string':
      return String(raw);
    case 'integer':
      return integer(raw, what);
    case 'double':
      return number(raw, what);
    case 'boolean':
      return String(raw).trim() === '1';
    default:
      throw new Error(`Unsupported type ${String(element.type)} for ${what}`);
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function node(value: unknown, what: string): Node {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The dump has no ${what}`);
  }

  return value as Node;
}

function list(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`The dump has no ${what}`);
  }

  return value;
}

function number(value: unknown, what: string): number {
  const parsed = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(parsed)) {
    throw new Error(`The dump has no numeric ${what}`);
  }

  return parsed;
}

function integer(value: unknown, what: string): number {
  const parsed = number(value, what);
  if (!Number.isInteger(parsed)) {
    throw new Error(`The dump has no whole number for ${what}`);
  }

  return parsed;
}
