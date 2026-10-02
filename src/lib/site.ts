/**
 * Links within the site and out to GitHub. Works at build time and in the browser.
 */

export const PACKAGE_REPO = 'https://github.com/cyrildewit/eloquent-viewable';
export const RESULTS_REPO = 'https://github.com/cyrildewit/eloquent-viewable-benchmarks';

/** A path inside the site, under the GitHub Pages base: `href('/runs/x/')` → `/eloquent-viewable-benchmarks/runs/x/`. */
export function href(path: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function commitUrl(commit: string): string {
  return `${PACKAGE_REPO}/commit/${commit}`;
}

/** The raw phpbench dump of a run, as stored in this repository. */
export function dumpUrl(path: string): string {
  return `${RESULTS_REPO}/blob/main/${path}`;
}

export function compareHref(baseId: string, headId: string, base?: string): string {
  return `${href('/compare/', base)}?a=${encodeURIComponent(baseId)}&b=${encodeURIComponent(headId)}`;
}

export function benchmarkHref(slug: string, base?: string): string {
  return href(`/benchmarks/${slug}/`, base);
}

/** The package's autoload rule for the harness, so a class name can be turned into a file in the repository. */
const HARNESS_NAMESPACE = 'CyrildeWit\\EloquentViewable\\Benchmarks\\';
const HARNESS_DIR = 'benchmarks';

/** A benchmark class in the package at a commit, or the harness directory when the class sits outside it. */
export function sourceUrl(fqcn: string, commit: string): string {
  if (!fqcn.startsWith(HARNESS_NAMESPACE)) {
    return `${PACKAGE_REPO}/tree/${commit}/${HARNESS_DIR}`;
  }
  const path = fqcn.slice(HARNESS_NAMESPACE.length).split('\\').join('/');

  return `${PACKAGE_REPO}/blob/${commit}/${HARNESS_DIR}/${path}.php`;
}
