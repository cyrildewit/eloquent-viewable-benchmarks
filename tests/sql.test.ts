import { describe, expect, it } from 'vitest';
import { formatSql } from '../src/lib/sql.ts';
import { queries } from './support.ts';

describe('formatSql', () => {
  it('puts each clause on its own line and changes nothing but whitespace', () => {
    for (const query of queries.subjects.flatMap((subject) => subject.queries)) {
      const formatted = formatSql(query.sql, 'sqlite');

      expect(formatted).toContain('\nfrom\n');
      expect(formatted.replace(/\s+/g, '')).toBe(query.sql.replace(/\s+/g, ''));
    }
  });

  it('keeps a strftime format string as written', () => {
    const sql = `select strftime('%Y-%m-%d 00:00:00', "viewed_at") as interval_start from "views"`;

    expect(formatSql(sql, 'sqlite')).toContain(`'%Y-%m-%d 00:00:00'`);
  });

  it('reads backticks and escaped backslashes in MySQL', () => {
    const sql = "select count(distinct `visitor`) from `views` where `viewable_type` = 'A\\\\B'";

    expect(formatSql(sql, 'mysql')).toBe(
      "select\n  count(distinct `visitor`)\nfrom\n  `views`\nwhere\n  `viewable_type` = 'A\\\\B'",
    );
  });

  it('returns the statement as captured when it cannot parse it', () => {
    expect(formatSql('select "unterminated', 'pgsql')).toBe('select "unterminated');
  });
});
