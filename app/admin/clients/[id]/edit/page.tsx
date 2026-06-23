import { createAdminClient } from '@/lib/db/admin';
import { redirect } from 'next/navigation';
import EditClientClient from './EditClientClient';

export const revalidate = 0;

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: client, error: clientError }, { data: contacts }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase
      .from('client_contacts')
      .select('first_name, last_name, email, phone, role')
      .eq('client_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (clientError || !client) {
    redirect('/admin/clients');
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
          Edit Client: {client.company_name}
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Update company profile, contact details, and address — same layout as new client registration.
        </p>
      </div>
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <EditClientClient client={client} contacts={contacts || []} />
      </div>
    </div>
  );
}
