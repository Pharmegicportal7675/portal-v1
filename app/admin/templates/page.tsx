import { redirect } from 'next/navigation';

/** Legacy route — template branding lives under Settings now. */
export default function TemplatesPage() {
  redirect('/admin/settings');
}
