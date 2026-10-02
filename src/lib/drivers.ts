/**
 * How each driver is shown. The order and colours are fixed so a driver looks the same in every chart and table, and
 * never changes colour when a filter hides another one. The colours are the first four categorical slots of the
 * validated palette in src/styles/global.css; the marker shape is a second channel, so identity is never colour alone.
 */
import type { DRIVERS } from './schema.ts';

export type Driver = (typeof DRIVERS)[number];

export const DRIVER_ORDER: readonly Driver[] = ['sqlite', 'mysql', 'mariadb', 'pgsql'];

export const DRIVER_LABELS: Record<Driver, string> = {
  sqlite: 'SQLite',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  pgsql: 'PostgreSQL',
};

/** ECharts symbol names, one per driver. */
export const DRIVER_SYMBOLS: Record<Driver, string> = {
  sqlite: 'circle',
  mysql: 'rect',
  mariadb: 'triangle',
  pgsql: 'diamond',
};

/** The CSS custom property holding a driver's colour. */
export function driverColorVar(driver: Driver): string {
  return `--driver-${driver}`;
}

export const SIZE_ORDER = ['small', 'medium', 'large'] as const;
