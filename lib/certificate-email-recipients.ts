export function parseEmailList(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  return emails.filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CertificateMailRecipients = {
  to: string;
  cc: string[];
};

/** Build TO/CC for certificate emails — no BCC. */
export function buildCertificateRecipients(params: {
  primaryEmail: string;
  contactEmails?: string[];
  /** Default CC from TCC/RC SMTP settings tab */
  defaultCcEmails?: string | null;
  /** From address on the SMTP account (also CC'd on the email) */
  senderEmail?: string | null;
}): CertificateMailRecipients {
  const to = params.primaryEmail.trim();
  const toKey = to.toLowerCase();

  const cc = uniqueEmails([
    ...(params.contactEmails || []).filter(Boolean),
    ...parseEmailList(params.defaultCcEmails),
    ...(params.senderEmail?.trim() ? [params.senderEmail.trim()] : []),
  ]).filter((email) => email.toLowerCase() !== toKey);

  return { to, cc };
}
