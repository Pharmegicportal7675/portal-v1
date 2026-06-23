'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { downloadExcelFromBase64 } from '@/lib/export-excel';
import { exportClientsDirectoryAction } from '@/actions/clients-export';
import { toast } from '@/store/toast';
import { Download } from 'lucide-react';

type ClientDirectoryExportProps = {
  filteredClientIds: string[];
  selectedClientIds: string[];
};

export function ClientDirectoryExport({
  filteredClientIds,
  selectedClientIds,
}: ClientDirectoryExportProps) {
  const [isPending, startTransition] = useTransition();
  const [exportingMode, setExportingMode] = useState<'selected' | 'all' | null>(null);

  const handleExport = (mode: 'selected' | 'all') => {
    const clientIds = mode === 'selected' ? selectedClientIds : filteredClientIds;
    if (clientIds.length === 0) {
      toast.error('No clients to export.');
      return;
    }

    setExportingMode(mode);
    startTransition(async () => {
      const result = await exportClientsDirectoryAction(clientIds);
      setExportingMode(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      downloadExcelFromBase64(result.filename, result.base64);
      toast.success(`Exported ${result.count} client(s) to Excel.`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedClientIds.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={isPending}
          isLoading={isPending && exportingMode === 'selected'}
          onClick={() => handleExport('selected')}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export Selected ({selectedClientIds.length})
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={isPending || filteredClientIds.length === 0}
        isLoading={isPending && exportingMode === 'all'}
        onClick={() => handleExport('all')}
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Export All ({filteredClientIds.length})
      </Button>
    </div>
  );
}
