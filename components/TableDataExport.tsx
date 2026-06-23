'use client';

import { Button } from '@/components/ui/Button';
import { exportRowsToCsv, type CsvColumn } from '@/lib/export-csv';
import { toast } from '@/store/toast';
import { Download } from 'lucide-react';

type TableDataExportProps<T> = {
  filename: string;
  columns: CsvColumn<T>[];
  filteredRows: T[];
  selectedIds: string[];
  getRowId: (row: T) => string;
};

export function TableDataExport<T>({
  filename,
  columns,
  filteredRows,
  selectedIds,
  getRowId,
}: TableDataExportProps<T>) {
  const selectedRows = filteredRows.filter((row) => selectedIds.includes(getRowId(row)));

  const handleExport = (rows: T[], suffix: string) => {
    if (!exportRowsToCsv(`${filename}-${suffix}`, columns, rows)) {
      toast.error('No data to export.');
      return;
    }
    toast.success(`Exported ${rows.length} row(s) to CSV.`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedIds.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => handleExport(selectedRows, 'selected')}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export Selected ({selectedIds.length})
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => handleExport(filteredRows, 'filtered')}
        disabled={filteredRows.length === 0}
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Export All ({filteredRows.length})
      </Button>
    </div>
  );
}
