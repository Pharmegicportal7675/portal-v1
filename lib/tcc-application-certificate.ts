type TccCertificateRow = {
  certificate_number?: string | null;
  issued_at?: string | null;
};

type TccApplicationCertificateInput = {
  status: string;
  updated_at?: string | null;
  certificate_issue_date?: string | null;
  certificates?: TccCertificateRow | TccCertificateRow[] | null;
};

export function resolveTccCertificateRow(
  app: TccApplicationCertificateInput
): TccCertificateRow | null {
  const cert = app.certificates;
  if (!cert) return null;
  if (Array.isArray(cert)) return cert[0] ?? null;
  return cert;
}

/** Issue date: issued certificate → stored issue date → approval timestamp. */
export function resolveTccApplicationIssueDate(app: TccApplicationCertificateInput): string | null {
  const cert = resolveTccCertificateRow(app);
  if (cert?.issued_at) return cert.issued_at;

  if (app.certificate_issue_date) {
    const raw = String(app.certificate_issue_date).split('T')[0];
    return `${raw}T12:00:00.000Z`;
  }

  if (app.status === 'approved' && app.updated_at) {
    return app.updated_at;
  }

  return null;
}

export function resolveTccApplicationCertificateNumber(
  app: TccApplicationCertificateInput
): string | null {
  const number = resolveTccCertificateRow(app)?.certificate_number?.trim();
  return number || null;
}
