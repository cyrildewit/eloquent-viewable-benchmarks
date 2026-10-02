/**
 * Number and date formatting for the site. Pure functions, used at build time and in the browser.
 */

const UNITS = [
  { unit: 's', factor: 1_000_000 },
  { unit: 'ms', factor: 1_000 },
  { unit: 'µs', factor: 1 },
] as const;

export type TimeUnit = (typeof UNITS)[number]['unit'];

/** The unit that keeps a time in microseconds readable: below 1,000 of it, at least 1 of it. */
export function timeUnit(micros: number): { unit: TimeUnit; factor: number } {
  return UNITS.find(({ factor }) => Math.abs(micros) >= factor) ?? UNITS[UNITS.length - 1];
}

/** `762.649` → `763 µs`, `139335.379` → `139 ms`, `1202473` → `1.20 s`. Three significant digits. */
export function formatTime(micros: number, unit = timeUnit(micros)): string {
  const value = micros / unit.factor;

  return `${significant(value)} ${unit.unit}`;
}

/** `12.345` → `+12.3%`, `-0.04` → `−0.0%`, with a real minus sign. */
export function formatChange(percent: number): string {
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';

  return `${sign}${Math.abs(percent).toFixed(1)}%`;
}

/** `2.317` → `±2.3%`. */
export function formatDeviation(rstdev: number): string {
  return `±${rstdev.toFixed(1)}%`;
}

/** `6775000` → `6.8 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1_000)} kB`;
}

/** `10000000` → `10M`, `1000` → `1K`. */
export function formatCount(count: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
}

/** `2026-10-02T10:53:51Z` → `2 Oct 2026`. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

function significant(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;

  return value.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
