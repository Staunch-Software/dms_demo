import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import type { UserItem, UserSitePermissionItem } from '../types/ui';
import { dmsBtn, dmsControlStyle } from '../dmsDesignSystem';
import { clay } from '../clayTheme';

export interface IUserFormModalProps {
  host: VesselEmail;
  user: UserItem | null; // null for Create, user object for Edit
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface IModuleOption {
  id: string;
  label: string;
  iconName: string;
  description: string;
  category: 'core' | 'operations' | 'tools' | 'admin';
}

const ALL_MODULES: IModuleOption[] = [
  { id: 'dashboard',    label: 'Dashboard',           iconName: 'Home',          description: 'Fleet metrics, summary cards, and quick vessel links', category: 'core' },
  { id: 'list',         label: 'Vessel DMS',          iconName: 'Documentation', description: 'Folder taxonomy, monthly vessel documents & search', category: 'core' },
  { id: 'classic_site', label: 'Documents Library',   iconName: 'DocLibrary',    description: 'Direct SharePoint document library viewer',          category: 'core' },
  { id: 'sites',        label: 'Sites',               iconName: 'SharepointLogo',description: 'SharePoint site provisioning & multi-site registry', category: 'operations' },
  { id: 'vessels',      label: 'Vessels',             iconName: 'Ferry',         description: 'Vessel fleet profiles, particulars, and checklists',  category: 'operations' },
  { id: 'certificates', label: 'Certificates',        iconName: 'Certificate',   description: 'Class & Flag statutory certificates tracking matrix', category: 'operations' },
  { id: 'reports',      label: 'Reports',             iconName: 'ExcelDocument', description: 'Fleet audit logs, compliance & document report exports', category: 'operations' },
  { id: 'migration',    label: 'Migration Assistant', iconName: 'MoveToFolder',  description: 'SharePoint folder sync & document tagging assistant', category: 'tools' },
  { id: 'bento_email',  label: 'Send Email',          iconName: 'Send',          description: 'AI Bento vessel email dispatcher & audit logs',      category: 'tools' },
  { id: 'recycle',      label: 'Recycle Bin',         iconName: 'RecycleBin',    description: 'Recover or permanently purge deleted vessel documents', category: 'tools' },
  { id: 'archive',      label: 'Archive',             iconName: 'Archive',       description: 'Long-term vessel document archive & historical records', category: 'tools' },
  { id: 'settings',     label: 'Settings',            iconName: 'Settings',      description: 'System-wide configuration and technical preferences', category: 'admin' },
];

const ALL_SETTINGS_TABS = [
  'Tag Configuration',
  'Module Management',
  'Color Management',
  'Audit Logs',
];

export const UserFormModal: React.FC<IUserFormModalProps> = ({ host, user, isOpen, onClose, onSuccess }) => {
  const isEdit = Boolean(user);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  // SSO = Microsoft sign-in only (no password); PASSWORD = User ID + password only.
  const [loginMethod, setLoginMethod] = React.useState<'SSO' | 'PASSWORD'>('SSO');
  const [role, setRole] = React.useState<'Admin' | 'User'>('User');
  const [isActive, setIsActive] = React.useState(true);
  const [allowedModules, setAllowedModules] = React.useState<string[]>([]);
  const [allowedSettingsTabs, setAllowedSettingsTabs] = React.useState<string[]>([]);
  const [sitePermissions, setSitePermissions] = React.useState<UserSitePermissionItem[]>([]);
  const [selectedSiteToAdd, setSelectedSiteToAdd] = React.useState('');
  const [canApproveCertificates, setCanApproveCertificates] = React.useState<boolean>(false);
  const [assignedVessels, setAssignedVessels] = React.useState<string[]>(['ALL']);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  interface IAppConfirmDialog {
    isOpen: boolean;
    title: string;
    message: string;
    tone?: 'danger' | 'warning' | 'success' | 'info';
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }

  const [confirmDialog, setConfirmDialog] = React.useState<IAppConfirmDialog | null>(null);

  const showCustomAlert = (title: string, message: string, tone: 'warning' | 'danger' | 'info' = 'warning'): void => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      tone,
      confirmText: 'OK',
      cancelText: '',
      onConfirm: () => setConfirmDialog(null),
    });
  };

  const showCustomConfirm = (
    title: string,
    message: string,
    confirmText: string,
    tone: 'danger' | 'warning' | 'info' | 'success',
    onConfirmAction: () => void
  ): void => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      tone,
      confirmText,
      cancelText: 'Cancel',
      onConfirm: () => {
        setConfirmDialog(null);
        onConfirmAction();
      },
    });
  };

  // Initialize form when modal opens or user changes
  React.useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setPassword('');
    setShowPassword(false);
    setSelectedSiteToAdd('');

    setLoginMethod(user && user.login_method === 'PASSWORD' ? 'PASSWORD' : 'SSO');

    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      const userRole = user.role || 'User';
      setRole(userRole);
      setIsActive(user.status === 'Active');
      setAllowedModules(
        Array.isArray(user.allowed_modules)
          ? [...user.allowed_modules]
          : (userRole === 'Admin' ? ALL_MODULES.map(m => m.id) : ['dashboard', 'list', 'vessels', 'certificates', 'reports', 'bento_email'])
      );
      setAllowedSettingsTabs(
        Array.isArray(user.allowed_settings_tabs)
          ? [...user.allowed_settings_tabs]
          : (userRole === 'Admin' ? [...ALL_SETTINGS_TABS] : ['Color Management'])
      );
      setSitePermissions(Array.isArray(user.permissions) ? user.permissions.map(p => ({ ...p })) : []);
      setCanApproveCertificates(Boolean(user.can_approve_certificates));
      setAssignedVessels(
        Array.isArray(user.assigned_vessels) && user.assigned_vessels.length > 0
          ? [...user.assigned_vessels]
          : ['ALL']
      );
    } else {
      setName('');
      setEmail('');
      setRole('User');
      setIsActive(true);
      // Default modules for new user: core + operations (no settings)
      setAllowedModules(['dashboard', 'list', 'vessels', 'certificates', 'reports', 'bento_email']);
      setAllowedSettingsTabs(['Color Management']);
      setSitePermissions([]);
      setCanApproveCertificates(false);
      setAssignedVessels(['ALL']);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const allAvailableVessels: string[] = React.useMemo(() => {
    const list: string[] = (host.state.vessels || [])
      .map(v => (v.name || '').trim())
      .filter(Boolean);
    return (Array.from(new Set(list)) as string[]).sort((a: string, b: string) => a.localeCompare(b));
  }, [host.state.vessels]);

  const knownSites = (host.state.documentSites || []).map(s => ({
    key: s.site_key || s.site_id || '',
    label: s.sp_site_name || s.site_key || s.site_id || '',
  })).filter(s => s.key);

  const handleGeneratePassword = (): void => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let generated = 'Vessel#';
    for (let i = 0; i < 6; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
    setShowPassword(true);
  };

  const handleRoleChange = (newRole: 'Admin' | 'User'): void => {
    setRole(newRole);
    if (newRole === 'Admin') {
      // When Admin is selected: select entire modules list on the right and all settings tabs
      setAllowedModules(ALL_MODULES.map(m => m.id));
      setAllowedSettingsTabs([...ALL_SETTINGS_TABS]);
    } else {
      // For standard User: select default operational modules, exclude settings, default settings tab to Color Management only
      setAllowedModules(['dashboard', 'list', 'classic_site', 'vessels', 'certificates', 'reports', 'bento_email']);
      setAllowedSettingsTabs(['Color Management']);
    }
  };

  const currentAdminEmail = (host.state.customUserEmail || host.props.userEmail || '').toLowerCase();
  const isSelf = Boolean(isEdit && user && user.email.toLowerCase() === currentAdminEmail);

  const handleToggleActiveDirectly = (): void => {
    if (isSelf && isActive) {
      showCustomAlert(
        'Action Prohibited',
        'You cannot deactivate your own admin account while logged in.',
        'warning'
      );
      return;
    }
    const cleanEmail = ((isEdit && user ? user.email : email) || '').trim().toLowerCase();
    if (!cleanEmail) return;

    const nextActive = !isActive;
    const actionText = nextActive ? 'activate' : 'deactivate';
    const title = nextActive ? 'Reactivate User Account' : 'Deactivate User Account';
    const message = nextActive
      ? `Are you sure you want to reactivate ${name || cleanEmail}? The user will be able to log in to the DMS again.`
      : `Are you sure you want to deactivate ${name || cleanEmail}? The user will be logged out immediately and will not be able to log in until reactivated.`;

    showCustomConfirm(
      title,
      message,
      nextActive ? 'Activate User' : 'Deactivate User',
      nextActive ? 'success' : 'danger',
      () => {
        void (async () => {
          setIsSubmitting(true);
          setErrorMessage(null);
          try {
            const res = await host._updateUser(cleanEmail, { is_active: nextActive });
            if (!res.success) {
              showCustomAlert(
                'Operation Failed',
                `Could not ${actionText} user: ${res.error || 'Unknown error'}`,
                'danger'
              );
            } else {
              setIsActive(nextActive);
              onSuccess();
              onClose();
            }
          } catch (err: any) {
            showCustomAlert(
              'Error',
              `Could not ${actionText} user: ${err?.message || err}`,
              'danger'
            );
          } finally {
            setIsSubmitting(false);
          }
        })();
      }
    );
  };

  const toggleModule = (modId: string): void => {
    setAllowedModules(prev => {
      const isCurrentlyEnabled = prev.indexOf(modId) !== -1;
      let next: string[];
      if (isCurrentlyEnabled) {
        next = prev.filter(id => id !== modId);
      } else {
        next = [...prev, modId];
      }

      // Settings module toggle handling:
      if (modId === 'settings') {
        if (!isCurrentlyEnabled) {
          // Enabling settings:
          // Admin gets all tabs, User gets ONLY Color Management by default
          setAllowedSettingsTabs(role === 'Admin' ? [...ALL_SETTINGS_TABS] : ['Color Management']);
        } else {
          // Disabling settings: reset settings tabs
          setAllowedSettingsTabs([]);
        }
      }
      return next;
    });
  };

  const toggleSettingsTab = (tabName: string): void => {
    setAllowedSettingsTabs(prev => {
      if (prev.indexOf(tabName) !== -1) {
        return prev.filter(t => t !== tabName);
      }
      return [...prev, tabName];
    });
  };

  const handleClearModules = (): void => {
    setAllowedModules([]);
    setAllowedSettingsTabs([]);
  };

  // Site permission management
  const addSite = (siteKey: string): void => {
    if (!siteKey || sitePermissions.some(p => p.site_key === siteKey)) return;
    setSitePermissions([...sitePermissions, { site_key: siteKey, can_view: true, can_upload: false, can_tag_on_upload: false }]);
    setSelectedSiteToAdd('');
  };

  const removeSite = (siteKey: string): void => {
    setSitePermissions(sitePermissions.filter(p => p.site_key !== siteKey));
  };

  const updateSiteRow = (siteKey: string, patch: Partial<UserSitePermissionItem>): void => {
    setSitePermissions(prev => prev.map(p => {
      if (p.site_key !== siteKey) return p;
      const updated = { ...p, ...patch };
      if (!updated.can_view) { updated.can_upload = false; updated.can_tag_on_upload = false; }
      if (!updated.can_upload) { updated.can_tag_on_upload = false; }
      return updated;
    }));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || cleanEmail.indexOf('@') === -1) {
      setErrorMessage('Please enter a valid email address / User ID.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Please enter the user full name.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        const payload: any = {
          display_name: name.trim(),
          role,
          is_active: isActive,
          allowed_modules: allowedModules,
          allowed_settings_tabs: allowedSettingsTabs,
          site_permissions: sitePermissions,
          assigned_vessels: assignedVessels,
          can_approve_certificates: canApproveCertificates,
        };
        if (password && password.trim()) {
          payload.password = password.trim();
        }
        const res = await host._updateUser(cleanEmail, payload);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to update user.');
          return;
        }
      } else {
        const payload = {
          email: cleanEmail,
          display_name: name.trim(),
          login_method: loginMethod,
          send_invite: true,
          role,
          is_active: isActive,
          allowed_modules: allowedModules,
          allowed_settings_tabs: allowedSettingsTabs,
          site_permissions: sitePermissions,
          assigned_vessels: assignedVessels,
          can_approve_certificates: canApproveCertificates,
        };
        const res = await host._createUser(payload);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to create user.');
          return;
        }
        if (isActive && !res.inviteSent) {
          // The user exists; only the email failed. The user row shows the error and offers "Resend invite".
          alert('User created, but the invitation email could not be sent: ' + (res.inviteError || 'unknown error') + '\n\nUse "Resend invite" on the user row once this is fixed.');
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while saving user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSettingsModule = allowedModules.indexOf('settings') !== -1;

  return (
    <div
      className="user-form-modal-i1" style={{ position: 'fixed', zIndex: 100000, background: 'rgba(2, 6, 23, 0.65)' }}
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="user-form-modal-i2" style={{ width: '100%', background: 'var(--vdms-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div
          className="user-form-modal-i3"
        >
          <div className="user-form-modal-i4">
            <div
              className="user-form-modal-i5" style={{ borderRadius: 8, background: 'rgba(14, 116, 144, 0.15)', color: clay.accent }}
            >
              <Icon iconName={isEdit ? 'ContactInfo' : 'AddFriend'} className="user-form-modal-i6" />
            </div>
            <div>
              <h3 className="user-form-modal-i7">
                {isEdit ? 'Edit User Permissions' : 'Create New User'}
              </h3>
              <p className="user-form-modal-i8">
                {isEdit
                  ? `Update identity, permitted modules, and SharePoint site access for ${user?.email}`
                  : 'Add a new user, assign their accessible application modules, and set permissions.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="user-form-modal-i9" style={{ borderRadius: 6 }}
          >
            <Icon iconName="Cancel" className="user-form-modal-i10" />
          </button>
        </div>

        {/* ── Modal Body: 2-Column Split Layout ── */}
        <form onSubmit={handleSubmit} className="user-form-modal-i11">
          {errorMessage && (
            <div
              className="user-form-modal-i12" style={{ borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}
            >
              <Icon iconName="ErrorBadge" className="user-form-modal-i13" />
              <span className="user-form-modal-i14">{errorMessage}</span>
            </div>
          )}

          <div
            className="user-form-modal-i15"
          >
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* ── LEFT COLUMN: User Credentials & Identity ── */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div className="user-form-modal-i16">
              <div className="user-form-modal-i17">
                <span className="user-form-modal-i18">
                  1. User Information & Credentials
                </span>
              </div>

              {/* Full Name */}
              <div>
                <label className="user-form-modal-i19">
                  Full Name <span className="user-form-modal-i20">*</span>
                </label>
                <div className="user-form-modal-i21">
                  <Icon iconName="Contact" className="user-form-modal-i22" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chief Officer Tanaka"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={{ ...dmsControlStyle(), padding: '6px 10px 6px 32px', width: '100%', boxSizing: 'border-box', fontSize: 12.5 }}
                  />
                </div>
              </div>

              {/* Email / User ID */}
              <div>
                <label className="user-form-modal-i19">
                  User ID / Email Address <span className="user-form-modal-i20">*</span>
                </label>
                <div className="user-form-modal-i21">
                  <Icon iconName="Mail" className="user-form-modal-i22" />
                  <input
                    type="email"
                    required
                    disabled={isEdit}
                    placeholder="e.g. tanaka@ozellarmarine.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{
                      ...dmsControlStyle(),
                      padding: '6px 10px 6px 32px',
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 12.5,
                      opacity: isEdit ? 0.75 : 1,
                      cursor: isEdit ? 'not-allowed' : 'text',
                    }}
                  />
                </div>
              </div>

              {/* Login method: Microsoft SSO (no password) or User ID + password */}
              <div>
                <div className="user-form-modal-i23">
                  <label className="user-form-modal-i24">Login method</label>
                </div>
                {isEdit ? (
                  <div style={{ fontSize: 12.5, color: 'var(--vdms-text-muted)' }}>
                    {loginMethod === 'SSO' ? 'Microsoft SSO: signs in with their Microsoft account, no password.' : 'User ID and password.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="radio" name="login-method" checked={loginMethod === 'SSO'} onChange={() => setLoginMethod('SSO')} />
                      <span><b>Microsoft SSO</b>: no password. The email must belong to your Microsoft tenant (checked when you save).</span>
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="radio" name="login-method" checked={loginMethod === 'PASSWORD'} onChange={() => setLoginMethod('PASSWORD')} />
                      <span><b>User ID and password</b>: the user gets an email with a one-time link (valid 24 hours) to choose their own password.</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Reset password: only when editing a user who signs in with a password */}
              {isEdit && loginMethod === 'PASSWORD' && (
              <div>
                <div className="user-form-modal-i23">
                  <label className="user-form-modal-i24">Reset Password (optional)</label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="user-form-modal-i25" style={{ color: clay.accent }}
                  >
                    Generate Random
                  </button>
                </div>
                <div className="user-form-modal-i21">
                  <Icon iconName="Lock" className="user-form-modal-i22" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Leave blank to keep existing password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...dmsControlStyle(), padding: '6px 34px 6px 32px', width: '100%', boxSizing: 'border-box', fontSize: 12.5 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="user-form-modal-i26"
                  >
                    <Icon iconName={showPassword ? 'Hide' : 'RedEye'} className="user-form-modal-i27" />
                  </button>
                </div>
              </div>
              )}

              {/* ── Certificate Automation & 1st-Level Approval ── */}
              <div
                className="user-form-modal-i28" style={{ borderRadius: 8, background: canApproveCertificates ? 'rgba(22, 163, 74, 0.04)' : 'var(--vdms-surface-alt)' }}
              >
                <div className="user-form-modal-i29">
                  <div className="user-form-modal-i30">
                    <Icon
                      iconName="Certificate"
                      className="user-form-modal-i31" style={{ color: canApproveCertificates ? '#16a34a' : 'var(--vdms-text-muted)' }}
                    />
                    <span className="user-form-modal-i32">
                      Certificate Approver (1st-Level Review)
                    </span>
                  </div>
                  {/* Yes/No switch */}
                  <div
                    className="user-form-modal-i33" style={{ border: '1px solid #cbd5e1' }}
                  >
                    <button
                      type="button"
                      onClick={() => setCanApproveCertificates(true)}
                      className="user-form-modal-i34" style={{ background: canApproveCertificates ? '#16a34a' : '#f8fafc', color: canApproveCertificates ? '#ffffff' : '#64748b' }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanApproveCertificates(false)}
                      className="user-form-modal-i34" style={{ background: !canApproveCertificates ? '#64748b' : '#f8fafc', color: !canApproveCertificates ? '#ffffff' : '#64748b' }}
                    >
                      No
                    </button>
                  </div>
                </div>

                <div className="user-form-modal-i35">
                  {canApproveCertificates
                    ? 'Designated 1st-level approver. Receives certificate approval emails with 1-click Approve / Reject buttons for fleet certificate uploads before they are forwarded to AI BANTO.'
                    : 'Standard user. Cannot approve certificates or receive 1st-level approval request emails.'}
                </div>
              </div>

              {/* Role & Status (Side by Side) */}
              <div className="user-form-modal-i36">
                <div>
                  <label className="user-form-modal-i19">
                    User Role
                  </label>
                  <select
                    value={role}
                    onChange={e => handleRoleChange(e.target.value as 'Admin' | 'User')}
                    style={{ ...dmsControlStyle(), padding: '6px 8px', width: '100%', boxSizing: 'border-box', fontSize: 12.5 }}
                  >
                    <option value="User">User (Standard)</option>
                    <option value="Admin">Admin (Full Access)</option>
                  </select>
                </div>
                <div>
                  <label className="user-form-modal-i19">
                    Account Status
                  </label>
                  <select
                    value={isActive ? 'active' : 'inactive'}
                    disabled={isSelf && isActive}
                    title={isSelf && isActive ? 'You cannot deactivate your own admin account' : undefined}
                    onChange={e => {
                      const next = e.target.value === 'active';
                      if (!next && isSelf) {
                        showCustomAlert(
                          'Action Prohibited',
                          'You cannot deactivate your own admin account while logged in.',
                          'warning'
                        );
                        return;
                      }
                      if (!next) {
                        showCustomConfirm(
                          'Deactivate Account',
                          `Setting status to Inactive will disable login access for ${name || (user?.email || 'this user')}. Are you sure you want to deactivate?`,
                          'Deactivate',
                          'danger',
                          () => setIsActive(false)
                        );
                      } else {
                        setIsActive(true);
                      }
                    }}
                    style={{
                      ...dmsControlStyle(),
                      padding: '6px 8px',
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isActive ? '#16a34a' : '#dc2626',
                    }}
                  >
                    <option value="active" className="user-form-modal-i37">Active (Enabled)</option>
                    <option value="inactive" className="user-form-modal-i38">Inactive (Deactivated)</option>
                  </select>
                </div>
              </div>

              {/* SharePoint Site Access Section */}
              <div className="user-form-modal-i39">
                {role === 'Admin' ? (
                  /* Admin Fleet Sites Access Card */
                  <div className="user-form-modal-i40">
                    <div className="user-form-modal-i41">
                      <div className="user-form-modal-i30">
                        <span className="user-form-modal-i32">
                          SharePoint Site Permissions
                        </span>
                        <span className="user-form-modal-i42" style={{ background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a' }}>
                          Full Fleet Access (Admin)
                        </span>
                      </div>
                      <span className="user-form-modal-i43">
                        {knownSites.length} Fleet Sites Active
                      </span>
                    </div>

                    <div className="user-form-modal-i35">
                      Admin accounts automatically inherit full access across all fleet SharePoint document libraries.
                    </div>

                    <div
                      className="user-form-modal-i44" style={{ borderRadius: 8 }}
                    >
                      {knownSites.length > 0 ? (
                        knownSites.map(s => (
                          <div
                            key={s.key}
                            className="user-form-modal-i45" style={{ background: 'var(--vdms-surface)', borderRadius: 6 }}
                          >
                            <Icon iconName="SharepointLogo" className="user-form-modal-i46" />
                            <span className="user-form-modal-i47">
                              {s.label}
                            </span>
                            <span className="user-form-modal-i48">
                              <Icon iconName="CheckMark" className="user-form-modal-i49" /> Full Access
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="user-form-modal-i50">
                          All SharePoint fleet sites provisioned in the system will automatically be fully accessible to this administrator.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Standard User Site Assignment Panel */
                  <div className="user-form-modal-i40">
                    <div className="user-form-modal-i41">
                      <span className="user-form-modal-i32">
                        SharePoint Site Permissions
                      </span>
                      <span className="user-form-modal-i43">
                        {sitePermissions.length} of {knownSites.length} assigned
                      </span>
                    </div>

                    <div className="user-form-modal-i51">
                      <select
                        value={selectedSiteToAdd}
                        onChange={e => setSelectedSiteToAdd(e.target.value)}
                        style={{ ...dmsControlStyle(), padding: '5px 8px', flex: 1, fontSize: 12 }}
                      >
                        <option value="">Select a site to grant access...</option>
                        {knownSites
                          .filter(s => !sitePermissions.some(p => p.site_key === s.key))
                          .map(s => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedSiteToAdd}
                        onClick={() => addSite(selectedSiteToAdd)}
                        style={{ ...dmsBtn('secondary', Boolean(selectedSiteToAdd)), padding: '5px 10px', fontSize: 12 }}
                      >
                        + Add Site
                      </button>
                      {knownSites.length > sitePermissions.length && (
                        <button
                          type="button"
                          onClick={() => {
                            const allSites = knownSites.map(s => ({ site_key: s.key, can_view: true, can_upload: false, can_tag_on_upload: false }));
                            setSitePermissions(allSites);
                          }}
                          style={{ ...dmsBtn('secondary', true), padding: '5px 8px', fontSize: 11 }}
                          title="Assign all available sites"
                        >
                          Grant All
                        </button>
                      )}
                    </div>

                    <div
                      className="user-form-modal-i44" style={{ borderRadius: 8 }}
                    >
                      {sitePermissions.length === 0 ? (
                        <div className="user-form-modal-i52">
                          <Icon iconName="SharepointLogo" className="user-form-modal-i53" style={{ opacity: 0.5 }} />
                          <span>No specific sites assigned yet. Select a site above or click &quot;Grant All&quot; to permit access to vessel document libraries.</span>
                        </div>
                      ) : (
                        sitePermissions.map(p => (
                          <div
                            key={p.site_key}
                            className="user-form-modal-i54" style={{ background: 'var(--vdms-surface)', borderRadius: 6 }}
                          >
                            <span className="user-form-modal-i47">
                              {knownSites.find(s => s.key === p.site_key)?.label || p.site_key}
                            </span>
                            <label className="user-form-modal-i55">
                              <input type="checkbox" checked={p.can_view} onChange={e => updateSiteRow(p.site_key, { can_view: e.target.checked })} style={{ accentColor: clay.accent }} />
                              View
                            </label>
                            <label className="user-form-modal-i55">
                              <input type="checkbox" checked={p.can_upload} disabled={!p.can_view} onChange={e => updateSiteRow(p.site_key, { can_upload: e.target.checked })} style={{ accentColor: clay.accent }} />
                              Upload
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSite(p.site_key)}
                              className="user-form-modal-i56"
                              title="Remove site access"
                            >
                              <Icon iconName="Delete" className="user-form-modal-i57" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* ── RIGHT COLUMN: Module Access Permissions ── */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div
              className="user-form-modal-i58"
            >
              <div className="user-form-modal-i41">
                <div>
                  <span className="user-form-modal-i18">
                    2. Permitted Module Access
                  </span>
                  <div className="user-form-modal-i43">
                    Controls visible sidebar items for this user ({allowedModules.length} of {ALL_MODULES.length} enabled)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearModules}
                  className="user-form-modal-i59" style={{ transition: 'all 0.15s ease' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--vdms-text-muted)';
                    e.currentTarget.style.borderColor = 'var(--vdms-border)';
                    e.currentTarget.style.background = 'none';
                  }}
                  title="Clear all module permissions"
                >
                  Clear
                </button>
              </div>

              {/* Modules Checklist (Scrollable list with clean cards) */}
              <div
                className="user-form-modal-i60"
              >
                {ALL_MODULES.map(mod => {
                  const isChecked = allowedModules.indexOf(mod.id) !== -1;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => toggleModule(mod.id)}
                      className="user-form-modal-i61" style={{ border: isChecked ? `1.5px solid ${clay.accent}` : '1px solid var(--vdms-border)', background: isChecked ? 'rgba(14, 116, 144, 0.08)' : 'var(--vdms-surface)' }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by parent div onClick
                        className="user-form-modal-i62" style={{ width: 15, accentColor: clay.accent }}
                      />
                      <div
                        className="user-form-modal-i63" style={{ width: 24, borderRadius: 6, background: isChecked ? 'rgba(14, 116, 144, 0.2)' : 'var(--vdms-surface-alt)', color: isChecked ? clay.accent : 'var(--vdms-text-muted)' }}
                      >
                        <Icon iconName={mod.iconName} className="user-form-modal-i27" />
                      </div>
                      <div className="user-form-modal-i14" style={{ minWidth: 0 }}>
                        <div className="user-form-modal-i64" style={{ fontWeight: isChecked ? 700 : 500 }}>
                          {mod.label}
                        </div>
                        <div className="user-form-modal-i65">
                          {mod.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Settings Tabs Sub-Configuration (Shown only if Settings module is enabled) */}
              {hasSettingsModule && (
                <div
                  className="user-form-modal-i66" style={{ borderRadius: 8 }}
                >
                  <div className="user-form-modal-i67">
                    <span className="user-form-modal-i68">
                      Settings Tabs Permissions
                    </span>
                    {role !== 'Admin' && (
                      <span className="user-form-modal-i69" style={{ background: 'rgba(14, 116, 144, 0.12)', color: clay.accent }}>
                        Default: Color Management
                      </span>
                    )}
                  </div>
                  <div className="user-form-modal-i70">
                    {ALL_SETTINGS_TABS.map(tabName => {
                      const isTabChecked = allowedSettingsTabs.indexOf(tabName) !== -1;
                      return (
                        <label
                          key={tabName}
                          className="user-form-modal-i71"
                        >
                          <input
                            type="checkbox"
                            checked={isTabChecked}
                            onChange={() => toggleSettingsTab(tabName)}
                            style={{ accentColor: clay.accent }}
                          />
                          <span className="user-form-modal-i72">{tabName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Modal Footer ── */}
          <div
            className="user-form-modal-i73"
          >
            {isEdit ? (
              <button
                type="button"
                disabled={isSubmitting || (isSelf && isActive)}
                title={
                  isSelf && isActive
                    ? 'You cannot deactivate your own admin account'
                    : isActive
                    ? 'Deactivate this user account immediately'
                    : 'Activate this user account immediately'
                }
                onClick={() => void handleToggleActiveDirectly()}
                style={{
                  ...dmsBtn(isActive ? 'danger' : 'secondary', !isSubmitting && !(isSelf && isActive)),
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12.5,
                  color: isActive ? undefined : '#16a34a',
                  borderColor: isActive ? undefined : '#16a34a',
                  opacity: isSelf && isActive ? 0.5 : 1,
                  cursor: isSelf && isActive ? 'not-allowed' : 'pointer',
                }}
              >
                <Icon iconName={isActive ? 'Blocked2' : 'CheckMark'} className="user-form-modal-i27" />
                <span>{isActive ? 'Deactivate User' : 'Activate User'}</span>
              </button>
            ) : <div />}
            <div className="user-form-modal-i4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                style={{ ...dmsBtn('secondary', !isSubmitting), padding: '6px 14px', fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  ...dmsBtn('primary', !isSubmitting),
                  minWidth: 120,
                  padding: '6px 16px',
                  fontSize: 12.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isSubmitting ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Icon iconName={isEdit ? 'Save' : 'AddFriend'} className="user-form-modal-i27" />
                    <span>{isEdit ? 'Save Changes' : 'Create User'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Custom In-App Confirmation / Alert Dialog ── */}
      {confirmDialog && confirmDialog.isOpen && (
        <div
          className="user-form-modal-i74" style={{ position: 'fixed', zIndex: 100050, background: 'rgba(2, 6, 23, 0.65)' }}
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="user-form-modal-i75" style={{ width: '100%', border: '1px solid var(--vdms-border, #e2e8f0)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="user-form-modal-i76">
              <div
                className="user-form-modal-i77" style={{ borderRadius: 10, background:
                    confirmDialog.tone === 'danger'
                      ? '#fee2e2'
                      : confirmDialog.tone === 'success'
                      ? '#dcfce7'
                      : '#fef3c7', color:
                    confirmDialog.tone === 'danger'
                      ? '#dc2626'
                      : confirmDialog.tone === 'success'
                      ? '#16a34a'
                      : '#d97706' }}
              >
                <Icon
                  iconName={
                    confirmDialog.tone === 'danger'
                      ? 'Blocked2'
                      : confirmDialog.tone === 'success'
                      ? 'CheckMark'
                      : 'Warning'
                  }
                  className="user-form-modal-i78"
                />
              </div>
              <div className="user-form-modal-i14" style={{ minWidth: 0 }}>
                <div className="user-form-modal-i79">
                  {confirmDialog.title}
                </div>
                <div className="user-form-modal-i80">
                  {confirmDialog.message}
                </div>
              </div>
            </div>

            <div className="user-form-modal-i81">
              {confirmDialog.cancelText ? (
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  style={{
                    ...dmsBtn('secondary'),
                    padding: '7px 16px',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {confirmDialog.cancelText}
                </button>
              ) : null}
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                style={{
                  ...dmsBtn(confirmDialog.tone === 'danger' ? 'danger' : 'primary'),
                  padding: '7px 18px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  background:
                    confirmDialog.tone === 'danger'
                      ? '#dc2626'
                      : confirmDialog.tone === 'success'
                      ? '#16a34a'
                      : undefined,
                  borderColor:
                    confirmDialog.tone === 'danger'
                      ? '#dc2626'
                      : confirmDialog.tone === 'success'
                      ? '#16a34a'
                      : undefined,
                  color: '#fff',
                }}
              >
                {confirmDialog.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default UserFormModal;
