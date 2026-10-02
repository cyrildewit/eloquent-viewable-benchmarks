/**
 * The trends page: reads the filters and draws a card per subject, grouped by benchmark, as they scroll into view.
 */
import { BENCHMARK_DESCRIPTIONS, benchmarkSlug } from '../lib/benchmarks.ts';
import type { IndexData } from '../lib/data.ts';
import { benchmarkHref } from '../lib/site.ts';
import { buildTrend } from '../lib/trends.ts';
import { fetchIndex } from './index-data.ts';
import { bindFilters, type SeriesFilter } from './series-filters.ts';
import { ChartSet, emptyStatus, positioned, renderSubjectCards, trendStatus } from './subject-cards.ts';
import { onThemeChange } from './theme.ts';

export function setupTrends(): void {
  const root = document.getElementById('trends');
  const form = document.getElementById('series-filters');
  const status = document.getElementById('trend-status');
  if (root === null || !(form instanceof HTMLFormElement) || status === null) {
    return;
  }
  const base = root.dataset.base ?? '/';
  const charts = new ChartSet();

  fetchIndex(base)
    .then((index) => {
      bindFilters(form, (filter) => {
        charts.dispose();
        renderTrends(index, filter, root, status, charts, base);
      });
      onThemeChange(() => charts.redraw());
      window.addEventListener('resize', () => charts.resize());
    })
    .catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Could not load the results.';
    });
}

function renderTrends(
  index: IndexData,
  filter: SeriesFilter,
  root: HTMLElement,
  status: HTMLElement,
  charts: ChartSet,
  base: string,
): void {
  const trend = buildTrend(index, filter);
  root.replaceChildren();

  if (trend.categories.length === 0) {
    status.textContent = emptyStatus(filter.view);

    return;
  }

  const subjects = positioned(
    index.subjects,
    (subject) => filter.group === '' || subject.groups.includes(filter.group),
  );
  status.textContent = trendStatus(trend, filter.view, subjects.length);

  // One section per benchmark class, in index order.
  const classes = [...new Set(subjects.map(({ subject }) => subject.benchmark))];
  for (const benchmark of classes) {
    const section = document.createElement('section');
    section.className = 'mt-10 first:mt-4';
    const heading = document.createElement('h2');
    heading.className = 'text-lg font-semibold';
    heading.id = benchmark;
    const link = document.createElement('a');
    link.href = benchmarkHref(benchmarkSlug(benchmark), base);
    link.textContent = benchmark;
    heading.append(link);
    const description = document.createElement('p');
    description.className = 'mt-1 text-sm text-ink-2';
    description.textContent = BENCHMARK_DESCRIPTIONS[benchmark] ?? '';
    const grid = document.createElement('div');
    grid.className = 'mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3';
    section.append(heading, description, grid);
    root.append(section);

    renderSubjectCards(
      grid,
      trend,
      subjects.filter(({ subject }) => subject.benchmark === benchmark),
      charts,
      base,
    );
  }
}
