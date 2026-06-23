export function canClientEditTccApplication(status: string): boolean {
  return status !== 'approved';
}
