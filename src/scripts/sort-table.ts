/**
 * Sorting for `table[data-sortable]`: a click (or Enter) on a `th[data-sort]` sorts by that column, again reverses.
 * Numeric columns sort on the cell's `data-value`, the rest on its text.
 */

export function setupSortableTables(root: ParentNode = document): void {
  for (const table of root.querySelectorAll<HTMLTableElement>('table[data-sortable]')) {
    const headers = [...table.querySelectorAll<HTMLTableCellElement>('thead th')];

    headers.forEach((header, column) => {
      if (header.dataset.sort === undefined) {
        return;
      }
      header.tabIndex = 0;
      const sort = () => sortBy(table, headers, column);
      header.addEventListener('click', sort);
      header.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          sort();
        }
      });
    });
  }
}

function sortBy(table: HTMLTableElement, headers: HTMLTableCellElement[], column: number): void {
  const header = headers[column];
  const body = table.tBodies[0];
  if (header === undefined || body === undefined) {
    return;
  }

  const ascending = header.getAttribute('aria-sort') !== 'ascending';
  const numeric = header.dataset.sort === 'number';
  for (const other of headers) {
    other.removeAttribute('aria-sort');
  }
  header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');

  const value = (row: HTMLTableRowElement): string | number => {
    const cell = row.cells[column];
    if (cell === undefined) {
      return '';
    }

    return numeric ? Number(cell.dataset.value ?? Number.NaN) : (cell.textContent ?? '').trim();
  };

  const rows = [...body.rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'en', { numeric: true });

    return ascending ? order : -order;
  });
  body.append(...rows);
}
