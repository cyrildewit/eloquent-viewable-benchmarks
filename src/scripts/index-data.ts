/**
 * Loading /data/index.json in the browser, once per page.
 */
import type { IndexData } from '../lib/data.ts';
import { href } from '../lib/site.ts';

let loading: Promise<IndexData> | undefined;

export function fetchIndex(base: string): Promise<IndexData> {
  loading ??= fetch(href('/data/index.json', base)).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load the results (HTTP ${response.status})`);
    }

    return response.json() as Promise<IndexData>;
  });

  return loading;
}

/** Reads and writes the page's query string for filter state, so a filtered view is a link. */
export function readParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function writeParams(values: Record<string, string>): void {
  const params = new URLSearchParams(values);
  history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}
