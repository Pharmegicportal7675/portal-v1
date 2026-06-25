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

/** Match Exporter Information address layout: line1 line2 Dist. line3 */
export function buildEuImporterFullAddress(addr1: string, addr2: string, addr3: string): string {
  const parts = [
    addr1 !== '—' ? addr1 : '',
    addr2 !== '—' ? addr2 : '',
    addr3 !== '—' ? `Dist. ${addr3}` : '',
  ].filter(Boolean);

  return parts.join(' ') || '—';
}
