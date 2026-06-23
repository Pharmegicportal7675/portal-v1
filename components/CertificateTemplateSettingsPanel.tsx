'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ReachCertificateViewer from '@/components/ReachCertificateViewer';
import { getRcTemplatePreviewSample } from '@/lib/certificate-template-preview-data';
import { buildReachHtmlData } from '@/lib/reach-certificate-html-data';
import { buildTccTemplatePreviewHtmlData } from '@/lib/tcc-certificate-html-data';
import {
  Palette,
  Upload,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

type CertificateTemplateSettingsPanelProps = {
  title: string;
  description: string;
  certificateType: 'rc' | 'tcc';
  accentColor: string;
  onAccentColorChange: (value: string) => void;
  footerText: string;
  onFooterTextChange: (value: string) => void;
  logo: string | null;
  signature: string | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => void;
  onClearLogo: () => void;
  onClearSignature: () => void;
  onSave: () => void;
  onReset: () => void;
  isPending: boolean;
};

export function CertificateTemplateSettingsPanel({
  title,
  description,
  certificateType,
  accentColor,
  onAccentColorChange,
  footerText,
  onFooterTextChange,
  logo,
  signature,
  onFileChange,
  onClearLogo,
  onClearSignature,
  onSave,
  onReset,
  isPending,
}: CertificateTemplateSettingsPanelProps) {
  const previewDocxUrl = useMemo(() => {
    if (certificateType === 'rc') {
      return '/api/certificate-template/rc-preview';
    }
    return '';
  }, [certificateType]);

  const rcHtmlData = useMemo(() => {
    if (certificateType !== 'rc') return null;
    const sample = getRcTemplatePreviewSample();
    return buildReachHtmlData(sample.client, sample.chemical, {
      ...sample.options,
      accentColor,
      logoUrl: logo,
      signatureUrl: signature,
      footerText,
    });
  }, [certificateType, accentColor, logo, signature, footerText]);

  const tccHtmlData = useMemo(() => {
    if (certificateType !== 'tcc') return null;
    return buildTccTemplatePreviewHtmlData({
      accentColor,
      logoUrl: logo,
      signatureUrl: signature,
      footerText,
    });
  }, [certificateType, accentColor, logo, signature, footerText]);

  const previewKey =
    certificateType === 'rc'
      ? JSON.stringify(rcHtmlData)
      : certificateType === 'tcc'
        ? JSON.stringify(tccHtmlData)
        : previewDocxUrl;

  return (
    <div className="grid gap-8 grid-cols-1 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-slate-100 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Palette className="h-5 w-5" />
              <CardTitle>{title}</CardTitle>
            </div>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Theme Accent Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => onAccentColorChange(e.target.value)}
                  className="h-10 w-12 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => onAccentColorChange(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                PDF Header Logo
              </label>
              <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-lg p-4 text-center cursor-pointer relative transition-colors bg-slate-50/50">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFileChange(e, 'logo')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center gap-1">
                  <Upload className="h-5 w-5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-600">Upload Header Logo</span>
                  <span className="text-[10px] text-slate-400 font-semibold">Max 2MB (PNG/JPG/SVG)</span>
                </div>
              </div>
              {logo && (
                <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="min-w-0 flex-1 flex items-center justify-center rounded-md border border-slate-200/80 bg-white px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logo}
                      alt="Header logo preview"
                      className="max-h-14 w-full max-w-[220px] object-contain object-center"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClearLogo}
                    className="h-7 shrink-0 text-rose-500 border-rose-100 hover:bg-rose-50 px-2 cursor-pointer"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Compliance Signatory Signature
              </label>
              <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-lg p-4 text-center cursor-pointer relative transition-colors bg-slate-50/50">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFileChange(e, 'signature')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center gap-1">
                  <Upload className="h-5 w-5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-600">Upload Signature File</span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Max 2MB (Transparent PNG recommended)
                  </span>
                </div>
              </div>
              {signature && (
                <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="min-w-0 flex-1 flex items-center justify-center rounded-md border border-slate-200/80 bg-white px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signature}
                      alt="Signature preview"
                      className="max-h-16 w-full max-w-[240px] object-contain object-center"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClearSignature}
                    className="h-7 shrink-0 text-rose-500 border-rose-100 hover:bg-rose-50 px-2 cursor-pointer"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Footer Verification Notice
              </label>
              <textarea
                rows={3}
                value={footerText}
                onChange={(e) => onFooterTextChange(e.target.value)}
                className="w-full text-sm p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-medium text-slate-700"
                placeholder="Pharmegic Healthcare Compliance Registry..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onReset} disabled={isPending}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Reset Defaults
              </Button>
              <Button onClick={onSave} isLoading={isPending} disabled={isPending}>
                Save Template
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse" /> Live Certificate Preview
          </h2>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Same layout as print / PDF
          </span>
        </div>
        <div className="w-full border border-slate-200/80 rounded-xl shadow-xs overflow-hidden bg-white">
          <ReachCertificateViewer
            key={previewKey}
            certificateType={certificateType}
            docxUrl={previewDocxUrl}
            htmlData={certificateType === 'rc' ? rcHtmlData : tccHtmlData}
          />
        </div>
      </div>
    </div>
  );
}
