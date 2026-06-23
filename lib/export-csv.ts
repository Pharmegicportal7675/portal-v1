export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvContent<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const headerLine = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(String(column.value(row) ?? ''))).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
}

export function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): boolean {
  if (rows.length === 0) return false;
  downloadCsvFile(filename, buildCsvContent(columns, rows));
  return true;
}
