'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { ResponsiveTableScroll } from './ui/ResponsiveTableScroll';
import {
  Award,
  Search,
  Download,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  FlaskConical
} from 'lucide-react';
import {
  buildReachCertificateDocxPreviewUrl,
  buildReachCertificatePdfDownloadUrl,
} from '@/lib/reach-certificate-download';
import {
  buildTccCertificatePdfDownloadUrl,
} from '@/lib/tcc-certificate-download';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { formatDisplayDate } from '@/lib/date-filter';
import { resolveDisplayedTonnageBand } from '@/lib/quota';

interface Certificate {
  id: string;
  certificate_number: string;
  type: string | null;
  file_url: string;
  issued_at: string;
  expires_at: string | null;
  status: 'active' | 'expired' | 'revoked';
  tonnage_band?: string | null;
  chemicals?: {
    chemical_name: string;
    cas_number: string;
    tonnage_band?: string | null;
  } | null;
  tcc_applications?: {
    quantity_mt: number;
    chemicals: {
      chemical_name: string;
      cas_number: string;
    };
  } | null;
}

interface CertificatesListProps {
  initialCertificates: Certificate[];
}

export default function CertificatesList({ initialCertificates }: CertificatesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredCertificates = initialCertificates.filter((cert) => {
    const chemName =
      cert.chemicals?.chemical_name ||
      cert.tcc_applications?.chemicals?.chemical_name ||
      '';
    const cas =
      cert.chemicals?.cas_number ||
      cert.tcc_applications?.chemicals?.cas_number ||
      '';

    const matchesSearch =
      cert.certificate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cas.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || cert.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="success" className="flex items-center gap-1 w-fit">
            <ShieldCheck className="h-3 w-3" /> Valid
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="warning" className="flex items-center gap-1 w-fit">
            <ShieldAlert className="h-3 w-3" /> Expired
          </Badge>
        );
      case 'revoked':
        return (
          <Badge variant="danger" className="flex items-center gap-1 w-fit">
            <ShieldAlert className="h-3 w-3" /> Revoked
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Compliance Certificates</h1>
        <p className="text-sm text-slate-500 font-medium">
          Search and download REACH Compliance Certificates and Tonnage Compliance Certificates (TCC) issued to your organization.
        </p>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-100 shadow-xs">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by certificate number, substance, CAS number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all"
            />
          </div>
          <div className="w-full md:w-48">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Certificates' },
                { value: 'active', label: 'Valid Only' },
                { value: 'expired', label: 'Expired Only' },
                { value: 'revoked', label: 'Revoked Only' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table Card */}
      <Card className="border-slate-100 overflow-hidden">
        <ResponsiveTableScroll>
          <table className="w-full text-left border-collapse min-w-[960px] text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Certificate Number</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Substance</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Authorized Weight</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Issuance Date</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Validity Expiry</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                    No issued certificates match your search query.
                  </td>
                </tr>
              ) : (
                filteredCertificates.map((cert) => {
                  const chemName =
                    cert.chemicals?.chemical_name ||
                    cert.tcc_applications?.chemicals?.chemical_name ||
                    'Substance registry deletion';
                  const casNumber =
                    cert.chemicals?.cas_number ||
                    cert.tcc_applications?.chemicals?.cas_number ||
                    'N/A';
                  const isReach = cert.type === 'REACH';
                  const authorizedWeight = isReach
                    ? resolveDisplayedTonnageBand(cert.tonnage_band, cert.chemicals?.tonnage_band, '') || '—'
                    : `${cert.tcc_applications?.quantity_mt ?? '—'} MT`;

                  return (
                  <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <Badge variant={isReach ? 'info' : 'success'} className="text-[10px] uppercase font-bold">
                        {isReach ? 'REACH' : 'TCC'}
                      </Badge>
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>{cert.certificate_number}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <FlaskConical className="h-4 w-4 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-700">{chemName}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            CAS No: {casNumber}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-extrabold text-slate-800">
                      {authorizedWeight}
                    </td>
                    <td className="p-4 text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span suppressHydrationWarning>{formatDisplayDate(cert.issued_at)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span suppressHydrationWarning>
                          {cert.expires_at ? formatDisplayDate(cert.expires_at) : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">{getStatusBadge(cert.status)}</td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <CertificatePdfDownloadLink
                          pdfUrl={
                            cert.type === 'TCC'
                              ? buildTccCertificatePdfDownloadUrl(cert.id)
                              : buildReachCertificatePdfDownloadUrl(cert.id)
                          }
                          docxUrl={
                            cert.type === 'TCC'
                              ? ''
                              : buildReachCertificateDocxPreviewUrl(cert.id)
                          }
                          fileName={`${cert.certificate_number}.pdf`}
                          certificateType={cert.type === 'TCC' ? 'tcc' : 'rc'}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-primary hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/50 rounded-lg transition-colors border border-emerald-100 disabled:opacity-60"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </CertificatePdfDownloadLink>
                        <a
                          href={`/verify/${cert.certificate_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          title="Verify Certificate"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </Card>
    </div>
  );
}
