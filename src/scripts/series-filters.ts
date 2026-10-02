/**
 * The series filter row (`SeriesFilters.astro`): reading it, restoring it from the URL and keeping the URL in step.
 */
import type { TrendFilter } from '../lib/trends.ts';
import { readParams, writeParams } from './index-data.ts';

export type SeriesFilter = TrendFilter & { group: string };

export function readFilters(form: HTMLFormElement): SeriesFilter {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? '');

  return {
    runner: value('runner'),
    size: value('size'),
    indexes: value('indexes'),
    group: value('group'),
    view: value('view') === 'branch' ? 'branch' : 'releases',
  };
}

/** Applies filters from the URL, ignoring values the form does not offer. */
export function restoreFilters(form: HTMLFormElement): void {
  for (const [name, value] of readParams()) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLSelectElement && [...field.options].some((option) => option.value === value)) {
      field.value = value;
    } else if (field instanceof RadioNodeList) {
      for (const radio of field) {
        if (radio instanceof HTMLInputElement) {
          radio.checked = radio.value === value;
        }
      }
    }
  }
}

/** Restores the form from the URL, then calls `onChange` now and on every change, writing the URL first. */
export function bindFilters(form: HTMLFormElement, onChange: (filter: SeriesFilter) => void): void {
  restoreFilters(form);
  form.addEventListener('change', () => {
    writeParams(Object.fromEntries(new FormData(form)) as Record<string, string>);
    onChange(readFilters(form));
  });
  onChange(readFilters(form));
}
