/**
 * The trends page: reads the filters, builds the trend and draws a chart per subject as it scrolls into view.
 */
import { BENCHMARK_DESCRIPTIONS, setLabel, subjectLabel } from '../lib/benchmarks.ts';
import type { IndexData, SubjectInfo } from '../lib/data.ts';
import { DRIVER_LABELS, DRIVER_SYMBOLS, driverColorVar } from '../lib/drivers.ts';
import { formatDeviation, formatTime, timeUnit } from '../lib/format.ts';
import { href } from '../lib/site.ts';
import { buildTrend, type Trend, type TrendFilter } from '../lib/trends.ts';
import { chrome, cssVar, echarts, escapeHtml, tooltipIndex, type ChartOption } from './charts.ts';
import { fetchIndex, readParams, writeParams } from './index-data.ts';
import { onThemeChange } from './theme.ts';

interface Drawn {
  chart: echarts.ECharts;
  draw: () => void;
}

export function setupTrends(): void {
  const root = document.getElementById('trends');
  const form = document.getElementById('trend-filters');
  const status = document.getElementById('trend-status');
  if (root === null || !(form instanceof HTMLFormElement) || status === null) {
    return;
  }
  const base = root.dataset.base ?? '/';

  fetchIndex(base)
    .then((index) => {
      restoreFilters(form);
      const drawn = new Set<Drawn>();
      const render = () => {
        for (const item of drawn) {
          item.chart.dispose();
        }
        drawn.clear();
        renderTrends(index, readFilters(form), root, status, drawn, base);
      };

      form.addEventListener('change', () => {
        writeParams(Object.fromEntries(new FormData(form)) as Record<string, string>);
        render();
      });
      onThemeChange(() => {
        for (const item of drawn) {
          item.draw();
        }
      });
      window.addEventListener('resize', () => {
        for (const item of drawn) {
          item.chart.resize();
        }
      });
      render();
    })
    .catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Could not load the results.';
    });
}

function readFilters(form: HTMLFormElement): TrendFilter & { group: string } {
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
function restoreFilters(form: HTMLFormElement): void {
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

function renderTrends(
  index: IndexData,
  filter: TrendFilter & { group: string },
  root: HTMLElement,
  status: HTMLElement,
  drawn: Set<Drawn>,
  base: string,
): void {
  const trend = buildTrend(index, filter);
  root.replaceChildren();

  if (trend.categories.length === 0) {
    status.textContent =
      filter.view === 'branch'
        ? 'No weekly branch runs in this series yet.'
        : 'No releases measured in this series yet. Try another runner or dataset size.';

    return;
  }

  const subjects = index.subjects
    .map((subject, position) => ({ subject, position }))
    .filter(({ subject }) => filter.group === '' || subject.groups.includes(filter.group));
  const shown = trend.categories.length;
  status.textContent = `${subjects.length} measurements across ${shown} ${
    filter.view === 'releases' ? (shown === 1 ? 'release' : 'releases') : shown === 1 ? 'run' : 'runs'
  }.${trend.categories.length === 1 ? ' A trend needs a second point.' : ''}${
    trend.markers.length > 0
      ? ` Vertical lines mark version changes: ${trend.markers
          .map((marker) => `${marker.text} from ${trend.categories[marker.index]?.label ?? ''}`)
          .join(', ')}.`
      : ''
  }`;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          (entry.target as HTMLElement & { draw?: () => void }).draw?.();
        }
      }
    },
    { rootMargin: '200px' },
  );

  let section: HTMLElement | null = null;
  let current = '';
  for (const { subject, position } of subjects) {
    if (subject.benchmark !== current) {
      current = subject.benchmark;
      section = document.createElement('section');
      section.className = 'mt-10 first:mt-4';
      const heading = document.createElement('h2');
      heading.className = 'text-lg font-semibold';
      heading.id = subject.benchmark;
      heading.textContent = subject.benchmark;
      const description = document.createElement('p');
      description.className = 'mt-1 text-sm text-ink-2';
      description.textContent = BENCHMARK_DESCRIPTIONS[subject.benchmark] ?? '';
      const grid = document.createElement('div');
      grid.className = 'mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3';
      section.append(heading, description, grid);
      root.append(section);
    }

    const card = subjectCard(subject, position, trend, drawn, base);
    section?.lastElementChild?.append(card);
    observer.observe(card);
  }
}

function subjectCard(
  subject: SubjectInfo,
  position: number,
  trend: Trend,
  drawn: Set<Drawn>,
  base: string,
): HTMLElement & { draw?: () => void } {
  const card: HTMLElement & { draw?: () => void } = document.createElement('article');
  card.className = 'card min-w-0 p-4';

  const title = document.createElement('h3');
  title.className = 'text-sm font-medium';
  const code = document.createElement('code');
  code.className = 'font-mono';
  code.textContent = subjectLabel(subject.subject);
  title.append(code);
  if (subject.set !== '') {
    const set = document.createElement('span');
    set.className = 'ml-2 font-normal text-ink-2';
    set.textContent = setLabel(subject.set);
    title.append(set);
  }

  const values = trend.lines.flatMap((line) =>
    line.runs.map((run) => run?.modes[position]).filter((mode) => typeof mode === 'number'),
  );
  const unit = timeUnit(Math.max(0, ...values));

  const plot = document.createElement('div');
  plot.className = 'mt-2 h-56 w-full';
  plot.setAttribute('role', 'img');
  plot.setAttribute(
    'aria-label',
    `${subjectLabel(subject.subject)} ${setLabel(subject.set)}: time per call in ${unit.unit} across ${trend.categories.length} points, one line per database. The table below has the numbers.`,
  );

  card.append(title, plot);
  card.append(table(position, trend, base));

  card.draw = () => {
    const chart = echarts.getInstanceByDom(plot) ?? echarts.init(plot, undefined, { renderer: 'svg' });
    const item: Drawn = { chart, draw: () => chart.setOption(option(position, trend, unit), { notMerge: true }) };
    item.draw();
    drawn.add(item);
  };

  return card;
}

function option(position: number, trend: Trend, unit: ReturnType<typeof timeUnit>): ChartOption {
  const colors = chrome();

  return {
    animation: false,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.categories.map((category) => category.label),
      boundaryGap: trend.categories.length === 1,
      axisLine: { lineStyle: { color: colors.axis } },
      axisTick: { show: false },
      axisLabel: { color: colors.muted, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      name: unit.unit,
      nameTextStyle: { color: colors.muted, align: 'right' },
      splitNumber: 4,
      axisLabel: { color: colors.muted },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: colors.axis } },
      backgroundColor: colors.raised,
      borderColor: colors.border,
      padding: [8, 10],
      textStyle: { color: colors.ink, fontSize: 12 },
      formatter: (params) => tooltip(tooltipIndex(params), position, trend),
    },
    series: trend.lines.map((line, i) => {
      const color = cssVar(driverColorVar(line.driver));
      const series: ChartOption['series'] = {
        type: 'line',
        name: DRIVER_LABELS[line.driver],
        data: line.runs.map((run) => {
          const mode = run?.modes[position];

          return typeof mode === 'number' ? mode / unit.factor : null;
        }),
        connectNulls: false,
        symbol: DRIVER_SYMBOLS[line.driver],
        symbolSize: 8,
        showAllSymbol: true,
        lineStyle: { width: 2, color, cap: 'round', join: 'round' },
        itemStyle: { color, borderColor: colors.surface, borderWidth: 2 },
        emphasis: { focus: 'series', scale: 1.4 },
        markLine:
          i === 0 && trend.markers.length > 0
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: colors.axis, type: 'solid', width: 1 },
                label: { show: false },
                data: trend.markers.map((marker) => ({ xAxis: marker.index, name: marker.text })),
              }
            : undefined,
      };

      return series;
    }),
  };
}

function tooltip(at: number, position: number, trend: Trend): string {
  const category = trend.categories[at];
  if (category === undefined) {
    return '';
  }

  const rows = trend.lines
    .map((line) => ({ line, run: line.runs[at] }))
    .filter(({ run }) => run !== null && run !== undefined && typeof run.modes[position] === 'number')
    .map(({ line, run }) => {
      const mode = run?.modes[position] ?? 0;
      const rstdev = run?.rstdevs[position] ?? 0;
      const color = cssVar(driverColorVar(line.driver));

      return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <span style="display:inline-block;width:12px;height:2px;background:${escapeHtml(color)}"></span>
        <strong style="font-variant-numeric:tabular-nums">${escapeHtml(formatTime(mode))}</strong>
        <span style="opacity:.75">${escapeHtml(formatDeviation(rstdev))} · ${escapeHtml(DRIVER_LABELS[line.driver])}</span>
      </div>`;
    });

  const run = trend.lines.map((line) => line.runs[at]).find((candidate) => candidate);
  const versions = run ? `PHP ${run.php} · Laravel ${run.laravel}` : '';

  return `<div style="font-weight:600">${escapeHtml(category.label)}</div>${rows.join('')}
    <div style="margin-top:6px;opacity:.7;font-size:11px">${escapeHtml(versions)}</div>`;
}

/** The chart's numbers as a table, behind a disclosure. */
function table(position: number, trend: Trend, base: string): HTMLElement {
  const details = document.createElement('details');
  details.className = 'mt-2 text-sm';
  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer text-ink-2';
  summary.textContent = 'Table';
  details.append(summary);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap mt-2';
  const tableElement = document.createElement('table');
  tableElement.className = 'data-table';
  const head = tableElement.createTHead().insertRow();
  const corner = document.createElement('th');
  corner.textContent = 'Point';
  head.append(corner);
  for (const line of trend.lines) {
    const th = document.createElement('th');
    th.className = 'num';
    th.textContent = DRIVER_LABELS[line.driver];
    head.append(th);
  }

  const body = tableElement.createTBody();
  trend.categories.forEach((category, at) => {
    const row = body.insertRow();
    const label = row.insertCell();
    label.textContent = category.label;
    for (const line of trend.lines) {
      const cell = row.insertCell();
      cell.className = 'num';
      const run = line.runs[at];
      const mode = run?.modes[position];
      if (run && typeof mode === 'number') {
        const link = document.createElement('a');
        link.href = href(`/runs/${run.id}/`, base);
        link.textContent = formatTime(mode);
        cell.append(link, ` ${formatDeviation(run.rstdevs[position] ?? 0)}`);
      } else {
        cell.textContent = '—';
      }
    }
  });

  wrap.append(tableElement);
  details.append(wrap);

  return details;
}
