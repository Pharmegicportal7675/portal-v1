import { createAdminClient } from '@/lib/supabase/admin';
import { Shield, CheckCircle2, XCircle, AlertTriangle, Building, FlaskConical, Calendar, Hash, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 60;

interface VerifyPageProps {
  params: Promise<{ certNumber: string }>;
}

export default async function VerifyCertificatePage({ params }: VerifyPageProps) {
  const { certNumber } = await params;
  const adminSupabase = createAdminClient();

  const { data: cert } = await adminSupabase
    .from('certificates')
    .select(`
      id,
      certificate_number,
      type,
      issued_at,
      expires_at,
      status,
      clients (company_name, country),
      chemicals (chemical_name, cas_number, ec_number, tonnage_band),
      tcc_applications!certificates_tcc_application_id_fkey (
        quantity_mt,
        chemicals (chemical_name, cas_number, ec_number, tonnage_band)
      )
    `)
    .eq('certificate_number', decodeURIComponent(certNumber))
    .maybeSingle();

  const now = new Date();
  const isExpired = cert?.expires_at ? new Date(cert.expires_at) < now : false;
  const verificationStatus = !cert ? 'invalid' : isExpired ? 'expired' : cert.status === 'revoked' ? 'revoked' : 'valid';

  const isReach = cert?.type === 'REACH';
  const chemicalInfo =
    (cert?.chemicals as { chemical_name?: string; cas_number?: string; ec_number?: string; tonnage_band?: string } | null) ||
    (cert?.tcc_applications as { quantity_mt?: number; chemicals?: { chemical_name?: string; cas_number?: string; ec_number?: string } } | null)?.chemicals;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2.5 bg-white border border-slate-200 rounded-full px-5 py-2.5 shadow-sm mb-6">
          <Shield className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-bold text-slate-700">Pharmegic Healthcare — Certificate Verification Portal</span>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        {/* Status Banner */}
        <div className={`rounded-2xl p-6 mb-6 text-center ${
          verificationStatus === 'valid' ? 'bg-emerald-600' :
          verificationStatus === 'expired' ? 'bg-amber-500' :
          'bg-rose-600'
        }`}>
          <div className="flex flex-col items-center gap-3">
            {verificationStatus === 'valid' ? (
              <CheckCircle2 className="h-12 w-12 text-white" />
            ) : verificationStatus === 'expired' ? (
              <AlertTriangle className="h-12 w-12 text-white" />
            ) : (
              <XCircle className="h-12 w-12 text-white" />
            )}
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {verificationStatus === 'valid'
                  ? isReach
                    ? 'REACH Certificate Valid & Active'
                    : 'Certificate Valid & Active'
                  : verificationStatus === 'expired'
                    ? 'Certificate Expired'
                    : verificationStatus === 'revoked'
                      ? 'Certificate Revoked'
                      : 'Certificate Not Found'}
              </h1>
              <p className="text-white/80 text-sm font-medium mt-1">
                {verificationStatus === 'valid'
                  ? isReach
                    ? 'This REACH Compliance Certificate is authentic and currently valid (1-year validity).'
                    : 'This Tonnage Compliance Certificate is authentic and currently valid.'
                  : verificationStatus === 'expired'
                    ? 'This certificate was valid but has passed its expiry date.'
                    : verificationStatus === 'revoked'
                      ? 'This certificate has been revoked by the issuing authority.'
                      : 'No certificate matching this number exists in the registry.'}
              </p>
            </div>
          </div>
        </div>

        {/* Certificate Details */}
        {cert ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Certificate Number */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Certificate Number</span>
              </div>
              <span className="font-mono font-black text-slate-800 text-lg">{cert.certificate_number}</span>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Company */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Building className="h-3.5 w-3.5" /> Certificate Holder
                </div>
                <p className="font-bold text-slate-800 text-base">{(cert.clients as any)?.company_name}</p>
                {(cert.clients as any)?.country && (
                  <p className="text-xs text-slate-500 font-medium">{(cert.clients as any).country}</p>
                )}

              </div>

              {/* Chemical */}
              {chemicalInfo && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <FlaskConical className="h-3.5 w-3.5" /> Substance Details
                  </div>
                  <p className="font-bold text-slate-800">{chemicalInfo.chemical_name}</p>
                  <p className="text-xs text-slate-500 font-medium font-mono">
                    CAS: {chemicalInfo.cas_number}
                    {chemicalInfo.ec_number && ` • EC: ${chemicalInfo.ec_number}`}
                  </p>
                  {!isReach && (() => {
                    const tccApp = Array.isArray(cert?.tcc_applications)
                      ? cert.tcc_applications[0]
                      : cert?.tcc_applications;
                    if (tccApp?.quantity_mt == null) return null;
                    return (
                      <p className="text-sm font-bold text-slate-700 mt-1">
                        {tccApp.quantity_mt} Metric Tons (MT)
                      </p>
                    );
                  })()}
                  {isReach && (
                    <p className="text-xs font-semibold text-emerald-700 mt-1">REACH Compliance — 1 Year Validity</p>
                  )}
                </div>
              )}


              {/* Validity */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Calendar className="h-3.5 w-3.5" /> Validity Period
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Issued: <span className="font-bold text-slate-800" suppressHydrationWarning>{new Date(cert.issued_at).toLocaleDateString()}</span>
                </p>
                <p className={`text-sm font-semibold ${isExpired ? 'text-rose-600' : 'text-slate-700'}`}>
                  Expires:{' '}
                  <span className="font-bold">
                    <span suppressHydrationWarning>{cert.expires_at ? new Date(cert.expires_at).toLocaleDateString() : 'N/A'}</span>
                    {isExpired && ' (Expired)'}
                  </span>
                </p>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status</div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                  verificationStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  verificationStatus === 'expired' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {verificationStatus === 'valid' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {verificationStatus.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-slate-500 font-medium text-sm">
              No certificate with number <span className="font-mono font-bold text-slate-800">{certNumber}</span> was found in the registry.
            </p>
            <p className="text-xs text-slate-400 font-medium mt-2">
              Please check the certificate number and try again, or contact the issuing authority.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-slate-400 font-medium">
            Issued by Pharmegic Healthcare Compliance Division
          </p>
          <Link href="/login" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors">
            <ExternalLink className="h-3 w-3" /> Portal Login
          </Link>
        </div>
      </div>
    </div>
  );
}
