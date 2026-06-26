export function extractDbErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && typeof (err as { message?: string }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '';
}

export function extractDbErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && typeof (err as { code?: string }).code === 'string') {
    return (err as { code: string }).code;
  }
  return null;
}

export function isUniqueConstraintError(err: unknown): boolean {
  const code = extractDbErrorCode(err);
  if (code === 'P2002' || code === '23505') return true;
  const message = extractDbErrorMessage(err).toLowerCase();
  return (
    message.includes('unique constraint failed') ||
    message.includes('duplicate entry') ||
    message.includes('(p2002)')
  );
}

function detectUniqueField(message: string, details?: string): string | null {
  const combined = `${message} ${details ?? ''}`.toLowerCase();
  if (
    combined.includes('email') &&
    (combined.includes('`email`') ||
      combined.includes('fields: (`email`)') ||
      combined.includes('constraint: `email`') ||
      combined.includes('target: email'))
  ) {
    return 'email';
  }
  const lower = message.toLowerCase();
  if (lower.includes('uuid_number')) return 'uuid_number';
  if (lower.includes('cas_number')) return 'cas_number';
  if (lower.includes('certificate_number')) return 'certificate_number';
  if (lower.includes('tracking_id')) return 'tracking_id';
  return null;
}

export function formatFriendlyUniqueConstraintError(err: unknown): string | null {
  if (!isUniqueConstraintError(err)) return null;

  const message = extractDbErrorMessage(err);
  const details =
    err && typeof err === 'object' && typeof (err as { details?: string }).details === 'string'
      ? (err as { details: string }).details
      : undefined;
  const field = detectUniqueField(message, details);

  switch (field) {
    case 'email':
      return 'This email address is already registered. Use a different login email, or update the existing client or admin account that uses it.';
    case 'uuid_number':
      return 'This UUID / company reference number is already assigned to another client.';
    case 'cas_number':
      return 'A substance with this CAS number already exists in the registry.';
    case 'certificate_number':
      return 'This certificate number is already in use.';
    case 'tracking_id':
      return 'This TCC tracking ID is already in use.';
    default:
      return 'A record with the same unique value already exists. Please check for duplicates and try again.';
  }
}

export function formatUserEmailConflictMessage(role: string | null | undefined): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'This email belongs to a Super Admin account. Use a different email for the client login.';
    case 'MASTER_ADMIN':
      return 'This email belongs to a Master Admin account. Use a different email for the client login.';
    case 'CLIENT':
      return 'This email is already used for another client portal login. Use a different email or open that client profile to update it.';
    default:
      return 'This email is already registered in the system. Use a different email address.';
  }
}
