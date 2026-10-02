/**
 * The compare page: the two picked runs, compared subject by subject, with the choice kept in the URL.
 */
import { benchmarkSlug, setLabel, subjectLabel } from '../lib/benchmarks.ts';
import { compare, summariseComparison, type ComparisonRow, type Verdict } from '../lib/compare.ts';
import { measurements, parseSeriesKey, seriesLabel, type IndexData, type IndexedRun } from '../lib/data.ts';
import { DRIVER_LABELS } from '../lib/drivers.ts';
import { formatChange, formatDeviation, formatTime } from '../lib/format.ts';
import { benchmarkHref, href } from '../lib/site.ts';
import { setupSortableTables } from './sort-table.ts';
import { fetchIndex, readParams, writeParams } from './index-data.ts';

const VERDICTS: Record<Verdict, { label: string; glyph: string; color: string }> = {
  slower: { label: 'Slower', glyph: '↑', color: 'var(--slower)' },
  faster: { label: 'Faster', glyph: '↓', color: 'var(--faster)' },
  noise: { label: 'Within noise', glyph: '≈', color: 'var(--noise)' },
  added: { label: 'New', glyph: '+', color: 'var(--muted)' },
  removed: { label: 'Gone', glyph: '−', color: 'var(--muted)' },
};

export function setupCompare(): void {
  const form = document.getElementById('compare-form');
  const result = document.getElementById('compare-result');
  const summary = document.getElementById('compare-summary');
  const note = document.getElementById('compare-note');
  const swap = document.getElementById('compare-swap');
  if (!(form instanceof HTMLFormElement) || result === null || summary === null || note === null) {
    return;
  }
  const base = result.dataset.base ?? '/';
  const select = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
  const changesOnly = form.elements.namedItem('changes') as HTMLInputElement;

  // The URL wins over the defaults, as long as it names runs that exist.
  const params = readParams();
  for (const side of ['a', 'b']) {
    const wanted = params.get(side) ?? form.dataset[`default${side.toUpperCase()}`];
    if (wanted && [...select(side).options].some((option) => option.value === wanted)) {
      select(side).value = wanted;
    }
  }
  changesOnly.checked = params.get('changes') === '1';

  fetchIndex(base)
    .then((index) => {
      const render = () => {
        writeParams({
          a: select('a').value,
          b: select('b').value,
          ...(changesOnly.checked ? { changes: '1' } : {}),
        });
        renderComparison(
          index,
          select('a').value,
          select('b').value,
          changesOnly.checked,
          { result, summary, note },
          base,
        );
      };
      form.addEventListener('change', render);
      swap?.addEventListener('click', () => {
        const a = select('a').value;
        select('a').value = select('b').value;
        select('b').value = a;
        render();
      });
      render();
    })
    .catch((error: unknown) => {
      note.textContent = error instanceof Error ? error.message : 'Could not load the results.';
    });
}

function renderComparison(
  index: IndexData,
  baseId: string,
  headId: string,
  changesOnly: boolean,
  targets: { result: HTMLElement; summary: HTMLElement; note: HTMLElement },
  base: string,
): void {
  const runs = new Map(index.runs.map((run) => [run.id, run]));
  const before = runs.get(baseId);
  const after = runs.get(headId);
  targets.result.replaceChildren();
  targets.summary.replaceChildren();
  if (before === undefined || after === undefined) {
    targets.note.textContent = 'Pick two runs.';

    return;
  }

  targets.note.textContent = notes(before, after).join(' ');

  const rows = compare(
    measurements(index, before),
    measurements(index, after),
    index.subjects.map((subject) => subject.key),
  );
  const totals = summariseComparison(rows);
  for (const verdict of ['slower', 'faster', 'noise'] as const) {
    targets.summary.append(tile(VERDICTS[verdict].label, totals[verdict], VERDICTS[verdict].color));
  }
  if (totals.added + totals.removed > 0) {
    targets.summary.append(tile('New or gone', totals.added + totals.removed, 'var(--muted)'));
  }

  const shown = changesOnly ? rows.filter((row) => row.verdict === 'faster' || row.verdict === 'slower') : rows;
  if (shown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-ink-2';
    empty.textContent = 'Nothing changed beyond noise.';
    targets.result.append(empty);

    return;
  }

  targets.result.append(table(index, shown, before, after, base));
  setupSortableTables(targets.result);
}

/** What makes this comparison unusual, said above the table rather than refused. */
function notes(before: IndexedRun, after: IndexedRun): string[] {
  const notes: string[] = [];
  if (before.id === after.id) {
    notes.push('Both sides are the same run.');
  }
  if (before.series === after.series) {
    notes.push(`${seriesLabel(parseSeriesKey(before.series), DRIVER_LABELS)}.`);
  } else {
    notes.push(
      `The runs are from different series (${seriesLabel(parseSeriesKey(before.series), DRIVER_LABELS)} and ${seriesLabel(parseSeriesKey(after.series), DRIVER_LABELS)}), so part of any difference is the setup, not the code.`,
    );
  }
  const versions = [
    before.php !== after.php ? `PHP ${before.php} → ${after.php}` : null,
    before.laravel !== after.laravel ? `Laravel ${before.laravel} → ${after.laravel}` : null,
    before.database !== after.database ? `database ${before.database} → ${after.database}` : null,
  ].filter((version) => version !== null);
  if (versions.length > 0) {
    notes.push(`Versions changed in between: ${versions.join(', ')}.`);
  }

  return notes;
}

function tile(label: string, value: number, color: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card p-3';
  const top = document.createElement('div');
  top.className = 'flex items-center gap-2 text-xs text-ink-2';
  const mark = document.createElement('span');
  mark.className = 'inline-block h-2 w-2 rounded-full';
  mark.style.background = color;
  top.append(mark, label);
  const number = document.createElement('div');
  number.className = 'mt-1 text-2xl font-semibold';
  number.textContent = String(value);
  card.append(top, number);

  return card;
}

function table(
  index: IndexData,
  rows: ComparisonRow[],
  before: IndexedRun,
  after: IndexedRun,
  base: string,
): HTMLElement {
  const subjects = new Map(index.subjects.map((subject) => [subject.key, subject]));
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const element = document.createElement('table');
  element.className = 'data-table';
  element.dataset.sortable = '';

  const head = element.createTHead().insertRow();
  const headers: [string, string, boolean][] = [
    ['Benchmark', 'text', false],
    ['Subject', 'text', false],
    ['Parameters', 'text', false],
    [`Before (${before.ref})`, 'number', true],
    [`After (${after.ref})`, 'number', true],
    ['Change', 'number', true],
    ['Verdict', 'text', false],
  ];
  for (const [label, sort, numeric] of headers) {
    const th = document.createElement('th');
    th.textContent = label;
    th.dataset.sort = sort;
    if (numeric) {
      th.className = 'num';
    }
    head.append(th);
  }

  const body = element.createTBody();
  for (const row of rows) {
    const subject = subjects.get(row.key);
    const tr = body.insertRow();

    const benchmark = tr.insertCell();
    if (subject) {
      const link = document.createElement('a');
      link.className = 'text-ink-2';
      link.href = benchmarkHref(benchmarkSlug(subject.benchmark), base);
      link.textContent = subject.benchmark;
      benchmark.append(link);
    }

    const name = tr.insertCell();
    const code = document.createElement('code');
    code.className = 'font-mono text-[0.8rem]';
    code.textContent = subjectLabel(subject?.subject ?? '');
    name.append(code);

    const set = tr.insertCell();
    set.className = 'text-ink-2';
    set.textContent = setLabel(subject?.set ?? '');

    for (const [run, measurement] of [
      [before, row.base],
      [after, row.head],
    ] as const) {
      const cell = tr.insertCell();
      cell.className = 'num';
      cell.dataset.value = String(measurement?.mode ?? -1);
      if (measurement) {
        const link = document.createElement('a');
        link.href = href(`/runs/${run.id}/`, base);
        link.textContent = formatTime(measurement.mode);
        const deviation = document.createElement('span');
        deviation.className = 'ml-1 text-ink-2';
        deviation.textContent = formatDeviation(measurement.rstdev);
        cell.append(link, deviation);
      } else {
        cell.textContent = '—';
      }
    }

    const change = tr.insertCell();
    change.className = 'num font-medium';
    change.dataset.value = String(row.change ?? 0);
    change.textContent = row.change === null ? '—' : formatChange(row.change);

    const verdict = tr.insertCell();
    verdict.append(badge(row.verdict));
  }

  wrap.append(element);

  return wrap;
}

function badge(verdict: Verdict): HTMLElement {
  const look = VERDICTS[verdict];
  const wrap = document.createElement('span');
  wrap.className = 'inline-flex items-center gap-1.5 whitespace-nowrap';
  const mark = document.createElement('span');
  mark.setAttribute('aria-hidden', 'true');
  mark.className =
    'inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.7rem] leading-none font-bold text-white';
  mark.style.background = look.color;
  mark.textContent = look.glyph;
  const label = document.createElement('span');
  label.textContent = look.label;
  wrap.append(mark, label);

  return wrap;
}
