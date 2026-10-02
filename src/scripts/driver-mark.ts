/**
 * A driver's name with its marker, built in the browser: the same shapes and colours as `DriverName.astro`.
 */
import { DRIVER_LABELS, type Driver } from '../lib/drivers.ts';

const SHAPES: Record<Driver, string> = {
  sqlite: '<circle cx="5" cy="5" r="4.5"/>',
  mysql: '<rect x="0.5" y="0.5" width="9" height="9" rx="1"/>',
  mariadb: '<path d="M5 0.5 9.5 9.5H0.5Z"/>',
  pgsql: '<path d="M5 0 10 5 5 10 0 5Z"/>',
};

export function driverName(driver: Driver): HTMLElement {
  const span = document.createElement('span');
  span.className = 'inline-flex items-center gap-1.5 whitespace-nowrap';
  span.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="shrink-0" fill="var(--driver-${driver})">${SHAPES[driver]}</svg>`;
  span.append(DRIVER_LABELS[driver]);

  return span;
}
