/**
 * What each benchmark measures, for headings on the site. A benchmark missing here is shown by its name only.
 */
export const BENCHMARK_DESCRIPTIONS: Record<string, string> = {
  CountViewsBench: 'count() and unique()->count() for the hottest article, the coldest article and the whole type.',
  CountViewsByIntervalBench: 'countByInterval(), plain and unique, from a week of hours to two years of months.',
  OrderByViewsBench: 'orderByViews() and orderByUniqueViews(), the first page of twenty.',
  RecordViewBench: 'record() into the full table, directly and through the sync queue.',
  DestroyViewsBench: 'destroy() of a hundred, a thousand and ten thousand views.',
  ViewSeriesBench: 'ViewSeries::fill(), the PHP side of countByInterval().',
  CooldownManagerBench: 'CooldownManager::push() with up to ten thousand cooldowns in the session.',
};

export const GROUP_LABELS: Record<string, string> = {
  read: 'Reading',
  write: 'Writing',
  php: 'PHP only',
};

/** `benchCountByInterval` → `countByInterval`. */
export function subjectLabel(subject: string): string {
  const name = subject.replace(/^bench/, '');

  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** phpbench joins the parts of a parameter set name without a space: `hot article,all time` → `hot article, all time`. */
export function setLabel(set: string): string {
  return set === '' ? '—' : set.split(',').join(', ');
}

/** Above this relative deviation phpbench retries a subject; one that stays above it is shown with a warning. */
export const NOISY_RSTDEV = 5;

/** The page address of a benchmark class: `CountViewsBench` → `count-views`. Only the short name goes in. */
export function benchmarkSlug(benchmark: string): string {
  return benchmark
    .replace(/Bench$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** Slug to class name for every class given, refusing two classes that would share a page. */
export function benchmarkSlugs(benchmarks: Iterable<string>): Map<string, string> {
  const slugs = new Map<string, string>();
  for (const benchmark of benchmarks) {
    const slug = benchmarkSlug(benchmark);
    const seen = slugs.get(slug);
    if (seen !== undefined && seen !== benchmark) {
      throw new Error(`${seen} and ${benchmark} would both be at /benchmarks/${slug}/`);
    }
    slugs.set(slug, benchmark);
  }

  return slugs;
}
