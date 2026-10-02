import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A real run: the full suite on SQLite at the small size, from the package's feature/benchmarks branch. */
export const fixture = {
  xml: read('main_sqlite/run.xml'),
  meta: JSON.parse(read('main_sqlite/meta.json')),
  dataset: JSON.parse(read('main_sqlite/dataset.json')),
};

/**
 * A hand-built `queries.json` for two read variants of the fixture run, until the package's `bench-explain --output`
 * produces a real one. Its names must match variants in the fixture dump.
 */
export const queries = {
  schema_version: 1,
  driver: 'sqlite',
  analyzed: false,
  group: 'read',
  subjects: [
    {
      class: 'CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\CountViewsBench',
      subject: 'benchCount',
      set: 'hot article,all time',
      params: { target: 'hot', days: null },
      queries: [
        {
          sql: 'select count(*) as aggregate from "views" where "views"."viewable_type" = \'article\' and "views"."viewable_id" = 1',
          plan: {
            columns: ['id', 'parent', 'notused', 'detail'],
            rows: [
              [
                '3',
                '0',
                '0',
                'SEARCH views USING COVERING INDEX views_viewable_type_viewable_id_viewed_at_index (viewable_type=? AND viewable_id=?)',
              ],
            ],
          },
        },
      ],
    },
    {
      class: 'CyrildeWit\\EloquentViewable\\Benchmarks\\Querying\\OrderByViewsBench',
      subject: 'benchOrderByViews',
      set: 'all time',
      params: { days: null },
      queries: [
        {
          sql: 'select * from "articles" order by (select count(*) from "views" where "articles"."id" = "views"."viewable_id" and "views"."viewable_type" = \'article\') desc limit 20',
          plan: {
            columns: ['id', 'parent', 'notused', 'detail'],
            rows: [
              ['2', '0', '0', 'SCAN articles'],
              ['9', '0', '0', 'CORRELATED SCALAR SUBQUERY 1'],
            ],
          },
        },
      ],
    },
  ],
};

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`fixtures/${path}`, import.meta.url)), 'utf8');
}

/** A minimal dump around the given `<benchmark>` elements, for the cases the real run does not cover. */
export function dump(benchmarks: string, { version = '1.7.0', suites = 1 } = {}): string {
  const suite = `
    <suite tag="t" date="2026-10-02T12:53:51+02:00" uuid="1">
      <env>
        <uname><value name="os" type="string">Linux</value><value name="machine" type="string">x86_64</value><value name="release" type="string">6.8.0</value></uname>
        <php><value name="version" type="string">8.5.11</value><value name="xdebug" type="boolean"></value></php>
      </env>
      ${benchmarks}
    </suite>`;

  return `<?xml version="1.0"?><phpbench version="${version}">${suite.repeat(suites)}</phpbench>`;
}

/** A `<benchmark>` element with one subject and one variant. */
export function benchmark(className: string, variant = passing()): string {
  return `<benchmark class="${className}"><subject name="benchIt"><group name="read"/>${variant}</subject></benchmark>`;
}

export function passing(parameters = ''): string {
  return `
    <variant revs="2">
      <parameter-set name="one">${parameters}</parameter-set>
      <iteration time-avg="10" mem-peak="100"/>
      <iteration time-avg="12" mem-peak="300" reject-count="2"/>
      <stats max="12" mean="11" min="10" mode="10.12345678" rstdev="9.0909" stdev="1"/>
    </variant>`;
}

export function failing(message: string): string {
  return `
    <variant revs="2">
      <parameter-set name="one"/>
      <errors><error exception-class="RuntimeException" code="0">${message}</error></errors>
    </variant>`;
}
