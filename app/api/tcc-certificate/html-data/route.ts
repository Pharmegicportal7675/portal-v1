import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import {
  loadTccHtmlDataByApplicationId,
  loadTccHtmlDataByCertificateId,
} from '@/lib/tcc-certificate-html-pdf-server';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const certificateId = searchParams.get('certificateId');
  const applicationId = searchParams.get('applicationId');
  const adminSupabase = createAdminClient();

  if (certificateId) {
    const htmlData = await loadTccHtmlDataByCertificateId(adminSupabase, certificateId);
    if (!htmlData) {
      return NextResponse.json({ error: 'TCC certificate not found.' }, { status: 404 });
    }

    const { data: cert } = await adminSupabase
      .from('certificates')
      .select('client_id')
      .eq('id', certificateId)
      .single();

    const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
    const isOwner = session.role === 'CLIENT' && session.clientId === cert?.client_id;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(htmlData);
  }

  if (applicationId) {
    if (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const htmlData = await loadTccHtmlDataByApplicationId(adminSupabase, applicationId);
    return NextResponse.json(htmlData);
  }

  return NextResponse.json(
    { error: 'certificateId or applicationId is required.' },
    { status: 400 }
  );
}
