import WizardPageClient from './WizardPageClient';

export const revalidate = 0;

export default async function NewClientPage() {
  return (
    <div className="space-y-6 animate-slide-in">
       <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Onboard New Client</h1>
          <p className="text-sm text-slate-500 font-medium">Create a new company compliance profile, assign contacts, and authorize substances.</p>
       </div>
       <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
           <WizardPageClient />
       </div>
    </div>
  );
}