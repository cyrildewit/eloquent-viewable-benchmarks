/**
 * A card per subject: its trend chart, drawn as it scrolls into view, with the numbers in a table behind a
 * disclosure. The trends page shows every subject this way, a benchmark page its own.
 */
import { setLabel, subjectLabel } from '../lib/benchmarks.ts';
import type { SubjectInfo } from '../lib/data.ts';
import { DRIVER_LABELS, DRIVER_SYMBOLS, driverColorVar } from '../lib/drivers.ts';
import { formatDeviation, formatTime, timeUnit } from '../lib/format.ts';
import { href } from '../lib/site.ts';
import type { Trend } from '../lib/trends.ts';
import { chrome, cssVar, echarts, escapeHtml, tooltipIndex, type ChartOption } from './charts.ts';

export interface Drawn {
  chart: echarts.ECharts;
  draw: () => void;
}

/** A subject with its position in the index, which is also its position in every run's measurements. */
export interface Positioned {
  subject: SubjectInfo;
  position: number;
}

export function positioned(subjects: SubjectInfo[], keep: (subject: SubjectInfo) => boolean): Positioned[] {
  return subjects.map((subject, position) => ({ subject, position })).filter(({ subject }) => keep(subject));
}

/** The charts drawn on a page, so they can be redrawn on a theme change and disposed on a filter change. */
export class ChartSet {
  private readonly drawn = new Set<Drawn>();

  add(item: Drawn): void {
    this.drawn.add(item);
  }

  dispose(): void {
    for (const item of this.drawn) {
      item.chart.dispose();
    }
    this.drawn.clear();
  }

  redraw(): void {
    for (const item of this.drawn) {
      item.draw();
    }
  }

  resize(): void {
    for (const item of this.drawn) {
      item.chart.resize();
    }
  }
}

/** Appends a card per subject to `container`, each drawing its chart when it comes into view. */
export function renderSubjectCards(
  container: HTMLElement,
  trend: Trend,
  subjects: Positioned[],
  charts: ChartSet,
  base: string,
): void {
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

  for (const { subject, position } of subjects) {
    const card = subjectCard(subject, position, trend, charts, base);
    container.append(card);
    observer.observe(card);
  }
}

/** The sentence above the cards: how many measurements across how many points, and where versions changed. */
export function trendStatus(trend: Trend, view: 'releases' | 'branch', count: number): string {
  const shown = trend.categories.length;

  return `${count} measurements across ${shown} ${
    view === 'releases' ? (shown === 1 ? 'release' : 'releases') : shown === 1 ? 'run' : 'runs'
  }.${shown === 1 ? ' A trend needs a second point.' : ''}${
    trend.markers.length > 0
      ? ` Vertical lines mark version changes: ${trend.markers
          .map((marker) => `${marker.text} from ${trend.categories[marker.index]?.label ?? ''}`)
          .join(', ')}.`
      : ''
  }`;
}

export function emptyStatus(view: 'releases' | 'branch'): string {
  return view === 'branch'
    ? 'No branch runs in this series yet.'
    : 'No releases measured in this series yet. Try another runner or dataset size.';
}

function subjectCard(
  subject: SubjectInfo,
  position: number,
  trend: Trend,
  charts: ChartSet,
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
    charts.add(item);
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
