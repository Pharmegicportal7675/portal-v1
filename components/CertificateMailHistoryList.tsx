import { formatDisplayDateTime } from '@/lib/date-filter';

type CertificateMailHistoryListProps = {
  timestamps: string[];
};

export function CertificateMailHistoryList({ timestamps }: CertificateMailHistoryListProps) {
  if (timestamps.length === 0) return null;

  return (
    <div className="pt-1 border-t border-blue-100 mt-2">
      <p className="mb-1">
        <strong>Mail sent:</strong>
      </p>
      <ol className="list-decimal list-inside space-y-0.5">
        {timestamps.map((timestamp, index) => (
          <li key={`${timestamp}-${index}`} suppressHydrationWarning>
            {formatDisplayDateTime(timestamp)}
          </li>
        ))}
      </ol>
    </div>
  );
}
