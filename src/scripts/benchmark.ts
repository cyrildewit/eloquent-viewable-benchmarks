/**
 * A benchmark page: the filters, then a table per subject with the latest point of the series, then the trend
 * cards of this benchmark's subjects.
 */
import { NOISY_RSTDEV, setLabel, subjectLabel } from '../lib/benchmarks.ts';
import type { IndexData } from '../lib/data.ts';
import { formatDeviation, formatTime } from '../lib/format.ts';
import { href } from '../lib/site.ts';
import { latestPoint, type Snapshot } from '../lib/snapshot.ts';
import { buildTrend } from '../lib/trends.ts';
import { driverName } from './driver-mark.ts';
import { fetchIndex } from './index-data.ts';
import { bindFilters, type SeriesFilter } from './series-filters.ts';
import { ChartSet, emptyStatus, positioned, renderSubjectCards, trendStatus } from './subject-cards.ts';
import { onThemeChange } from './theme.ts';

export function setupBenchmark(): void {
  const now = document.getElementById('benchmark-now');
  const cards = document.getElementById('benchmark-trends');
  const form = document.getElementById('series-filters');
  const status = document.getElementById('benchmark-status');
  const benchmark = now?.dataset.benchmark;
  if (now === null || cards === null || !(form instanceof HTMLFormElement) || status === null || !benchmark) {
    return;
  }
  const base = now.dataset.base ?? '/';
  const charts = new ChartSet();

  fetchIndex(base)
    .then((index) => {
      bindFilters(form, (filter) => {
        charts.dispose();
        render(index, benchmark, filter, { now, cards, status }, charts, base);
      });
      onThemeChange(() => charts.redraw());
      window.addEventListener('resize', () => charts.resize());
    })
    .catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Could not load the results.';
    });
}

function render(
  index: IndexData,
  benchmark: string,
  filter: SeriesFilter,
  elements: { now: HTMLElement; cards: HTMLElement; status: HTMLElement },
  charts: ChartSet,
  base: string,
): void {
  const trend = buildTrend(index, filter);
  const subjects = positioned(index.subjects, (subject) => subject.benchmark === benchmark);
  elements.now.replaceChildren();
  elements.cards.replaceChildren();

  if (trend.categories.length === 0) {
    elements.status.textContent = emptyStatus(filter.view);

    return;
  }

  elements.status.textContent = trendStatus(trend, filter.view, subjects.length);
  renderSnapshot(elements.now, latestPoint(trend, subjects), filter, base);
  renderSubjectCards(elements.cards, trend, subjects, charts, base);
}

/** One table per subject: parameter sets against databases, at the last point of the series. */
function renderSnapshot(root: HTMLElement, snapshot: Snapshot, filter: SeriesFilter, base: string): void {
  if (snapshot.point === null) {
    return;
  }

  const runner = filter.runner === 'gha' ? 'GitHub Actions' : filter.runner;
  const indexes = filter.indexes === 'none' ? '' : ` with the ${filter.indexes} indexes`;
  const intro = document.createElement('p');
  intro.className = 'text-sm text-ink-2';
  intro.append(
    `${filter.view === 'releases' ? 'Release' : 'Branch run of'} `,
    strong(snapshot.point.label),
    ` on ${runner}, ${filter.size} dataset${indexes}. Time per call, lower is faster; each number links to its run.`,
  );
  root.append(intro);

  for (const table of snapshot.tables) {
    const heading = document.createElement('h3');
    heading.className = 'mt-6 text-base font-medium';
    heading.id = table.subject;
    const code = document.createElement('code');
    code.className = 'font-mono';
    code.textContent = subjectLabel(table.subject);
    heading.append(code);
    root.append(heading);

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap mt-2';
    const element = document.createElement('table');
    element.className = 'data-table';
    const head = element.createTHead().insertRow();
    const corner = document.createElement('th');
    corner.textContent = 'Parameters';
    head.append(corner);
    for (const driver of snapshot.drivers) {
      const th = document.createElement('th');
      th.className = 'num';
      th.append(driverName(driver));
      head.append(th);
    }

    const body = element.createTBody();
    for (const row of table.rows) {
      const tr = body.insertRow();
      const label = tr.insertCell();
      label.className = 'text-ink-2';
      label.textContent = setLabel(row.subject.set);
      for (const cell of row.cells) {
        const td = tr.insertCell();
        td.className = 'num';
        if (cell === null) {
          td.textContent = '—';
          continue;
        }
        const link = document.createElement('a');
        link.className = 'font-medium';
        link.href = href(`/runs/${cell.run.id}/`, base);
        link.textContent = formatTime(cell.mode);
        const deviation = document.createElement('span');
        deviation.className = 'ml-1 text-ink-2';
        deviation.textContent = formatDeviation(cell.rstdev);
        if (cell.rstdev > NOISY_RSTDEV) {
          const warning = document.createElement('span');
          warning.title = "Above phpbench's retry threshold even after retries";
          warning.setAttribute('aria-label', 'Noisy');
          warning.textContent = '⚠ ';
          td.append(warning);
        }
        td.append(link, deviation);
      }
    }

    wrap.append(element);
    root.append(wrap);
  }
}

function strong(text: string): HTMLElement {
  const element = document.createElement('strong');
  element.className = 'text-ink';
  element.textContent = text;

  return element;
}
