'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/store/toast';
import { Mail } from 'lucide-react';
import RcCertificatesTable, { type RcCertificateTableRecord } from '@/components/RcCertificatesTable';
import type { AppRole } from '@/lib/auth/roles';

export type RcCertificateListRow = RcCertificateTableRecord;

interface RcCertificatesDashboardProps {
  initialCertificates: RcCertificateListRow[];
  clientChemicals?: any[];
  currentUserRole: AppRole;
  tccHistory?: any[];
}

type DeleteTarget =
  | {
      kind: 'issued';
      id: string;
      clientId: string;
      certificate_number: string;
      chemical_name: string;
    }
  | {
      kind: 'pending';
      clientId: string;
      chemicalId: string;
      chemical_name: string;
    };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(response.status === 404 ? 'Service not found. Redeploy the app and try again.' : 'Request failed.');
  }
}

export default function RcCertificatesDashboard({
  initialCertificates,
  clientChemicals = [],
  currentUserRole,
  tccHistory,
}: RcCertificatesDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [certificates] = useState(initialCertificates);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [, setFilteredRows] = useState<RcCertificateListRow[]>(initialCertificates);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const selectedByClient = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const id of selectedIds) {
      const cert = certificates.find((row) => row.id === id);
      if (!cert?.client_id) continue;
      const list = map.get(cert.client_id) || [];
      list.push(id);
      map.set(cert.client_id, list);
    }
    return map;
  }, [selectedIds, certificates]);

  const handleBulkSendMail = () => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one RC certificate.');
      return;
    }

    if (selectedByClient.size > 1) {
      toast.error('Select certificates from one client only for bulk email send.');
      return;
    }

    const [[clientId, certIds]] = selectedByClient.entries();
    startTransition(async () => {
      const res = await postJson<{ success: boolean; message?: string; error?: string }>(
        '/api/reach/certificates/bulk-email',
        { clientId, certificateIds: certIds }
      );
      if (res.success) {
        toast.success(res.message || 'RC certificates sent successfully.');
        setSelectedIds([]);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to send RC certificates.');
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res =
        deleteTarget.kind === 'issued'
          ? await postJson<{ success: boolean; message?: string; error?: string }>(
              '/api/reach/certificates/delete',
              { certificateId: deleteTarget.id, clientId: deleteTarget.clientId }
            )
          : await postJson<{ success: boolean; message?: string; error?: string }>(
              '/api/client-chemicals/remove',
              { clientId: deleteTarget.clientId, chemicalId: deleteTarget.chemicalId }
            );

      if (res.success) {
        toast.success(res.message || 'Removed successfully.');
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to remove.');
      }
    });
  };

  const extraActions = useMemo(() => {
    if (selectedIds.length > 0 && selectedByClient.size === 1) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-teal-200 text-teal-800 hover:bg-teal-50"
          onClick={handleBulkSendMail}
          disabled={isPending}
          isLoading={isPending}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          Send Mail ({selectedIds.length})
        </Button>
      );
    }
    return null;
  }, [selectedIds, selectedByClient, isPending]);

  return (
    <div className="space-y-6">
      <RcCertificatesTable
        certificates={certificates}
        clientChemicals={clientChemicals}
        currentUserRole={currentUserRole}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onFilteredRowsChange={setFilteredRows as any}
        tccHistory={tccHistory}
        title="RC Compliance Certificates (Year-wise)"
        description="Manage issue/expiry dates & remaining quota per year | Expired certificates retain quantity for TCC applications using old date."
        extraActions={extraActions}
        exportFilename="rc-certificates"
        onEdit={(cc, certId) => {
          const targetClientId = cc.client_id;
          const targetChemicalId = cc.chemical_id;
          if (!targetClientId || !targetChemicalId) {
            router.push(`/admin/clients/${targetClientId || ''}`);
            return;
          }
          const query = certId ? `?certId=${certId}` : '';
          router.push(`/admin/clients/${targetClientId}/rc-preview/${targetChemicalId}${query}`);
        }}
        onRenew={(cc) => {
          router.push(`/admin/clients/${cc.client_id}`);
        }}
        onDelete={(cert) => {
          const isPending = !cert.id;
          if (isPending) {
            if (!cert.chemical_id || !cert.client_id) {
              toast.error('Cannot remove this substance assignment.');
              return;
            }
            setDeleteTarget({
              kind: 'pending',
              clientId: cert.client_id,
              chemicalId: cert.chemical_id,
              chemical_name: cert.chemical_name || 'Unknown substance',
            });
            return;
          }

          if (!cert.client_id) {
            toast.error('Cannot delete this certificate.');
            return;
          }

          setDeleteTarget({
            kind: 'issued',
            id: cert.id,
            clientId: cert.client_id,
            certificate_number: cert.certificate_number,
            chemical_name:
              (cert.chemicals || cert.chemical)?.chemical_name ||
              cert.chemical_name ||
              'Unknown substance',
          });
        }}
      />

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.kind === 'pending' ? 'Remove Assigned Substance' : 'Delete RC Certificate'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {deleteTarget?.kind === 'pending' ? (
              <>
                Remove assigned substance <strong>{deleteTarget.chemical_name}</strong> from this client?
                The pending RC certificate row will be removed.
              </>
            ) : (
              <>
                Permanently delete RC Certificate{' '}
                <strong className="font-mono text-slate-800">{deleteTarget?.certificate_number}</strong> for{' '}
                <strong>{deleteTarget?.chemical_name}</strong>? It will be removed from the database and storage —
                this cannot be undone.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              isLoading={isPending}
              disabled={isPending}
            >
              {deleteTarget?.kind === 'pending' ? 'Remove Substance' : 'Delete Certificate'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
