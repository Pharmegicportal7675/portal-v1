const E164_MAX_DIGITS = 15;
const E164_MIN_DIGITS = 10;

function getCountryCodeLength(digits: string): number {
  if (digits.startsWith('1')) return 1;
  return 2;
}

/** Format mobile input as +91 123 456 7890 — digits and leading + only. */
export function formatMobileNumberInput(raw: string): string {
  if (!raw.trim()) return '';

  const digitsOnly = raw.replace(/\D/g, '').slice(0, E164_MAX_DIGITS);
  if (!digitsOnly) {
    return raw.includes('+') ? '+' : '';
  }

  const countryLen = getCountryCodeLength(digitsOnly);
  const country = digitsOnly.slice(0, countryLen);
  const rest = digitsOnly.slice(countryLen);
  const groups = rest.match(/.{1,3}/g) || [];

  return '+' + country + (groups.length ? ' ' + groups.join(' ') : '');
}

export function isValidMobileNumber(value: string): boolean {
  if (!value.startsWith('+')) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= E164_MIN_DIGITS && digits.length <= E164_MAX_DIGITS;
}

export function getMobileNumberError(value: string, required = false): string | undefined {
  if (!value.trim()) {
    return required ? 'Mobile number is required' : undefined;
  }
  if (!isValidMobileNumber(value)) {
    return 'Enter a valid mobile number (e.g. +91 123 456 7890)';
  }
  return undefined;
}
