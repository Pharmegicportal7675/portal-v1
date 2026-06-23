'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createMasterAdminAction,
  toggleMasterAdminAction,
  removeMasterAdminAction,
  resetMasterAdminPasswordAction,
} from '@/actions/super';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { ResponsiveTableScroll } from '@/components/ui/ResponsiveTableScroll';
import { toast } from '@/store/toast';
import {
  Shield, UserPlus, Mail, Lock, Power, PowerOff, Trash2, RefreshCw, Crown, AlertTriangle
} from 'lucide-react';

interface MasterAdmin {
  id: string;
  email: string;
  is_disabled: boolean;
  created_at: string;
}

interface SuperAdminDashboardProps {
  initialAdmins: MasterAdmin[];
}

export default function SuperAdminDashboard({ initialAdmins }: SuperAdminDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [admins, setAdmins] = useState<MasterAdmin[]>(initialAdmins);

  useEffect(() => setAdmins(initialAdmins), [initialAdmins]);

  // Create admin dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Reset password dialog
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<MasterAdmin | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Delete confirmation
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MasterAdmin | null>(null);

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createMasterAdminAction(newAdminEmail, newAdminPassword);
      if (res.success) {
        toast.success(res.message || 'Master Admin created.');
        setIsCreateOpen(false);
        setNewAdminEmail('');
        setNewAdminPassword('');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to create admin.');
      }
    });
  };

  const handleToggle = (admin: MasterAdmin) => {
    startTransition(async () => {
      const res = await toggleMasterAdminAction(admin.id, !admin.is_disabled);
      if (res.success) {
        toast.success(res.message || 'Status updated.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update status.');
      }
    });
  };

  const handleResetPassword = () => {
    if (!resetTarget) return;
    startTransition(async () => {
      const res = await resetMasterAdminPasswordAction(resetTarget.id, newPassword);
      if (res.success) {
        toast.success(res.message || 'Password reset.');
        setIsResetOpen(false);
        setNewPassword('');
        setResetTarget(null);
      } else {
        toast.error(res.error || 'Failed to reset password.');
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await removeMasterAdminAction(deleteTarget.id);
      if (res.success) {
        toast.success(res.message || 'Admin removed.');
        setIsDeleteOpen(false);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to remove admin.');
      }
    });
  };

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber-500" /> Super Admin Panel
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Create and manage Master Administrator accounts. Super Admin exclusive.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add Master Admin
        </Button>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800">Super Admin Access Only</p>
          <p className="text-xs text-amber-700 font-medium mt-0.5">
            This panel is exclusively for Super Administrators. Actions here are logged and cannot be undone by Master Admins.
          </p>
        </div>
      </div>

      {/* Admin Table */}
      <Card className="border-slate-100 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <CardTitle>Master Administrators</CardTitle>
          </div>
          <CardDescription>
            {admins.length} administrator{admins.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ResponsiveTableScroll>
            <table className="w-full text-left border-collapse min-w-[720px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">
                      No Master Admins configured yet. Create one above.
                    </td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                            <Shield className="h-4 w-4" />
                          </div>
                          <span className="font-semibold text-slate-800 text-sm">{admin.email}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={admin.is_disabled ? 'danger' : 'success'}>
                          {admin.is_disabled ? 'Disabled' : 'Active'}
                        </Badge>
                      </td>
                      <td className="p-4 text-xs text-slate-500 font-medium">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResetTarget(admin);
                              setIsResetOpen(true);
                            }}
                            disabled={isPending}
                            className="h-8 gap-1 text-slate-600"
                          >
                            <Lock className="h-3.5 w-3.5" /> Reset Pass
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggle(admin)}
                            disabled={isPending}
                            className={`h-8 gap-1 ${admin.is_disabled ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}`}
                          >
                            {admin.is_disabled ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                            {admin.is_disabled ? 'Enable' : 'Disable'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteTarget(admin);
                              setIsDeleteOpen(true);
                            }}
                            disabled={isPending}
                            className="h-8 gap-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        </CardContent>
      </Card>

      {/* Create Admin Dialog */}
      <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Master Administrator">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            This will create a new Master Admin account. Set the credentials below.
          </p>
          <Input
            type="email"
            label="Email Address"
            placeholder="directoratulpatoliya@gmail.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
          />
          <Input
            type="password"
            label="Password"
            placeholder="••••••••"
            value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={isPending} disabled={isPending} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Create Master Admin
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog isOpen={isResetOpen} onClose={() => setIsResetOpen(false)} title="Reset Admin Password">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Reset password for <strong>{resetTarget?.email}</strong>.
          </p>
          <Input
            type="password"
            label="New Password"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsResetOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleResetPassword} isLoading={isPending} disabled={isPending}>
              Reset Password
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Remove Master Admin">
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium">
            Are you sure you want to permanently remove <strong>{deleteTarget?.email}</strong>? This cannot be undone.
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isPending}>Cancel</Button>
            <Button
              onClick={handleDelete}
              isLoading={isPending}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove Permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
