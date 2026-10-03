/**
 * Captured SQL laid out for reading: one clause per line, in the dialect of the database that ran it. Only the
 * whitespace changes; keywords, identifiers and values stay as the framework wrote them.
 */
import { format, type SqlLanguage } from 'sql-formatter';
import type { Driver } from './drivers.ts';

const DIALECTS: Record<Driver, SqlLanguage> = {
  sqlite: 'sqlite',
  mysql: 'mysql',
  mariadb: 'mariadb',
  pgsql: 'postgresql',
};

/** The statement formatted, or as captured when the formatter cannot parse it. */
export function formatSql(sql: string, driver: Driver): string {
  try {
    return format(sql, { language: DIALECTS[driver], tabWidth: 2, keywordCase: 'preserve', linesBetweenQueries: 1 });
  } catch {
    return sql;
  }
}
