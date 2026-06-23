export function splitEuImporterAddress(address: string): {
  addr1: string;
  addr2: string;
  addr3: string;
} {
  const parts = address
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    addr1: parts[0] || '—',
    addr2: parts[1] || '—',
    addr3: parts.slice(2).join(', ') || '—',
  };
}
