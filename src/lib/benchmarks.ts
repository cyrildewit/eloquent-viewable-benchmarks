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
