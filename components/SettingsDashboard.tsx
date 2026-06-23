'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateAdminProfileSettingsAction,
  updateAdminAuthAction,
  updateTccSmtpSettingsAction,
  updateRcSmtpSettingsAction,
  updateTccNotificationEmailsAction,
} from '@/actions/settings';
import {
  mapRcSmtpFormFromSettings,
  mapTccSmtpFormFromSettings,
  type CertificateSmtpFormData,
} from '@/lib/certificate-smtp-settings';
import { updateTemplateAction } from '@/actions/templates';
import { CertificateTemplateSettingsPanel } from '@/components/CertificateTemplateSettingsPanel';
import {
  resolveRcBranding,
  resolveTccBranding,
  RC_TEMPLATE_KEY,
  type TemplateSettingsRecord,
} from '@/lib/certificate-template-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from '@/store/toast';
import {
  User,
  ShieldAlert,
  Lock,
  Mail,
  Palette,
  FileSignature,
  ShieldCheck,
  Bell,
  FileText,
} from 'lucide-react';

interface SettingsData {
  full_name: string | null;
  mobile_number: string | null;
  email: string | null;
  cc_emails: string | null;
  bcc_emails: string | null;
  timezone: string | null;
  profile_image: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_pass?: string | null;
  smtp_from?: string | null;
  smtp_cc_default?: string | null;
  rc_smtp_host?: string | null;
  rc_smtp_port?: number | null;
  rc_smtp_user?: string | null;
  rc_smtp_pass?: string | null;
  rc_smtp_from?: string | null;
  rc_smtp_cc_default?: string | null;
  tcc_application_notification_emails?: string | null;
}

interface TemplateData extends TemplateSettingsRecord {}

interface SettingsDashboardProps {
  initialSettings: SettingsData | null;
  initialTemplate: TemplateData | null;
}

export default function SettingsDashboard({ initialSettings, initialTemplate }: SettingsDashboardProps) {
  const router = useRouter();
  const rcDefaults = resolveRcBranding(initialTemplate);
  const tccDefaults = resolveTccBranding(initialTemplate);

  const [isProfilePending, startProfileTransition] = useTransition();
  const [isRcTemplatePending, startRcTemplateTransition] = useTransition();
  const [isTccTemplatePending, startTccTemplateTransition] = useTransition();
  const [isAuthPending, startAuthTransition] = useTransition();
  const [isTccSmtpPending, startTccSmtpTransition] = useTransition();
  const [isRcSmtpPending, startRcSmtpTransition] = useTransition();
  const [isNotificationPending, startNotificationTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<
    'profile' | 'rc-template' | 'tcc-template' | 'security' | 'smtp-tcc' | 'smtp-rc' | 'notification-email'
  >('profile');

  // 1. Profile Settings State
  const [profile, setProfile] = useState({
    full_name: initialSettings?.full_name || 'Admin User',
    mobile_number: initialSettings?.mobile_number || '',
    timezone: initialSettings?.timezone || 'UTC',
    cc_emails: initialSettings?.cc_emails || '',
    bcc_emails: initialSettings?.bcc_emails || '',
  });

  const [rcAccentColor, setRcAccentColor] = useState(rcDefaults.accent_color);
  const [rcFooterText, setRcFooterText] = useState(
    rcDefaults.footer_text ||
      'Pharmegic Healthcare Limited\n6th, Floor, Konstitucijos av. 21A, 08130 Vilnius, Lithuania | VAT: LT100012557418\njs@pharmegichealthcarelimited.com | : +37 05 2074005 | www.pharmegichealthcare.com'
  );
  const [rcLogo, setRcLogo] = useState<string | null>(rcDefaults.logo);
  const [rcSignature, setRcSignature] = useState<string | null>(rcDefaults.signature_image);

  const [tccAccentColor, setTccAccentColor] = useState(tccDefaults.accent_color);
  const [tccFooterText, setTccFooterText] = useState(
    tccDefaults.footer_text ||
      'Pharmegic Healthcare Compliance Division. For verification, scan the QR code.'
  );
  const [tccLogo, setTccLogo] = useState<string | null>(tccDefaults.logo);
  const [tccSignature, setTccSignature] = useState<string | null>(tccDefaults.signature_image);

  // 3. Security State
  const [emailUpdate, setEmailUpdate] = useState('');
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });

  // 4. SMTP State (TCC + RC)
  const [tccSmtp, setTccSmtp] = useState<CertificateSmtpFormData>(
    mapTccSmtpFormFromSettings(initialSettings)
  );
  const [rcSmtp, setRcSmtp] = useState<CertificateSmtpFormData>(
    mapRcSmtpFormFromSettings(initialSettings)
  );
  const [notificationEmails, setNotificationEmails] = useState(
    initialSettings?.tcc_application_notification_emails || ''
  );

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'logo' | 'signature',
    scope: 'rc' | 'tcc'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be smaller than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (scope === 'rc') {
          if (type === 'logo') setRcLogo(reader.result);
          else setRcSignature(reader.result);
        } else if (type === 'logo') {
          setTccLogo(reader.result);
        } else {
          setTccSignature(reader.result);
        }
        toast.success(`${type === 'logo' ? 'Logo' : 'Signature'} loaded to preview.`);
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  // Save Handlers
  const handleSaveProfile = () => {
    startProfileTransition(async () => {
      const res = await updateAdminProfileSettingsAction(profile);
      if (res.success) {
        toast.success(res.message || 'Profile settings updated successfully.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update profile settings.');
      }
    });
  };

  const handleSaveRcTemplate = () => {
    if (!initialTemplate?.id) {
      toast.error('RC template record not initialized in database.');
      return;
    }
    startRcTemplateTransition(async () => {
      const res = await updateTemplateAction(initialTemplate.id, {
        rc_template_key: RC_TEMPLATE_KEY,
        rc_logo: rcLogo,
        rc_signature_image: rcSignature,
        rc_accent_color: rcAccentColor,
        rc_footer_text: rcFooterText,
      });
      if (res.success) {
        toast.success(res.message || 'RC template settings updated.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update RC template.');
      }
    });
  };

  const handleSaveTccTemplate = () => {
    if (!initialTemplate?.id) {
      toast.error('TCC template record not initialized in database.');
      return;
    }
    startTccTemplateTransition(async () => {
      const res = await updateTemplateAction(initialTemplate.id, {
        tcc_template_key: 'template_1',
        tcc_logo: tccLogo,
        tcc_signature_image: tccSignature,
        tcc_accent_color: tccAccentColor,
        tcc_footer_text: tccFooterText,
      });
      if (res.success) {
        toast.success(res.message || 'TCC template settings updated.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update TCC template.');
      }
    });
  };

  const handleUpdateEmail = () => {
    if (!emailUpdate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailUpdate)) {
      toast.error('Please enter a valid new email address.');
      return;
    }
    startAuthTransition(async () => {
      const res = await updateAdminAuthAction({ email: emailUpdate });
      if (res.success) {
        toast.success(res.message || 'Verification link sent to new email.');
        setEmailUpdate('');
      } else {
        toast.error(res.error || 'Failed to update email.');
      }
    });
  };

  const handleUpdatePassword = () => {
    if (passwordForm.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    startAuthTransition(async () => {
      const res = await updateAdminAuthAction({ password: passwordForm.password });
      if (res.success) {
        toast.success(res.message || 'Password successfully updated.');
        setPasswordForm({ password: '', confirmPassword: '' });
      } else {
        toast.error(res.error || 'Failed to update password.');
      }
    });
  };

  const handleResetRcTemplate = () => {
    setRcAccentColor('#064e3b');
    setRcFooterText('Pharmegic Healthcare Compliance Division. For verification, scan the QR code.');
    setRcLogo(null);
    setRcSignature(null);
    toast.info('RC template inputs reset to defaults.');
  };

  const handleResetTccTemplate = () => {
    setTccAccentColor('#064e3b');
    setTccFooterText('Pharmegic Healthcare Compliance Division. For verification, scan the QR code.');
    setTccLogo(null);
    setTccSignature(null);
    toast.info('TCC template inputs reset to defaults.');
  };

  const handleSaveTccSmtp = () => {
    startTccSmtpTransition(async () => {
      const res = await updateTccSmtpSettingsAction({
        smtp_host: tccSmtp.smtp_host,
        smtp_port: Number(tccSmtp.smtp_port),
        smtp_user: tccSmtp.smtp_user,
        smtp_pass: tccSmtp.smtp_pass,
        smtp_from: tccSmtp.smtp_from,
        smtp_cc_default: tccSmtp.smtp_cc_default,
      });
      if (res.success) {
        toast.success(res.message || 'TCC SMTP settings saved.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to save TCC SMTP settings.');
      }
    });
  };

  const handleSaveRcSmtp = () => {
    startRcSmtpTransition(async () => {
      const res = await updateRcSmtpSettingsAction({
        smtp_host: rcSmtp.smtp_host,
        smtp_port: Number(rcSmtp.smtp_port),
        smtp_user: rcSmtp.smtp_user,
        smtp_pass: rcSmtp.smtp_pass,
        smtp_from: rcSmtp.smtp_from,
        smtp_cc_default: rcSmtp.smtp_cc_default,
      });
      if (res.success) {
        toast.success(res.message || 'RC SMTP settings saved.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to save RC SMTP settings.');
      }
    });
  };

  const handleSaveNotificationEmails = () => {
    startNotificationTransition(async () => {
      const res = await updateTccNotificationEmailsAction({
        tcc_application_notification_emails: notificationEmails,
      });
      if (res.success) {
        toast.success(res.message || 'Notification emails saved.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to save notification emails.');
      }
    });
  };

  const renderSmtpFields = (
    smtp: CertificateSmtpFormData,
    setSmtp: React.Dispatch<React.SetStateAction<CertificateSmtpFormData>>
  ) => (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <div className="md:col-span-2">
        <Input
          label="SMTP Host"
          placeholder="smtp.gmail.com"
          value={smtp.smtp_host}
          onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })}
        />
      </div>
      <Input
        label="SMTP Port"
        type="number"
        placeholder="587"
        value={String(smtp.smtp_port)}
        onChange={(e) => setSmtp({ ...smtp, smtp_port: Number(e.target.value) })}
      />
      <Input
        label="SMTP Username"
        placeholder="smtp@company.com"
        value={smtp.smtp_user}
        onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })}
      />
      <Input
        type="password"
        label="SMTP Password"
        placeholder="••••••••"
        value={smtp.smtp_pass}
        onChange={(e) => setSmtp({ ...smtp, smtp_pass: e.target.value })}
      />
      <Input
        type="email"
        label="From Email Address"
        placeholder="noreply@pharmegic.com"
        value={smtp.smtp_from}
        onChange={(e) => setSmtp({ ...smtp, smtp_from: e.target.value })}
      />
      <Input
        type="email"
        label="Default CC Email (Admin)"
        placeholder="admin@company.com"
        value={smtp.smtp_cc_default}
        onChange={(e) => setSmtp({ ...smtp, smtp_cc_default: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Portal Configuration Settings</h1>
        <p className="text-sm text-slate-500 font-medium">
          Manage admin profile, RC/TCC certificate templates, security credentials, and compliance alerts.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Navigation Tabs (Left Sidebar) */}
        <div className="flex gap-2 w-full md:w-56 shrink-0 bg-white border border-slate-100 p-2.5 rounded-xl shadow-xs overflow-x-auto md:overflow-visible md:flex-col [scrollbar-width:thin]">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'profile'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <User className="h-4.5 w-4.5" />
            Profile Settings
          </button>
          <button
            onClick={() => setActiveTab('rc-template')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'rc-template'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileText className="h-4.5 w-4.5" />
            RC Template
          </button>
          <button
            onClick={() => setActiveTab('tcc-template')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'tcc-template'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Palette className="h-4.5 w-4.5" />
            TCC Template
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'security'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Lock className="h-4.5 w-4.5" />
            Security &amp; Login
          </button>
          <button
            onClick={() => setActiveTab('smtp-tcc')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'smtp-tcc'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileSignature className="h-4.5 w-4.5" />
            TCC Email SMTP
          </button>
          <button
            onClick={() => setActiveTab('smtp-rc')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'smtp-rc'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="h-4.5 w-4.5" />
            RC Email SMTP
          </button>
          <button
            onClick={() => setActiveTab('notification-email')}
            className={`flex shrink-0 md:shrink items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-bold text-left cursor-pointer transition-all whitespace-nowrap md:whitespace-normal ${
              activeTab === 'notification-email'
                ? 'bg-primary text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Bell className="h-4.5 w-4.5" />
            Notification Email
          </button>
        </div>

        {/* Workspace Panels (Right Content) */}
        <div className="flex-1 w-full space-y-6">
          {/* TAB 1: PROFILE SETTINGS */}
          {activeTab === 'profile' && (
            <Card className="border-slate-100 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <User className="h-5 w-5" />
                  <CardTitle>Administrative Profile</CardTitle>
                </div>
                <CardDescription>Configure contact details and notification email preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  <Input
                    label="Administrator Name"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  />
                  <Input
                    label="Mobile Number"
                    placeholder="+91 XXXXX XXXXX"
                    value={profile.mobile_number}
                    onChange={(e) => setProfile({ ...profile, mobile_number: e.target.value })}
                  />
                  <Input
                    label="CC Notifications Email"
                    placeholder="cc@company.com"
                    value={profile.cc_emails}
                    onChange={(e) => setProfile({ ...profile, cc_emails: e.target.value })}
                  />
                  <Input
                    label="BCC Notifications Email"
                    placeholder="bcc@company.com"
                    value={profile.bcc_emails}
                    onChange={(e) => setProfile({ ...profile, bcc_emails: e.target.value })}
                  />
                  <Input
                    label="Timezone Preference"
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  />
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button onClick={handleSaveProfile} isLoading={isProfilePending} disabled={isProfilePending}>
                    Save Profile Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'rc-template' && (
            <CertificateTemplateSettingsPanel
              title="RC Certificate Template"
              description="Manage EU REACH certificate branding, logo, signature, and theme colors."
              certificateType="rc"
              accentColor={rcAccentColor}
              onAccentColorChange={setRcAccentColor}
              footerText={rcFooterText}
              onFooterTextChange={setRcFooterText}
              logo={rcLogo}
              signature={rcSignature}
              onFileChange={(event, type) => handleFileChange(event, type, 'rc')}
              onClearLogo={() => setRcLogo(null)}
              onClearSignature={() => setRcSignature(null)}
              onSave={handleSaveRcTemplate}
              onReset={handleResetRcTemplate}
              isPending={isRcTemplatePending}
            />
          )}

          {activeTab === 'tcc-template' && (
            <CertificateTemplateSettingsPanel
              title="TCC Certificate Template"
              description="Manage Tonnage Compliance Certificate branding, logo, signature, and theme colors."
              certificateType="tcc"
              accentColor={tccAccentColor}
              onAccentColorChange={setTccAccentColor}
              footerText={tccFooterText}
              onFooterTextChange={setTccFooterText}
              logo={tccLogo}
              signature={tccSignature}
              onFileChange={(event, type) => handleFileChange(event, type, 'tcc')}
              onClearLogo={() => setTccLogo(null)}
              onClearSignature={() => setTccSignature(null)}
              onSave={handleSaveTccTemplate}
              onReset={handleResetTccTemplate}
              isPending={isTccTemplatePending}
            />
          )}

          {/* TAB 3: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Email Change */}
              <Card className="border-slate-100 shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-2 text-primary">
                    <Mail className="h-5 w-5" />
                    <CardTitle>Update Registered Email</CardTitle>
                  </div>
                  <CardDescription>Change your admin account login and contact email address.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-w-md">
                    <Input
                      type="email"
                      label="New Email Address"
                      placeholder="admin@newemail.com"
                      value={emailUpdate}
                      onChange={(e) => setEmailUpdate(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <Button onClick={handleUpdateEmail} isLoading={isAuthPending} disabled={isAuthPending}>
                      Update Login Email
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Password Change */}
              <Card className="border-slate-100 shadow-xs">
                <CardHeader>
                  <div className="flex items-center gap-2 text-primary">
                    <Lock className="h-5 w-5" />
                    <CardTitle>Change Password</CardTitle>
                  </div>
                  <CardDescription>Update your login credentials. Must be at least 6 characters.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 max-w-2xl">
                    <Input
                      type="password"
                      label="New Password"
                      placeholder="••••••••"
                      value={passwordForm.password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    />
                    <Input
                      type="password"
                      label="Confirm Password"
                      placeholder="••••••••"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <Button onClick={handleUpdatePassword} isLoading={isAuthPending} disabled={isAuthPending}>
                      Update Account Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          {/* TAB 4: TCC SMTP */}
          {activeTab === 'smtp-tcc' && (
            <Card className="border-slate-100 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <FileSignature className="h-5 w-5" />
                  <CardTitle>TCC Certificate Email SMTP</CardTitle>
                </div>
                <CardDescription>
                  SMTP used when sending Tonnage Compliance Certificate (TCC) emails to clients.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-semibold text-amber-700">
                  Used only for TCC certificate delivery. Separate from RC certificate email settings.
                </div>
                {renderSmtpFields(tccSmtp, setTccSmtp)}
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button
                    onClick={handleSaveTccSmtp}
                    isLoading={isTccSmtpPending}
                    disabled={isTccSmtpPending}
                  >
                    Save TCC SMTP Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 5: RC SMTP */}
          {activeTab === 'smtp-rc' && (
            <Card className="border-slate-100 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                  <CardTitle>RC Certificate Email SMTP</CardTitle>
                </div>
                <CardDescription>
                  SMTP used when sending REACH Compliance Certificate (RC) emails to clients.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs font-semibold text-teal-800">
                  Used only for RC certificate delivery. Configure independently from TCC SMTP.
                </div>
                {renderSmtpFields(rcSmtp, setRcSmtp)}
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button
                    onClick={handleSaveRcSmtp}
                    isLoading={isRcSmtpPending}
                    disabled={isRcSmtpPending}
                  >
                    Save RC SMTP Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 6: TCC APPLICATION NOTIFICATION */}
          {activeTab === 'notification-email' && (
            <Card className="border-slate-100 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <Bell className="h-5 w-5" />
                  <CardTitle>TCC Application Notification Email</CardTitle>
                </div>
                <CardDescription>
                  Email address(es) that receive an alert when a client submits a new TCC application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs font-semibold text-blue-800">
                  Notifications are sent using your TCC Email SMTP settings. Add one or more addresses
                  separated by commas. Leave empty to disable email alerts (in-app notifications still work).
                </div>
                <Input
                  label="Notification Email(s)"
                  placeholder="compliance@company.com, admin@company.com"
                  value={notificationEmails}
                  onChange={(e) => setNotificationEmails(e.target.value)}
                />
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button
                    onClick={handleSaveNotificationEmails}
                    isLoading={isNotificationPending}
                    disabled={isNotificationPending}
                  >
                    Save Notification Emails
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
