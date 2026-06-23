'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import {
  resolveTccCertificateDownloadFile,
  buildTccCertificatePdfInputFromStoredCert,
} from '@/lib/tcc-certificate-pdf';
import { sendCertificateEmail as sendCertEmail } from '@/services/email';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import { appendMailSentHistory } from '@/lib/certificate-mail-history';
import { buildTccSmtpConfig } from '@/lib/certificate-smtp-settings';
import { adminTccApplicationUpdateSchema, tccEuApplicationSchema, tccNotificationApplicationSchema } from '@/lib/validations';
import { uploadBoAttachment, validateBoAttachment } from '@/lib/tcc-attachments';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';
import { revalidatePath } from 'next/cache';
import { notifyAllAdmins, notifyUser } from '@/lib/notifications';
import { notifyTccApplicationByEmail } from '@/lib/tcc-application-notification';
import {
  computeTccQuotaForExportDate,
  getReachCertAllocatedQuota,
  getRemainingQuota,
  getRemainingQuotaForReachPeriod,
  getTonnageBandMaxQuota,
  sumApprovedExports,
  sumApprovedExportsInReachWindow,
} from '@/lib/quota';
import { findReachCertificateForExportDate, REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';
import {
  clientHasEuReachRegistration,
  clientHasRegulatoryRegistration,
  EU_REACH_CERTIFICATE_REQUIRED_MESSAGE,
  getRegulatoryRegistrationLabel,
  isEuReachFramework,
  isNotificationOnlyFramework,
  type RegulatoryRegistration,
} from '@/lib/regulatory-registrations';
import { canClientEditTccApplication } from '@/lib/tcc-application';
import { formatErrorMessage } from '@/lib/format-error';
import { upsertTccCertificateForApplication } from '@/lib/tcc-certificate-issuance';
import { buildTccApplicationFieldChanges } from '@/lib/tcc-application-changes';
import type { z } from 'zod';

type TccEuApplicationInput = z.infer<typeof tccEuApplicationSchema>;
type TccNotificationApplicationInput = z.infer<typeof tccNotificationApplicationSchema>;

const REACH_QUOTA_CERT_SELECT =
  'id, certificate_number, client_id, chemical_id, status, expires_at, issued_at, type, allocated_quantity, tonnage_band, registration_number';

function resolveEuImporterFields(
  data: Pick<
    TccEuApplicationInput,
    'eu_importer_company_name' | 'eu_importer_address' | 'purchase_order_number' | 'invoice_number'
  >
) {
  return {
    eu_importer_company_name: data.eu_importer_company_name.trim(),
    eu_importer_address: data.eu_importer_address.trim(),
    purchase_order_number: data.purchase_order_number.trim(),
    invoice_number: data.invoice_number?.trim() || null,
  };
}

function tccSaveErrorMessage(err: unknown): string {
  const message = formatErrorMessage(err);
  if (
    message.includes('eu_importer') ||
    message.includes('purchase_order_number') ||
    message.includes('invoice_number') ||
    message.includes('reach_certificate_id') ||
    message.includes('certificate_issue_date') ||
    message.includes('tcc_application_notification_emails') ||
    message.includes('regulatory_registrations') ||
    message.includes('regulatory_framework') ||
    message.includes('PGRST204')
  ) {
    return 'Database is missing EU Importer columns. Run the latest database.sql migration in Supabase, then try again.';
  }
  return message || 'Failed to save application.';
}

function parseTccApplicationFormData(formData: FormData) {
  const regulatoryFramework = String(formData.get('regulatory_framework') ?? '').trim();
  const common = {
    quantity_mt: formData.get('quantity_mt'),
    export_date: formData.get('export_date'),
    eu_importer_company_name: formData.get('eu_importer_company_name') ?? '',
    eu_importer_address: formData.get('eu_importer_address') ?? '',
    purchase_order_number: formData.get('purchase_order_number') ?? '',
    invoice_number: formData.get('invoice_number') ?? '',
    regulatory_framework: regulatoryFramework,
  };

  if (isNotificationOnlyFramework(regulatoryFramework)) {
    return tccNotificationApplicationSchema.safeParse({
      ...common,
      case_number: formData.get('case_number') ?? '',
    });
  }

  return tccEuApplicationSchema.safeParse({
    ...common,
    chemical_id: formData.get('chemical_id'),
    registration_number: formData.get('registration_number') ?? '',
    remarks: formData.get('remarks') ?? '',
  });
}

async function validateClientTccSubmission(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  data: {
    chemical_id: string;
    quantity_mt: number;
    export_date: string;
  },
  options?: { excludeApplicationId?: string }
) {
  const { data: authChem } = await adminSupabase
    .from('client_chemicals')
    .select('id, available_quantity, status, chemicals(tonnage_band)')
    .eq('client_id', clientId)
    .eq('chemical_id', data.chemical_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!authChem) {
    return { ok: false as const, error: 'This substance is not authorized for your company. Contact your administrator.' };
  }

  const [{ data: reachCerts }, { data: approvedForChem }] = await Promise.all([
    adminSupabase
      .from('certificates')
      .select(REACH_QUOTA_CERT_SELECT)
      .eq('client_id', clientId)
      .eq('chemical_id', data.chemical_id)
      .eq('type', REACH_CERTIFICATE_TYPE)
      .neq('status', 'revoked')
      .order('issued_at', { ascending: false }),
    adminSupabase
      .from('tcc_applications')
      .select(
        'id, chemical_id, quantity_mt, status, export_date, reach_certificate_id, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)'
      )
      .eq('client_id', clientId)
      .eq('chemical_id', data.chemical_id)
      .eq('status', 'approved'),
  ]);

  const chem = Array.isArray(authChem.chemicals) ? authChem.chemicals[0] : authChem.chemicals;
  const tonnageBand = (chem as { tonnage_band?: string | null } | null)?.tonnage_band ?? null;

  const quotaResult = computeTccQuotaForExportDate({
    reachCertificates: reachCerts || [],
    approvedApplications: approvedForChem || [],
    chemicalId: data.chemical_id,
    exportDate: data.export_date,
    tonnageBand,
    excludeApplicationId: options?.excludeApplicationId,
  });

  if (!quotaResult.reachCert) {
    return {
      ok: false as const,
      error:
        quotaResult.error ||
        'A REACH Compliance Certificate is required for the selected export shipment date.',
    };
  }

  if (quotaResult.remainingQuota < data.quantity_mt) {
    const periodLabel = quotaResult.reachCert.expires_at
      ? `${new Date(quotaResult.reachCert.issued_at).toLocaleDateString()} – ${new Date(quotaResult.reachCert.expires_at).toLocaleDateString()}`
      : new Date(quotaResult.reachCert.issued_at).toLocaleDateString();
    return {
      ok: false as const,
      error: `Insufficient quota for RC period (${periodLabel}). Requested: ${data.quantity_mt} MT, Available: ${quotaResult.remainingQuota} MT.`,
    };
  }

  return { ok: true as const, authChem, reachCert: quotaResult.reachCert, remainingQuota: quotaResult.remainingQuota };
}

function extractBoStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl?.trim()) return null;
  const markers = [`/object/public/${CERTIFICATES_BUCKET}/`, `/${CERTIFICATES_BUCKET}/`];
  for (const marker of markers) {
    const idx = publicUrl.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0] ?? '');
    }
  }
  const boIdx = publicUrl.indexOf('/bo/');
  if (boIdx >= 0) {
    return decodeURIComponent(publicUrl.slice(boIdx + 1).split('?')[0] ?? '');
  }
  return null;
}

// ============================================================================
// APPLY FOR TCC (Client Action)
// ============================================================================
export async function applyForTccAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== 'CLIENT') {
    return { success: false, error: 'Unauthorized. Clients only.' };
  }

  const clientId = session.clientId;
  if (!clientId) {
    return { success: false, error: 'User is not linked to a valid client organization.' };
  }

  const result = parseTccApplicationFormData(formData);

  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      success: false,
      error: issue.message || `Invalid ${issue.path.join('.') || 'input'}.`,
    };
  }

  const adminSupabase = createAdminClient();

  try {
    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .select('company_name, regulatory_registrations')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return { success: false, error: 'Client not found.' };
    }

    const framework = result.data.regulatory_framework as RegulatoryRegistration;
    if (!clientHasRegulatoryRegistration(client.regulatory_registrations, framework)) {
      return {
        success: false,
        error: 'Selected regulatory framework is not enabled for your company profile.',
      };
    }

    const euImporter = resolveEuImporterFields(result.data);
    const boFile = formData.get('bo_attachment');
    if (!(boFile instanceof File) || boFile.size === 0) {
      return { success: false, error: 'PO attachment is required.' };
    }

    const boValidation = validateBoAttachment(boFile);
    if (!boValidation.ok) {
      return { success: false, error: boValidation.error };
    }

    const isEuReach = isEuReachFramework(framework);

    if (isEuReach && !clientHasEuReachRegistration(client.regulatory_registrations)) {
      return { success: false, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
    }

    if (!isEuReach) {
      const notificationData = result.data as TccNotificationApplicationInput;
      const frameworkLabel = getRegulatoryRegistrationLabel(framework);
      const companyLabel = client.company_name || 'A client';

      await notifyTccApplicationByEmail(adminSupabase, {
        clientCompanyName: companyLabel,
        caseNumber: notificationData.case_number.trim(),
        quantityMt: notificationData.quantity_mt,
        exportDate: notificationData.export_date,
        regulatoryFramework: framework,
        euImporterCompanyName: euImporter.eu_importer_company_name,
        euImporterAddress: euImporter.eu_importer_address,
        purchaseOrderNumber: euImporter.purchase_order_number,
        poAttachment: {
          buffer: Buffer.from(await boFile.arrayBuffer()),
          fileName: boFile.name,
          contentType: boFile.type || 'application/octet-stream',
        },
      });

      return {
        success: true,
        message: `${frameworkLabel} request submitted. Admin notification email sent.`,
      };
    }

    const euData = result.data as TccEuApplicationInput;

    const { data: chemical } = await adminSupabase
      .from('chemicals')
      .select('chemical_name, cas_number, ec_number')
      .eq('id', euData.chemical_id)
      .single();

    if (!chemical) return { success: false, error: 'Substance not found.' };

    let authChemId: string;
    let reachCertId: string | null = null;
    let availableBeforeRequest = 0;
    let reachCert:
      | {
          certificate_number?: string | null;
          issued_at?: string | null;
          expires_at?: string | null;
        }
      | null = null;

    const validation = await validateClientTccSubmission(adminSupabase, clientId, euData);
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }
    authChemId = validation.authChem.id;
    reachCertId = validation.reachCert.id;
    availableBeforeRequest = validation.remainingQuota;
    reachCert = validation.reachCert;

    const { data: app, error: appError } = await adminSupabase
      .from('tcc_applications')
      .insert({
        client_id: clientId,
        chemical_id: euData.chemical_id,
        client_chemical_id: authChemId,
        reach_certificate_id: reachCertId,
        regulatory_framework: framework,
        quantity_mt: euData.quantity_mt,
        registration_number: euData.registration_number || null,
        export_date: euData.export_date,
        remarks: euData.remarks || null,
        ...euImporter,
        status: 'pending',
      })
      .select()
      .single();

    if (appError) throw appError;

    const { url: boUrl, name: boName } = await uploadBoAttachment(adminSupabase, boFile, clientId, app.id);
    await adminSupabase
      .from('tcc_applications')
      .update({ bo_attachment_url: boUrl, bo_attachment_name: boName })
      .eq('id', app.id);

    await adminSupabase.from('audit_logs').insert({
      user_id: session.userId,
      action: 'CREATE_TCC_APPLICATION',
      entity_type: 'tcc_applications',
      entity_id: app.id,
      metadata: {
        quantity: euData.quantity_mt,
        chemical: chemical.chemical_name,
        regulatory_framework: framework,
      },
    });

    const companyLabel = client.company_name || 'A client';
    const frameworkLabel = getRegulatoryRegistrationLabel(framework);
    await notifyAllAdmins(
      adminSupabase,
      'New TCC application',
      `${companyLabel} submitted ${euData.quantity_mt} MT for ${chemical.chemical_name}. Review in Approvals.`,
      '/admin/approvals'
    );

    await notifyTccApplicationByEmail(adminSupabase, {
      clientCompanyName: companyLabel,
      chemicalName: chemical.chemical_name,
      casNumber: chemical.cas_number,
      ecNumber: chemical.ec_number,
      quantityMt: euData.quantity_mt,
      exportDate: euData.export_date,
      applicationId: app.id,
      regulatoryFramework: framework,
      euImporterCompanyName: euImporter.eu_importer_company_name,
      euImporterAddress: euImporter.eu_importer_address,
      purchaseOrderNumber: euImporter.purchase_order_number,
      currentAvailableMt: availableBeforeRequest,
      projectedBalanceMt: Math.max(0, availableBeforeRequest - euData.quantity_mt),
      rcCertificateNumber: reachCert?.certificate_number ?? null,
      rcPeriodStart: reachCert?.issued_at ?? null,
      rcPeriodEnd: reachCert?.expires_at ?? null,
      poAttachment: {
        buffer: Buffer.from(await boFile.arrayBuffer()),
        fileName: boName,
        contentType: boFile.type || 'application/octet-stream',
      },
    });

    revalidatePath('/client');
    revalidatePath('/client/apply');
    revalidatePath('/admin', 'layout');
    revalidatePath('/admin/approvals');
    return {
      success: true,
      message: 'TCC Application submitted. Status: Pending Review.',
    };
  } catch (err: unknown) {
    return { success: false, error: tccSaveErrorMessage(err) };
  }
}

// ============================================================================
// UPDATE TCC APPLICATION (Client — until admin approves)
// ============================================================================
export async function updateTccApplicationAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== 'CLIENT') {
    return { success: false, error: 'Unauthorized. Clients only.' };
  }

  const clientId = session.clientId;
  if (!clientId) {
    return { success: false, error: 'User is not linked to a valid client organization.' };
  }

  const applicationId = String(formData.get('application_id') ?? '').trim();
  if (!applicationId) {
    return { success: false, error: 'Application ID is required.' };
  }

  const result = parseTccApplicationFormData(formData);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      success: false,
      error: issue.message || `Invalid ${issue.path.join('.') || 'input'}.`,
    };
  }

  const adminSupabase = createAdminClient();

  try {
    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .select('regulatory_registrations')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return { success: false, error: 'Client not found.' };
    }

    if (!clientHasRegulatoryRegistration(client.regulatory_registrations, result.data.regulatory_framework)) {
      return {
        success: false,
        error: 'Selected regulatory framework is not enabled for your company profile.',
      };
    }

    if (
      isEuReachFramework(result.data.regulatory_framework) &&
      !clientHasEuReachRegistration(client.regulatory_registrations)
    ) {
      return { success: false, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
    }

    if (isNotificationOnlyFramework(result.data.regulatory_framework)) {
      return {
        success: false,
        error: 'UK REACH and Turkey KKDIK requests cannot be edited. Submit a new notification if needed.',
      };
    }

    const euData = result.data as TccEuApplicationInput;

    const { data: existing, error: loadError } = await adminSupabase
      .from('tcc_applications')
      .select('id, client_id, status, bo_attachment_url, bo_attachment_name, regulatory_framework')
      .eq('id', applicationId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return { success: false, error: 'Application not found.' };
    }
    if (!canClientEditTccApplication(existing.status)) {
      return { success: false, error: 'Approved applications cannot be edited.' };
    }

    const validation = await validateClientTccSubmission(adminSupabase, clientId, euData, {
      excludeApplicationId: applicationId,
    });
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }
    const authChemId = validation.authChem.id;
    const reachCertId = validation.reachCert.id;

    const boFile = formData.get('bo_attachment');
    const hasNewBo = boFile instanceof File && boFile.size > 0;
    if (!hasNewBo && !existing.bo_attachment_url) {
      return { success: false, error: 'PO attachment is required.' };
    }

    if (hasNewBo) {
      const boValidation = validateBoAttachment(boFile);
      if (!boValidation.ok) {
        return { success: false, error: boValidation.error };
      }
    }

    const resetStatus = ['changes_required', 'modification_requested', 'rejected'].includes(existing.status);
    const euImporter = resolveEuImporterFields(euData);

    const { error: updateError } = await adminSupabase
      .from('tcc_applications')
      .update({
        chemical_id: euData.chemical_id,
        client_chemical_id: authChemId,
        reach_certificate_id: reachCertId,
        regulatory_framework: euData.regulatory_framework,
        quantity_mt: euData.quantity_mt,
        registration_number: euData.registration_number || null,
        export_date: euData.export_date,
        remarks: euData.remarks || null,
        ...euImporter,
        ...(resetStatus ? { status: 'pending', rejection_reason: null } : {}),
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    if (hasNewBo) {
      const { url: boUrl, name: boName } = await uploadBoAttachment(
        adminSupabase,
        boFile,
        clientId,
        applicationId
      );
      await adminSupabase
        .from('tcc_applications')
        .update({ bo_attachment_url: boUrl, bo_attachment_name: boName })
        .eq('id', applicationId);
    }

    await adminSupabase.from('audit_logs').insert({
      user_id: session.userId,
      action: 'UPDATE_TCC_APPLICATION',
      entity_type: 'tcc_applications',
      entity_id: applicationId,
      metadata: { quantity: euData.quantity_mt },
    });

    revalidatePath('/client');
    revalidatePath('/client/apply');
    revalidatePath('/admin', 'layout');
    revalidatePath('/admin/approvals');
    return { success: true, message: 'TCC application updated successfully.' };
  } catch (err: unknown) {
    return { success: false, error: tccSaveErrorMessage(err) };
  }
}

const TCC_CERTIFICATE_RELATION_SELECT = `
  id,
  certificate_number,
  expires_at,
  registration_number,
  client_id,
  type,
  tcc_application_id,
  clients (
    company_name,
    uuid_number,
    address,
    city,
    state,
    postal_code,
    country
  ),
  chemicals (
    chemical_name,
    cas_number,
    ec_number,
    tonnage_band
  ),
  tcc_applications!certificates_tcc_application_id_fkey (
    quantity_mt,
    export_date,
    tracking_id,
    registration_number,
    remarks,
    eu_importer_company_name,
    eu_importer_address,
    purchase_order_number,
    chemicals (
      chemical_name,
      cas_number,
      ec_number,
      tonnage_band
    )
  )
`;

async function syncQuotaForClientChemical(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  chemicalId: string,
  clientChemicalId: string | null
) {
  const { data: allApproved } = await adminSupabase
    .from('tcc_applications')
    .select('chemical_id, quantity_mt, status, export_date, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .eq('status', 'approved');

  const exportedAfter = sumApprovedExports(allApproved || [], chemicalId);

  const { data: chem } = await adminSupabase
    .from('chemicals')
    .select('tonnage_band')
    .eq('id', chemicalId)
    .single();

  const syncedAvailable = getRemainingQuota(0, exportedAfter, chem?.tonnage_band ?? null);

  let ccId = clientChemicalId;
  if (!ccId) {
    const { data: clientChem } = await adminSupabase
      .from('client_chemicals')
      .select('id')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('status', 'active')
      .maybeSingle();
    ccId = clientChem?.id ?? null;
  }

  if (ccId) {
    await adminSupabase
      .from('client_chemicals')
      .update({ available_quantity: syncedAvailable })
      .eq('id', ccId);
  }

  const { data: globalApproved } = await adminSupabase
    .from('tcc_applications')
    .select('quantity_mt')
    .eq('chemical_id', chemicalId)
    .eq('status', 'approved');

  const totalExported = (globalApproved || []).reduce(
    (sum, row) => sum + Number(row.quantity_mt),
    0
  );

  await adminSupabase
    .from('chemicals')
    .update({ exported_quantity: totalExported })
    .eq('id', chemicalId);
}

async function regenerateTccCertificateFile(
  adminSupabase: ReturnType<typeof createAdminClient>,
  certificateId: string
) {
  const { data: cert, error } = await adminSupabase
    .from('certificates')
    .select(TCC_CERTIFICATE_RELATION_SELECT)
    .eq('id', certificateId)
    .eq('type', 'TCC')
    .single();

  if (error || !cert) {
    throw new Error('Certificate not found for regeneration.');
  }

  const input = await buildTccCertificatePdfInputFromStoredCert(adminSupabase, cert as never);
  const certFile = await resolveTccCertificateDownloadFile(adminSupabase, input);

  await ensureCertificatesBucket(adminSupabase);
  const { error: uploadError } = await adminSupabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(certFile.fileName, certFile.buffer, {
      contentType: certFile.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Certificate regeneration failed: ${uploadError.message}`);
  }
}

function parseAdminTccUpdateFormData(formData: FormData) {
  return adminTccApplicationUpdateSchema.safeParse({
    application_id: formData.get('application_id'),
    eu_importer_company_name: formData.get('eu_importer_company_name') ?? '',
    eu_importer_address: formData.get('eu_importer_address') ?? '',
    purchase_order_number: formData.get('purchase_order_number') ?? '',
    invoice_number: formData.get('invoice_number') ?? '',
    quantity_mt: formData.get('quantity_mt'),
    export_date: formData.get('export_date'),
    issue_date: formData.get('issue_date') ?? '',
    certificate_id: formData.get('certificate_id') ?? '',
    registration_number: formData.get('registration_number') ?? '',
    remarks: formData.get('remarks') ?? '',
  });
}

// ============================================================================
// ADMIN UPDATE TCC APPLICATION (Edit in Application Review / Preview)
// ============================================================================
export async function adminUpdateTccApplicationAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const result = parseAdminTccUpdateFormData(formData);
  if (!result.success) {
    return { success: false, error: result.error.flatten().fieldErrors };
  }

  const adminSupabase = createAdminClient();
  const applicationId = result.data.application_id;

  try {
    const { data: existingApp, error: loadError } = await adminSupabase
      .from('tcc_applications')
      .select(
        'id, client_id, chemical_id, client_chemical_id, status, quantity_mt, export_date, eu_importer_company_name, eu_importer_address, purchase_order_number, invoice_number, certificate_issue_date, registration_number, remarks'
      )
      .eq('id', applicationId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existingApp) {
      return { success: false, error: 'Application not found.' };
    }

    const { data: clientProfile } = await adminSupabase
      .from('clients')
      .select('regulatory_registrations')
      .eq('id', existingApp.client_id)
      .single();

    if (!clientHasEuReachRegistration(clientProfile?.regulatory_registrations)) {
      return { success: false, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
    }

    const existing = existingApp;
    const newQuantity = result.data.quantity_mt;
    const quantityChanged = Number(existing.quantity_mt) !== newQuantity;

    let certId = result.data.certificate_id?.trim() || null;
    if (!certId) {
      const { data: cert } = await adminSupabase
        .from('certificates')
        .select('id, issued_at')
        .eq('tcc_application_id', applicationId)
        .eq('type', 'TCC')
        .maybeSingle();
      certId = cert?.id ?? null;
    }

    let beforeIssueDate = existingApp.certificate_issue_date;
    if (certId) {
      const { data: certRow } = await adminSupabase
        .from('certificates')
        .select('issued_at')
        .eq('id', certId)
        .maybeSingle();
      if (certRow?.issued_at) {
        beforeIssueDate = certRow.issued_at.split('T')[0];
      }
    }

    const beforeSnapshot = {
      eu_importer_company_name: existingApp.eu_importer_company_name,
      eu_importer_address: existingApp.eu_importer_address,
      purchase_order_number: existingApp.purchase_order_number,
      invoice_number: existingApp.invoice_number,
      quantity_mt: existingApp.quantity_mt,
      export_date: existingApp.export_date,
      certificate_issue_date: beforeIssueDate,
      registration_number: existingApp.registration_number,
      remarks: existingApp.remarks,
    };

    const { data: chem } = await adminSupabase
      .from('chemicals')
      .select('tonnage_band')
      .eq('id', existing.chemical_id)
      .single();

    const exportDate = result.data.export_date || existingApp.export_date;

    if (exportDate) {
      const [{ data: reachCerts }, { data: approvedForChem }] = await Promise.all([
        adminSupabase
          .from('certificates')
          .select(REACH_QUOTA_CERT_SELECT)
          .eq('client_id', existing.client_id)
          .eq('chemical_id', existing.chemical_id)
          .eq('type', REACH_CERTIFICATE_TYPE)
          .neq('status', 'revoked'),
        adminSupabase
          .from('tcc_applications')
          .select(
            'id, chemical_id, quantity_mt, status, export_date, reach_certificate_id, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)'
          )
          .eq('client_id', existing.client_id)
          .eq('chemical_id', existing.chemical_id)
          .eq('status', 'approved')
          .neq('id', applicationId),
      ]);

      const quotaResult = computeTccQuotaForExportDate({
        reachCertificates: reachCerts || [],
        approvedApplications: approvedForChem || [],
        chemicalId: existing.chemical_id,
        exportDate,
        tonnageBand: chem?.tonnage_band ?? null,
        excludeApplicationId: existing.status === 'approved' ? undefined : applicationId,
      });

      if (!quotaResult.reachCert) {
        return {
          success: false,
          error:
            quotaResult.error ||
            'No REACH Compliance Certificate covers the selected export shipment date.',
        };
      }

      if (newQuantity > quotaResult.remainingQuota) {
        return {
          success: false,
          error: `Quantity exceeds available quota for RC period ${quotaResult.reachCert.certificate_number}. Only ${quotaResult.remainingQuota} MT remaining.`,
        };
      }
    } else if (existing.status === 'approved' && quantityChanged) {
      const { data: approvedForChem } = await adminSupabase
        .from('tcc_applications')
        .select('chemical_id, quantity_mt, status, export_date, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)')
        .eq('client_id', existing.client_id)
        .eq('chemical_id', existing.chemical_id)
        .eq('status', 'approved')
        .neq('id', applicationId);

      const exportedMt = sumApprovedExports(approvedForChem || [], existing.chemical_id);
      const bandMax = getTonnageBandMaxQuota(chem?.tonnage_band ?? null);

      if (bandMax != null && exportedMt + newQuantity > bandMax) {
        return {
          success: false,
          error: `Quantity exceeds annual limit. Only ${Math.max(0, bandMax - exportedMt)} MT remaining for this substance.`,
        };
      }
    }

    const issueDateValue = result.data.issue_date?.trim() || null;

    const { error: updateError } = await adminSupabase
      .from('tcc_applications')
      .update({
        eu_importer_company_name: result.data.eu_importer_company_name.trim(),
        eu_importer_address: result.data.eu_importer_address.trim(),
        purchase_order_number: result.data.purchase_order_number.trim(),
        invoice_number: result.data.invoice_number?.trim() || null,
        quantity_mt: newQuantity,
        export_date: result.data.export_date,
        certificate_issue_date: issueDateValue,
        registration_number: result.data.registration_number?.trim() || null,
        remarks: result.data.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    if (existing.status === 'approved' && quantityChanged) {
      await syncQuotaForClientChemical(
        adminSupabase,
        existing.client_id,
        existing.chemical_id,
        existing.client_chemical_id
      );
    }

    if (result.data.issue_date && certId) {
      const issueDate = new Date(`${result.data.issue_date}T12:00:00`);
      const expiresAt = new Date(issueDate);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const { error: certDateError } = await adminSupabase
        .from('certificates')
        .update({
          issued_at: issueDate.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', certId)
        .eq('tcc_application_id', applicationId)
        .eq('type', 'TCC');

      if (certDateError) throw certDateError;
    }

    if (!certId) {
      const { data: cert } = await adminSupabase
        .from('certificates')
        .select('id')
        .eq('tcc_application_id', applicationId)
        .eq('type', 'TCC')
        .maybeSingle();
      certId = cert?.id ?? null;
    }

    if (certId) {
      await regenerateTccCertificateFile(adminSupabase, certId);
    }

    const afterSnapshot = {
      eu_importer_company_name: result.data.eu_importer_company_name.trim(),
      eu_importer_address: result.data.eu_importer_address.trim(),
      purchase_order_number: result.data.purchase_order_number.trim(),
      invoice_number: result.data.invoice_number?.trim() || null,
      quantity_mt: newQuantity,
      export_date: result.data.export_date,
      certificate_issue_date: issueDateValue || result.data.issue_date?.trim() || null,
      registration_number: result.data.registration_number?.trim() || null,
      remarks: result.data.remarks?.trim() || null,
    };
    const fieldChanges = buildTccApplicationFieldChanges(beforeSnapshot, afterSnapshot);

    await adminSupabase.from('activity_logs').insert({
      client_id: existing.client_id,
      user_id: session.userId,
      action: 'TCC_ADMIN_EDIT',
      entity_type: 'tcc_applications',
      entity_id: applicationId,
      description:
        fieldChanges.length > 0
          ? `${fieldChanges.length} field${fieldChanges.length === 1 ? '' : 's'} updated`
          : 'Application data updated by administrator',
      metadata: fieldChanges.length > 0 ? { changes: fieldChanges } : null,
    });

    revalidatePath('/admin/approvals');
    revalidatePath(`/admin/clients/${existing.client_id}`);
    revalidatePath('/client');
    if (certId) {
      revalidatePath(`/admin/certificate-preview/${certId}`);
    }

    return {
      success: true,
      message: certId
        ? 'Application updated and certificate preview regenerated.'
        : 'Application updated successfully.',
      certificateId: certId,
    };
  } catch (err: unknown) {
    return { success: false, error: tccSaveErrorMessage(err) };
  }
}

export async function getTccApplicationChangeHistoryAction(applicationId: string) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('activity_logs')
    .select('id, action, description, metadata, created_at, users(email)')
    .eq('entity_type', 'tcc_applications')
    .eq('entity_id', applicationId)
    .in('action', ['TCC_ADMIN_EDIT', 'TCC_APPROVED', 'TCC_CHANGES_REQUIRED', 'TCC_REJECTED'])
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, entries: data || [] };
}

// ============================================================================
// PROCESS TCC APPLICATION (Admin Action)
// ============================================================================
export async function processTccAction(
  applicationId: string,
  status: 'approved' | 'rejected' | 'changes_required',
  rejectionReason = ''
) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const adminSupabase = createAdminClient();

  try {
    // 1. Fetch application with relations
    const { data: app, error: fetchError } = await adminSupabase
      .from('tcc_applications')
      .select(`
        *,
        clients (id, company_name, legal_name, email, phone, primary_contact_first_name, primary_contact_last_name, uuid_number, address, city, state, postal_code, country, regulatory_registrations),
        chemicals (id, chemical_name, cas_number, ec_number, tonnage_band, available_quantity, exported_quantity)
      `)
      .eq('id', applicationId)
      .single();

    if (fetchError || !app) throw new Error('Application not found');

    if (!isEuReachFramework(app.regulatory_framework)) {
      const storagePath = extractBoStoragePath(app.bo_attachment_url);
      if (storagePath) {
        await adminSupabase.storage.from(CERTIFICATES_BUCKET).remove([storagePath]);
      }

      const { error: deleteError } = await adminSupabase
        .from('tcc_applications')
        .delete()
        .eq('id', applicationId);

      if (deleteError) throw deleteError;

      revalidatePath('/admin/approvals');
      revalidatePath('/admin');
      revalidatePath('/client');
      revalidatePath(`/admin/clients/${app.client_id}`);

      return {
        success: true,
        message:
          'UK REACH / Turkey KKDIK notification request removed. These submissions are email-only and are not approved in this portal.',
      };
    }

    const clientRecord = Array.isArray(app.clients) ? app.clients[0] : app.clients;
    if (!clientHasEuReachRegistration(clientRecord?.regulatory_registrations)) {
      return { success: false, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
    }

    let matchedReachCert: {
      id: string;
      registration_number?: string | null;
      allocated_quantity?: number | null;
      tonnage_band?: string | null;
    } | null = null;

    if (status === 'approved') {
      if (!app.export_date) {
        return { success: false, error: 'Cannot approve: export shipment date is missing.' };
      }

      const [{ data: reachCerts }, { data: approvedForChem }] = await Promise.all([
        adminSupabase
          .from('certificates')
          .select(REACH_QUOTA_CERT_SELECT)
          .eq('client_id', app.client_id)
          .eq('chemical_id', app.chemical_id)
          .eq('type', REACH_CERTIFICATE_TYPE)
          .neq('status', 'revoked'),
        adminSupabase
          .from('tcc_applications')
          .select(
            'id, chemical_id, quantity_mt, status, export_date, reach_certificate_id, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)'
          )
          .eq('client_id', app.client_id)
          .eq('chemical_id', app.chemical_id)
          .eq('status', 'approved')
          .neq('id', applicationId),
      ]);

      const reachCert =
        (app.reach_certificate_id
          ? (reachCerts || []).find((c) => c.id === app.reach_certificate_id)
          : null) ||
        findReachCertificateForExportDate(reachCerts || [], app.chemical_id, app.export_date);

      matchedReachCert = reachCert;

      if (!reachCert) {
        return {
          success: false,
          error:
            'Cannot approve: no REACH Compliance Certificate covers the export shipment date.',
        };
      }

      const exportedMt = sumApprovedExportsInReachWindow(
        approvedForChem || [],
        app.chemical_id,
        reachCert
      );
      const resolvedBand = reachCert.tonnage_band || app.chemicals.tonnage_band;
      const requested = Number(app.quantity_mt);
      const remaining = getRemainingQuotaForReachPeriod(
        exportedMt,
        resolvedBand,
        reachCert.allocated_quantity
      );

      if (requested > remaining) {
        return {
          success: false,
          error: `Cannot approve: ${exportedMt} MT already used for this RC period (${reachCert.certificate_number}). Only ${remaining} MT remaining.`,
        };
      }

      if (!app.reach_certificate_id) {
        await adminSupabase
          .from('tcc_applications')
          .update({ reach_certificate_id: reachCert.id })
          .eq('id', applicationId);
      }
    }

    const approvalIssueDateIso = new Date().toISOString().split('T')[0];

    // 2. Update application status
    const { error: updateError } = await adminSupabase
      .from('tcc_applications')
      .update({
        status,
        rejection_reason: rejectionReason || null,
        approved_by: session.userId,
        updated_at: new Date().toISOString(),
        ...(status === 'approved' ? { certificate_issue_date: approvalIssueDateIso } : {}),
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    if (status === 'approved') {
      // 3. Deduct client-assigned quota (admin allocation on client_chemicals)
      let clientChemId = app.client_chemical_id as string | null;
      let clientChemAvailable: number | null = null;

      if (clientChemId) {
        const { data: clientChem } = await adminSupabase
          .from('client_chemicals')
          .select('available_quantity')
          .eq('id', clientChemId)
          .single();
        if (clientChem) clientChemAvailable = Number(clientChem.available_quantity);
      } else {
        const { data: clientChem } = await adminSupabase
          .from('client_chemicals')
          .select('id, available_quantity')
          .eq('client_id', app.client_id)
          .eq('chemical_id', app.chemical_id)
          .eq('status', 'active')
          .maybeSingle();
        if (clientChem) {
          clientChemId = clientChem.id;
          clientChemAvailable = Number(clientChem.available_quantity);
        }
      }

      if (clientChemId && clientChemAvailable != null) {
        const tonnageBand = app.chemicals.tonnage_band as string | null;
        const { data: allApproved } = await adminSupabase
          .from('tcc_applications')
          .select('chemical_id, quantity_mt, status, export_date, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)')
          .eq('client_id', app.client_id)
          .eq('chemical_id', app.chemical_id)
          .eq('status', 'approved');

        const exportedAfter = sumApprovedExports(allApproved || [], app.chemical_id);
        const syncedAvailable = getRemainingQuota(0, exportedAfter, tonnageBand);

        await adminSupabase
          .from('client_chemicals')
          .update({ available_quantity: syncedAvailable })
          .eq('id', clientChemId);

        if (!app.client_chemical_id) {
          await adminSupabase
            .from('tcc_applications')
            .update({ client_chemical_id: clientChemId })
            .eq('id', applicationId);
        }
      }

      const newExported = Number(app.chemicals.exported_quantity) + Number(app.quantity_mt);
      await adminSupabase
        .from('chemicals')
        .update({ exported_quantity: newExported })
        .eq('id', app.chemical_id);

      // 4. Record quota transaction
      await adminSupabase.from('quota_transactions').insert({
        client_id: app.client_id,
        chemical_id: app.chemical_id,
        tcc_application_id: applicationId,
        quantity_mt: app.quantity_mt,
        transaction_type: 'deduct',
        performed_by: session.userId,
        notes: `TCC approved — ${app.chemicals.chemical_name}`,
      });

      const { certId, certNumber, created: certCreated } = await upsertTccCertificateForApplication(
        adminSupabase,
        {
          application: app,
          issueDateIso: approvalIssueDateIso,
          registrationNumber: matchedReachCert?.registration_number || null,
        }
      );

      // 10. Activity log
      await adminSupabase.from('activity_logs').insert({
        client_id: app.client_id,
        user_id: session.userId,
        action: 'TCC_APPROVED',
        entity_type: 'tcc_applications',
        entity_id: applicationId,
        description: certCreated
          ? `TCC approved — Certificate ${certNumber} generated`
          : `TCC re-approved — Certificate ${certNumber} updated`,
      });

      if (certCreated) {
        const { data: clientUser } = await adminSupabase
          .from('users')
          .select('id')
          .eq('client_id', app.client_id)
          .maybeSingle();
        if (clientUser) {
          await notifyUser(
            adminSupabase,
            clientUser.id,
            'TCC Certificate Issued',
            `Your certificate ${certNumber} has been issued for ${app.chemicals.chemical_name}.`,
            '/client/certificates'
          );
        }
      }

      revalidatePath('/admin/approvals');
      revalidatePath('/admin', 'layout');
      revalidatePath('/client', 'layout');

      return {
        success: true,
        message: certCreated
          ? 'Application approved. Certificate generated.'
          : 'Application approved. Certificate updated.',
        certificateId: certId,
      };
    } else {
      // Rejected or Changes Required
      const { data: clientUser } = await adminSupabase
        .from('users')
        .select('id')
        .eq('client_id', app.client_id)
        .maybeSingle();
      if (clientUser) {
        await notifyUser(
          adminSupabase,
          clientUser.id,
          status === 'rejected' ? 'TCC Application Rejected' : 'TCC Changes Required',
          rejectionReason || `Your TCC application for ${app.chemicals.chemical_name} requires attention.`,
          '/client'
        );
      }

      revalidatePath('/client', 'layout');

      await adminSupabase.from('activity_logs').insert({
        client_id: app.client_id,
        user_id: session.userId,
        action: status === 'rejected' ? 'TCC_REJECTED' : 'TCC_CHANGES_REQUIRED',
        entity_type: 'tcc_applications',
        entity_id: applicationId,
        description: rejectionReason || status,
      });

      revalidatePath('/admin/approvals');
      return { success: true, message: `Application ${status}.` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TCC PROCESS ERROR]:', err);
    return { success: false, error: message };
  }
}

// ============================================================================
// SEND CERTIFICATE EMAIL (First send — admin manual trigger)
// ============================================================================
export async function sendCertificateEmailAction(certificateId: string) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const adminSupabase = createAdminClient();

  try {
    // Fetch certificate with all relations
    const { data: cert, error } = await adminSupabase
      .from('certificates')
      .select(`
        *,
        chemicals (chemical_name, cas_number, ec_number, tonnage_band),
        tcc_applications!certificates_tcc_application_id_fkey (
          id, quantity_mt, registration_number, export_date, tracking_id, remarks,
          eu_importer_company_name, eu_importer_address, purchase_order_number,
          chemicals (chemical_name, cas_number, ec_number, tonnage_band)
        ),
        clients (
          id, company_name, email, cc_emails, uuid_number, address, city, state, postal_code, country,
          client_contacts (email)
        )
      `)
      .eq('id', certificateId)
      .eq('type', 'TCC')
      .single();

    if (error || !cert) throw new Error('Certificate not found');

    // Get SMTP settings from admin_settings
    const { data: settings } = await adminSupabase
      .from('admin_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_cc_default')
      .eq('id', 1)
      .single();

    const contactEmails =
      cert.clients.client_contacts?.map((c: { email: string }) => c.email).filter(Boolean) || [];

    const recipients = buildCertificateRecipients({
      primaryEmail: cert.clients.email,
      contactEmails,
      defaultCcEmails: settings?.smtp_cc_default,
      senderEmail: settings?.smtp_from,
    });

    const pdfInput = await buildTccCertificatePdfInputFromStoredCert(adminSupabase, cert as never);
    const certFile = await resolveTccCertificateDownloadFile(adminSupabase, pdfInput);

    // Send email
    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `TCC Certificate Approved — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName: cert.tcc_applications?.chemicals?.chemical_name || 'N/A',
      pdfBuffer: certFile.buffer,
      pdfFileName: certFile.fileName,
      attachmentContentType: certFile.contentType,
      smtpConfig: buildTccSmtpConfig(settings),
    });

    // Update mail tracking
    const now = new Date().toISOString();
    await adminSupabase
      .from('certificates')
      .update({
        mail_sent: true,
        mail_sent_at: now,
        mail_sent_by: session.userId,
        mail_sent_history: [now],
      })
      .eq('id', certificateId);

    await adminSupabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: session.userId,
      action: 'CERTIFICATE_EMAIL_SENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `Certificate email sent to ${cert.clients.email}`,
    });

    revalidatePath(`/admin/certificate-preview/${certificateId}`);
    revalidatePath('/admin/approvals');
    revalidatePath(`/admin/clients/${cert.client_id}`);
    return { success: true, message: `Certificate email sent to ${cert.clients.email}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SEND CERT EMAIL ERROR]:', err);
    return { success: false, error: message };
  }
}

// ============================================================================
// RESEND CERTIFICATE EMAIL
// ============================================================================
export async function resendCertificateEmailAction(certificateId: string) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const adminSupabase = createAdminClient();

  try {
    const { data: cert, error } = await adminSupabase
      .from('certificates')
      .select(`
        *,
        chemicals (chemical_name, cas_number, ec_number, tonnage_band),
        tcc_applications!certificates_tcc_application_id_fkey (
          quantity_mt, registration_number, export_date, tracking_id, remarks,
          eu_importer_company_name, eu_importer_address, purchase_order_number,
          chemicals (chemical_name, cas_number, ec_number, tonnage_band)
        ),
        clients (
          id, company_name, email, uuid_number, address, city, state, postal_code, country,
          client_contacts (email)
        )
      `)
      .eq('id', certificateId)
      .eq('type', 'TCC')
      .single();

    if (error || !cert) throw new Error('Certificate not found');
    if (!cert.mail_sent) throw new Error('Certificate has not been sent yet. Use Send Mail first.');

    const { data: settings } = await adminSupabase
      .from('admin_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_cc_default')
      .eq('id', 1)
      .single();

    const contactEmails =
      cert.clients.client_contacts?.map((c: { email: string }) => c.email).filter(Boolean) || [];

    const recipients = buildCertificateRecipients({
      primaryEmail: cert.clients.email,
      contactEmails,
      defaultCcEmails: settings?.smtp_cc_default,
      senderEmail: settings?.smtp_from,
    });

    const pdfInput = await buildTccCertificatePdfInputFromStoredCert(adminSupabase, cert as never);
    const certFile = await resolveTccCertificateDownloadFile(adminSupabase, pdfInput);

    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `TCC Certificate (Resent) — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName: cert.tcc_applications?.chemicals?.chemical_name || 'N/A',
      pdfBuffer: certFile.buffer,
      pdfFileName: certFile.fileName,
      attachmentContentType: certFile.contentType,
      smtpConfig: buildTccSmtpConfig(settings),
    });

    const now = new Date().toISOString();
    await adminSupabase
      .from('certificates')
      .update({
        mail_resend_count: (cert.mail_resend_count || 0) + 1,
        last_resend_at: now,
        last_resend_by: session.userId,
        mail_sent_history: appendMailSentHistory(cert.mail_sent_history, now),
      })
      .eq('id', certificateId);

    await adminSupabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: session.userId,
      action: 'CERTIFICATE_EMAIL_RESENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `Certificate email resent (${(cert.mail_resend_count || 0) + 1}x)`,
    });

    revalidatePath(`/admin/certificate-preview/${certificateId}`);
    revalidatePath('/admin/approvals');
    revalidatePath(`/admin/clients/${cert.client_id}`);
    return { success: true, message: 'Certificate email resent successfully.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
