/**
 * Made-up SQL and query plans for the read subjects of a sample run, so the benchmark pages have something to show.
 * The statements resemble what the package generates; the plans are a few rows in each driver's explain columns.
 * One release changes the plan on one database, so the "plan changed" note can be seen. The SQLite and Postgres runs
 * are executed, with a made-up time per statement, so both kinds of run show up on the pages.
 */
import type { Result, SubjectQueries } from '../src/lib/schema.ts';

type Driver = Result['database']['driver'];

const QUOTE: Record<Driver, (name: string) => string> = {
  sqlite: (name) => `"${name}"`,
  mysql: (name) => `\`${name}\``,
  mariadb: (name) => `\`${name}\``,
  pgsql: (name) => `"${name}"`,
};

const COLUMNS: Record<Driver, string[]> = {
  sqlite: ['id', 'parent', 'notused', 'detail'],
  mysql: [
    'id',
    'select_type',
    'table',
    'partitions',
    'type',
    'possible_keys',
    'key',
    'key_len',
    'ref',
    'rows',
    'filtered',
    'Extra',
  ],
  mariadb: ['id', 'select_type', 'table', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'Extra'],
  pgsql: ['QUERY PLAN'],
};

const INDEX = 'views_viewable_type_viewable_id_viewed_at_index';

/** The databases whose sample runs are executed. Not MySQL, whose plan change needs two runs captured alike. */
const EXECUTED: Driver[] = ['sqlite', 'pgsql'];

export function sampleQueries(result: Result, ref: string): NonNullable<Result['queries']> {
  const driver = result.database.driver;
  const q = QUOTE[driver];
  const hot = 1;
  const cold = result.dataset.articles - 21;
  const anchor = result.dataset.anchor;
  const executed = EXECUTED.includes(driver);

  const subjects: SubjectQueries[] = result.subjects
    .filter((subject) => subject.groups.includes('read'))
    .map((subject) => {
      const target = subject.params.target;
      const days = subject.params.days;
      const where = [
        `${q('views')}.${q('viewable_type')} = 'article'`,
        target === 'type' ? null : `${q('views')}.${q('viewable_id')} = ${target === 'hot' ? hot : cold}`,
        typeof days === 'number'
          ? `${q('views')}.${q('viewed_at')} between '${since(anchor, days)}' and '${anchor}'`
          : null,
      ]
        .filter((clause) => clause !== null)
        .join(' and ');
      const unique = subject.subject.includes('Unique');
      const count = unique ? `count(distinct ${q('views')}.${q('visitor')})` : 'count(*)';
      const rows =
        typeof days === 'number'
          ? Math.round((result.dataset.hot_article_views * days) / 730)
          : result.dataset.hot_article_views;

      let sql: string;
      if (subject.benchmark === 'CountViewsByIntervalBench') {
        const bucket =
          subject.params.granularity === 'hour' ? 'hour' : subject.params.granularity === 'day' ? 'day' : 'week';
        sql = `select ${bucketExpression(driver, bucket, q)} as ${q('bucket')}, ${count} as ${q('aggregate')} from ${q('views')} where ${where} group by ${q('bucket')} order by ${q('bucket')} asc`;
      } else if (subject.benchmark === 'OrderByViewsBench') {
        sql = `select * from ${q('articles')} order by (select ${count} from ${q('views')} where ${q('articles')}.${q('id')} = ${q('views')}.${q('viewable_id')} and ${where}) desc limit 20`;
      } else {
        sql = `select ${count} as ${q('aggregate')} from ${q('views')} where ${where}`;
      }

      // The invented plan change: v9.2.0 stops using the covering index for unique counts on MySQL.
      const changed = driver === 'mysql' && unique && subject.benchmark === 'CountViewsBench' && ref === 'v9.2.0';

      return {
        benchmark: subject.benchmark,
        subject: subject.subject,
        set: subject.set,
        queries: [{ sql, plan: { columns: COLUMNS[driver], rows: plan(driver, subject.benchmark, rows, changed) } }],
        // Roughly a millisecond per ten thousand rows read, rounded to two decimals as Laravel's query log is.
        timings_ms: executed ? [Math.round((rows / 10_000 + 0.05) * 100) / 100] : null,
      };
    });

  return { analyzed: false, executed, group: 'read', subjects };
}

function since(anchor: string, days: number): string {
  const date = new Date(`${anchor.replace(' ', 'T')}Z`);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function bucketExpression(driver: Driver, bucket: string, q: (name: string) => string): string {
  const column = `${q('views')}.${q('viewed_at')}`;
  switch (driver) {
    case 'pgsql':
      return `date_trunc('${bucket}', ${column})`;
    case 'sqlite':
      return `strftime('${bucket === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d'}', ${column})`;
    default:
      return `date_format(${column}, '${bucket === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d'}')`;
  }
}

function plan(driver: Driver, benchmark: string, rows: number, changed: boolean): (string | null)[][] {
  const ordering = benchmark === 'OrderByViewsBench';
  switch (driver) {
    case 'sqlite':
      return ordering
        ? [
            ['2', '0', '0', 'SCAN articles'],
            ['9', '0', '0', 'CORRELATED SCALAR SUBQUERY 1'],
            ['14', '9', '0', `SEARCH views USING COVERING INDEX ${INDEX} (viewable_type=? AND viewable_id=?)`],
            ['38', '0', '0', 'USE TEMP B-TREE FOR ORDER BY'],
          ]
        : [['3', '0', '0', `SEARCH views USING COVERING INDEX ${INDEX} (viewable_type=? AND viewable_id=?)`]];
    case 'mysql':
      return ordering
        ? [
            ['1', 'PRIMARY', 'articles', null, 'ALL', null, null, null, null, '10000', '100.00', 'Using filesort'],
            [
              '2',
              'DEPENDENT SUBQUERY',
              'views',
              null,
              'ref',
              INDEX,
              INDEX,
              '1030',
              'const,articles.id',
              String(rows),
              '100.00',
              'Using index',
            ],
          ]
        : [
            [
              '1',
              'SIMPLE',
              'views',
              null,
              changed ? 'range' : 'ref',
              INDEX,
              INDEX,
              changed ? '1036' : '1030',
              changed ? null : 'const,const',
              String(rows),
              '100.00',
              changed ? 'Using where; Using index' : 'Using index',
            ],
          ];
    case 'mariadb':
      return ordering
        ? [
            ['1', 'PRIMARY', 'articles', 'ALL', null, null, null, null, '10000', 'Using filesort'],
            [
              '2',
              'DEPENDENT SUBQUERY',
              'views',
              'ref',
              INDEX,
              INDEX,
              '1030',
              'const,articles.id',
              String(rows),
              'Using index',
            ],
          ]
        : [['1', 'SIMPLE', 'views', 'ref', INDEX, INDEX, '1030', 'const,const', String(rows), 'Using index']];
    case 'pgsql':
      return ordering
        ? [
            ['Limit  (cost=48211.10..48211.15 rows=20 width=52)'],
            ['  ->  Sort  (cost=48211.10..48236.10 rows=10000 width=52)'],
            ['        Sort Key: ((SubPlan 1)) DESC'],
            ['        ->  Seq Scan on articles  (cost=0.00..47945.00 rows=10000 width=52)'],
            ['              SubPlan 1'],
            [`                ->  Aggregate  (cost=4.78..4.79 rows=1 width=8)`],
            [
              `                      ->  Index Only Scan using ${INDEX} on views  (cost=0.56..4.77 rows=${rows} width=0)`,
            ],
          ]
        : [
            ['Aggregate  (cost=12.98..12.99 rows=1 width=8)'],
            [`  ->  Index Only Scan using ${INDEX} on views  (cost=0.56..10.42 rows=${rows} width=0)`],
            ["        Index Cond: ((viewable_type = 'article'::text) AND (viewable_id = 1))"],
          ];
  }
}
