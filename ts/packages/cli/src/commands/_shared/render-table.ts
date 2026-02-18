const DEFAULT_MAX_COLUMN_WIDTH = 50;

export interface TableColumn<TRow> {
  readonly header: string;
  readonly maxWidth?: number;
  readonly value: (row: TRow) => string;
}

function truncate(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }

  if (maxWidth <= 1) {
    return value.slice(0, maxWidth);
  }

  return `${value.slice(0, maxWidth - 1)}…`;
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

export function renderTable<TRow>(
  rows: ReadonlyArray<TRow>,
  columns: ReadonlyArray<TableColumn<TRow>>
): string {
  if (columns.length === 0) {
    return '';
  }

  const normalizedRows = rows.map(row =>
    columns.map(column => truncate(column.value(row), column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH))
  );

  const columnWidths = columns.map((column, idx) => {
    const rowWidth = normalizedRows.reduce((currentMax, row) => {
      return Math.max(currentMax, row[idx]?.length ?? 0);
    }, 0);

    return Math.max(column.header.length, rowWidth);
  });

  const header = columns.map((column, idx) => pad(column.header, columnWidths[idx])).join('  ');
  const separator = columnWidths.map(width => ''.padEnd(width, '-')).join('  ');
  const body = normalizedRows
    .map(row => row.map((value, idx) => pad(value, columnWidths[idx])).join('  '))
    .join('\n');

  return body.length > 0 ? `${header}\n${separator}\n${body}` : `${header}\n${separator}`;
}
