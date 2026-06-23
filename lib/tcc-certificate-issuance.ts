import type { DbClient } from '@/lib/db/types';
import { buildTccCertificateStoredFile } from '@/lib/tcc-pdf-data';
import { resolveTccPdfChemicalTonnageBand } from '@/lib/tcc-certificate-pdf';
import type { TccPdfChemical } from '@/lib/tcc-certificate-html-data';
import { generateUniqueTccCertificateNumber } from '@/lib/tcc-certificate-number';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';

type TccIssuanceApplication = {
  id: string;
  client_id: string;
  chemical_id: string;
  export_date?: string | null;
  reach_certificate_id?: string | null;
  tracking_id?: string | null;
  clients: Record<string, unknown> | Record<string, unknown>[];
  chemicals: Record<string, unknown> | Record<string, unknown>[];
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T {
  if (Array.isArray(value)) {
    const row = value[0];
    if (!row) throw new Error('Missing related certificate record.');
    return row;
  }
  if (!value) throw new Error('Missing related certificate record.');
  return value;
}

function normalizeIssuanceApplication(
  application: TccIssuanceApplication & Record<string, unknown>
): TccIssuanceApplication & Record<string, unknown> {
  return {
    ...application,
    clients: unwrapRelation(application.clients),
    chemicals: unwrapRelation(application.chemicals),
  };
}

type UpsertTccCertificateResult = {
  certId: string;
  certNumber: string;
  created: boolean;
};

function parseIssueDateIso(issueDateIso: string): { issueDate: Date; issueDateRaw: string } {
  const issueDateRaw = issueDateIso.split('T')[0];
  const issueDate = new Date(`${issueDateRaw}T12:00:00`);
  return { issueDate, issueDateRaw };
}

export async function upsertTccCertificateForApplication(
  supabase: DbClient,
  params: {
    application: TccIssuanceApplication & Record<string, unknown>;
    issueDateIso: string;
    registrationNumber?: string | null;
  }
): Promise<UpsertTccCertificateResult> {
  const { application: rawApplication, issueDateIso, registrationNumber } = params;
  const application = normalizeIssuanceApplication(rawApplication);
  const { issueDate, issueDateRaw } = parseIssueDateIso(issueDateIso);
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  const { data: existingCert } = await supabase
    .from('certificates')
    .select('id, certificate_number')
    .eq('tcc_application_id', application.id)
    .eq('type', 'TCC')
    .maybeSingle();

  const certNumber =
    existingCert?.certificate_number?.trim() ||
    (await generateUniqueTccCertificateNumber(supabase));

  const chemical = await resolveTccPdfChemicalTonnageBand(supabase, {
    clientId: application.client_id,
    chemicalId: application.chemical_id,
    exportDate: application.export_date,
    reachCertificateId: application.reach_certificate_id,
    chemical: application.chemicals as TccPdfChemical,
  });

  const certFile = await buildTccCertificateStoredFile({
    certNumber,
    client: application.clients as never,
    chemical,
    application: application as never,
    registrationNumber: registrationNumber ?? null,
    validUntilDate: expiryDate.toISOString().split('T')[0],
    deliveryChallanNo: application.tracking_id,
    issuedDate: issueDateRaw,
  });

  await ensureCertificatesBucket(supabase);
  const { error: uploadError } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(certFile.fileName, certFile.buffer, {
      contentType: certFile.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Certificate upload failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(certFile.fileName);

  if (existingCert) {
    const { error: updateError } = await supabase
      .from('certificates')
      .update({
        file_url: publicUrl,
        issued_at: issueDate.toISOString(),
        expires_at: expiryDate.toISOString(),
        registration_number: registrationNumber ?? null,
        status: 'active',
      })
      .eq('id', existingCert.id);

    if (updateError) throw updateError;

    return { certId: existingCert.id, certNumber, created: false };
  }

  const { data: cert, error: insertError } = await supabase
    .from('certificates')
    .insert({
      client_id: application.client_id,
      chemical_id: application.chemical_id,
      tcc_application_id: application.id,
      certificate_number: certNumber,
      registration_number: registrationNumber ?? null,
      type: 'TCC',
      file_url: publicUrl,
      issued_at: issueDate.toISOString(),
      expires_at: expiryDate.toISOString(),
      status: 'active',
      mail_sent: false,
      mail_resend_count: 0,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  return { certId: cert.id, certNumber, created: true };
}

export async function reconcileMissingTccCertificates(supabase: DbClient): Promise<number> {
  const { data: apps, error } = await supabase
    .from('tcc_applications')
    .select(`
      id,
      client_id,
      chemical_id,
      tracking_id,
      export_date,
      status,
      updated_at,
      certificate_issue_date,
      certificates!certificates_tcc_application_id_fkey (id),
      clients (id, company_name, legal_name, email, phone, primary_contact_first_name, primary_contact_last_name, uuid_number, address, city, state, postal_code, country),
      chemicals (id, chemical_name, cas_number, ec_number, tonnage_band, available_quantity, exported_quantity),
      reach_certificate_id
    `)
    .eq('status', 'approved');

  if (error) throw error;
  if (!apps?.length) return 0;

  let repaired = 0;

  for (const app of apps) {
    const certs = app.certificates;
    const hasCert = Array.isArray(certs) ? certs.length > 0 : Boolean(certs);
    if (hasCert) continue;

    try {
      let registrationNumber: string | null = null;
      if (app.reach_certificate_id) {
        const { data: reachCert } = await supabase
          .from('certificates')
          .select('registration_number')
          .eq('id', app.reach_certificate_id)
          .maybeSingle();
        registrationNumber = reachCert?.registration_number ?? null;
      }

      const issueDateIso = app.certificate_issue_date
        ? String(app.certificate_issue_date).split('T')[0]
        : app.updated_at
          ? new Date(app.updated_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

      if (!app.certificate_issue_date) {
        await supabase
          .from('tcc_applications')
          .update({ certificate_issue_date: issueDateIso })
          .eq('id', app.id);
      }

      await upsertTccCertificateForApplication(supabase, {
        application: app,
        issueDateIso,
        registrationNumber,
      });

      repaired += 1;
    } catch (error) {
      console.error(`[tcc-reconcile] Failed for application ${app.id}:`, error);
    }
  }

  return repaired;
}
