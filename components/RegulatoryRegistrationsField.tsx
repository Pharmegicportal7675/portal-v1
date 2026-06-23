'use client';

import { FormLabel } from '@/components/ui/FormLabel';
import {
  REGULATORY_REGISTRATION_OPTIONS,
  type RegulatoryRegistration,
} from '@/lib/regulatory-registrations';

type RegulatoryRegistrationsFieldProps = {
  value: RegulatoryRegistration[];
  onChange: (next: RegulatoryRegistration[]) => void;
  error?: string | null;
};

export default function RegulatoryRegistrationsField({
  value,
  onChange,
  error,
}: RegulatoryRegistrationsFieldProps) {
  const toggle = (registration: RegulatoryRegistration) => {
    if (value.includes(registration)) {
      onChange(value.filter((item) => item !== registration));
      return;
    }
    onChange([...value, registration]);
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-900">Regulatory Registration&apos;s</h3>
        <p className="text-xs text-slate-500">
          Select all regulatory frameworks this client is registered for. At least one is required.
        </p>
      </div>

      <div className="space-y-3">
        <FormLabel required>Regulatory frameworks</FormLabel>
        <div className="grid gap-3 sm:grid-cols-1">
          {REGULATORY_REGISTRATION_OPTIONS.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                  checked
                    ? 'border-primary bg-emerald-50/40'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option.value)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-semibold text-slate-800">{option.label}</span>
              </label>
            );
          })}
        </div>
        {error ? <p className="text-xs text-rose-600 font-semibold">{error}</p> : null}
      </div>
    </section>
  );
}
