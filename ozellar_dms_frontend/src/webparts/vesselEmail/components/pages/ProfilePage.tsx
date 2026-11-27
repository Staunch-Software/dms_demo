import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import {
  DmsPageHeader, DMS_SECTION_CARD, dmsBtn, dmsControlStyle, DmsLoadingState, DmsEmptyState,
} from '../dmsDesignSystem';

export interface EmergencyContactData {
  id?: number;
  name: string | null;
  relationship_type: string | null;
  phone: string | null;
  email: string | null;
}

export interface FolderPermissionData {
  folder_name: string;
  permission_level: string;
}

export interface RecentActivityData {
  action: string;
  detail: string | null;
  created_at: string;
}

/** Shape of GET/PATCH /api/profile — the full HR-style record the backend
 * already syncs from Microsoft Graph on login and lets an admin edit, most
 * of which (address, employee id, manager, emergency contacts, ...) had no
 * UI at all before this page. */
export interface ProfileData {
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  azure_oid?: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  office_location: string | null;
  office_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  area_locality: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  company_name: string | null;
  employee_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  tenant_id?: string | null;
  two_factor_enabled?: boolean;
  password_changed_at?: string | null;
  last_login?: string | null;
  created_at?: string;
  photo_base64: string | null;
  date_of_joining: string | null;
  emergency_contacts: EmergencyContactData[];
  folder_permissions?: FolderPermissionData[];
  recent_activity?: RecentActivityData[];
}

function readPhotoAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function renderProfilePage(host: VesselEmail): React.ReactElement {
  const { profileData, profileLoading, profileSaving, profileError, profileDraft } = host.state;
  const displayName = host.props.userDisplayName || profileData?.display_name || 'Admin';
  const email = host.props.userEmail || profileData?.email || 'SharePoint account';
  const initial = displayName.charAt(0).toUpperCase();
  const editing = profileDraft !== null;
  const source: ProfileData | null = editing ? profileDraft : profileData;

  const updateDraft = (patch: Partial<ProfileData>): void => {
    if (!host.state.profileDraft) return;
    host.setState({ profileDraft: { ...host.state.profileDraft, ...patch } });
  };

  const startEdit = (): void => {
    if (!profileData) return;
    host.setState({ profileDraft: { ...profileData, emergency_contacts: [...(profileData.emergency_contacts || [])] }, profileError: null });
  };

  const cancelEdit = (): void => {
    host.setState({ profileDraft: null, profileError: null });
  };

  const saveEdit = async (): Promise<void> => {
    if (!host.state.profileDraft) return;
    await host._saveProfile(host.state.profileDraft);
  };

  // A single editable field: plain text in view mode, a bound input in edit mode.
  const field = (
    label: string,
    key: keyof ProfileData,
    opts?: { type?: string; readOnlyAlways?: boolean },
  ): React.ReactElement => {
    const value = (source?.[key] as string | null | undefined) || '';
    const readOnly = opts?.readOnlyAlways || !editing;
    return (
      <div key={key} className="profile-page-i16">
        <label className="profile-page-i17" style={{ color: clay.textMuted }}>{label}</label>
        {readOnly ? (
          <div className="profile-page-i18" style={{ color: clay.text }}>{value || '—'}</div>
        ) : (
          <input
            type={opts?.type || 'text'}
            value={value}
            onChange={e => updateDraft({ [key]: e.target.value } as Partial<ProfileData>)}
            style={{ ...dmsControlStyle(), width: '100%' }}
          />
        )}
      </div>
    );
  };

  const addEmergencyContact = (): void => {
    if (!host.state.profileDraft) return;
    updateDraft({
      emergency_contacts: [...host.state.profileDraft.emergency_contacts, { name: '', relationship_type: '', phone: '', email: '' }],
    });
  };

  const updateEmergencyContact = (idx: number, patch: Partial<EmergencyContactData>): void => {
    if (!host.state.profileDraft) return;
    const list = host.state.profileDraft.emergency_contacts.slice();
    list[idx] = { ...list[idx], ...patch };
    updateDraft({ emergency_contacts: list });
  };

  const removeEmergencyContact = (idx: number): void => {
    if (!host.state.profileDraft) return;
    const list = host.state.profileDraft.emergency_contacts.slice();
    list.splice(idx, 1);
    updateDraft({ emergency_contacts: list });
  };

  return (
    <div className="profile-page-i1">
      <DmsPageHeader title="Profile" subtitle="Your Vessel DMS account details and shortcuts.">
        {profileData && !editing && (
          <button type="button" onClick={startEdit} style={dmsBtn('secondary')}>
            <Icon iconName="Edit" aria-hidden="true" /> Edit Profile
          </button>
        )}
        {editing && (
          <div className="profile-page-i19">
            <button type="button" onClick={cancelEdit} disabled={profileSaving} style={dmsBtn('ghost')}>Cancel</button>
            <button type="button" onClick={() => void saveEdit()} disabled={profileSaving} style={dmsBtn('primary', !profileSaving)}>
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </DmsPageHeader>

      {profileError && (
        <div className="profile-page-i20" style={{ background: clay.pillDangerBg, color: clay.pillDangerText }}>{profileError}</div>
      )}

      <section className="profile-page-i4" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
        <div className="profile-page-i21">
          <div className="profile-page-i5" style={{ background: source?.photo_base64 ? `url(${source.photo_base64}) center/cover` : clay.accentGradient, boxShadow: clay.shadowButton }}>
            {!source?.photo_base64 && initial}
          </div>
          {editing && (
            <label className="profile-page-i22" style={dmsBtn('ghost')}>
              <Icon iconName="Camera" aria-hidden="true" /> Change photo
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  const dataUrl = await readPhotoAsDataUrl(f);
                  updateDraft({ photo_base64: dataUrl });
                }}
              />
            </label>
          )}
        </div>
        <div>
          <h2 className="profile-page-i6" style={{ color: clay.text }}>{displayName}</h2>
          <div className="profile-page-i7" style={{ color: clay.textMuted }}>{email}</div>
          <div className="profile-page-i8" style={{ background: clay.accentSoft, color: clay.accentDark }}>
            {profileData?.job_title || 'Vessel DMS user'}
          </div>
        </div>
      </section>

      {profileLoading && !profileData && (
        <section style={DMS_SECTION_CARD}><DmsLoadingState label="Loading your profile…" /></section>
      )}

      {!profileLoading && !profileData && (
        <section style={DMS_SECTION_CARD}>
          <DmsEmptyState
            icon="ContactCard"
            title="Couldn't load your profile"
            action={<button type="button" onClick={() => void host._loadProfile()} style={dmsBtn('secondary')}>Retry</button>}
          />
        </section>
      )}

      {source && (
        <>
          <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
            <h2 className="profile-page-i10" style={{ color: clay.text }}>Personal &amp; work details</h2>
            <div className="profile-page-i23">
              {field('First name', 'first_name')}
              {field('Last name', 'last_name')}
              {field('Phone', 'phone', { type: 'tel' })}
              {field('Job title', 'job_title', { readOnlyAlways: true })}
              {field('Department', 'department')}
              {field('Employee ID', 'employee_id')}
              {field('Manager name', 'manager_name')}
              {field('Manager email', 'manager_email', { type: 'email' })}
              {field('Office name', 'office_name')}
              {field('Office location', 'office_location')}
              {field('Company', 'company_name')}
              {field('Date of joining', 'date_of_joining', { type: 'date' })}
            </div>
          </section>

          <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
            <h2 className="profile-page-i10" style={{ color: clay.text }}>Address</h2>
            <div className="profile-page-i23">
              {field('Address line 1', 'address_line1')}
              {field('Address line 2', 'address_line2')}
              {field('Area / Locality', 'area_locality')}
              {field('Landmark', 'landmark')}
              {field('City', 'city')}
              {field('State', 'state')}
              {field('Postal code', 'postal_code')}
              {field('Country', 'country')}
            </div>
          </section>

          <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
            <div className="profile-page-i24">
              <h2 className="profile-page-i10" style={{ color: clay.text, margin: 0 }}>Emergency contacts</h2>
              {editing && (
                <button type="button" onClick={addEmergencyContact} style={dmsBtn('ghost')}>
                  <Icon iconName="Add" aria-hidden="true" /> Add contact
                </button>
              )}
            </div>
            {(source.emergency_contacts || []).length === 0 ? (
              <p className="profile-page-i11" style={{ color: clay.textMuted }}>No emergency contacts on file.</p>
            ) : (
              <div className="profile-page-i25">
                {source.emergency_contacts.map((c, idx) => (
                  <div key={c.id ?? idx} className="profile-page-i26" style={{ border: `1px solid ${clay.accentSoft}` }}>
                    {editing ? (
                      <>
                        <input placeholder="Name" value={c.name || ''} onChange={e => updateEmergencyContact(idx, { name: e.target.value })} style={dmsControlStyle()} />
                        <input placeholder="Relationship" value={c.relationship_type || ''} onChange={e => updateEmergencyContact(idx, { relationship_type: e.target.value })} style={dmsControlStyle()} />
                        <input placeholder="Phone" value={c.phone || ''} onChange={e => updateEmergencyContact(idx, { phone: e.target.value })} style={dmsControlStyle()} />
                        <input placeholder="Email" value={c.email || ''} onChange={e => updateEmergencyContact(idx, { email: e.target.value })} style={dmsControlStyle()} />
                        <button type="button" onClick={() => removeEmergencyContact(idx)} style={dmsBtn('danger')} title="Remove">
                          <Icon iconName="Delete" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="profile-page-i27" style={{ color: clay.text }}>{c.name || '—'}</div>
                        <div className="profile-page-i28" style={{ color: clay.textMuted }}>
                          {[c.relationship_type, c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {!editing && (profileData?.recent_activity || []).length > 0 && (
            <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
              <h2 className="profile-page-i10" style={{ color: clay.text }}>Recent activity</h2>
              <div className="profile-page-i25">
                {(profileData?.recent_activity || []).map((a, idx) => (
                  <div key={idx} className="profile-page-i29" style={{ borderBottom: idx < (profileData?.recent_activity?.length || 0) - 1 ? `1px solid ${clay.accentSoft}` : 'none' }}>
                    <div style={{ color: clay.text, fontWeight: 600 }}>{a.detail || a.action}</div>
                    <div style={{ color: clay.textMuted, fontSize: 12 }}>{formatDate(a.created_at)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!editing && (
        <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
          <h2 className="profile-page-i10" style={{ color: clay.text }}>Account shortcuts</h2>
          <p className="profile-page-i11" style={{ color: clay.textMuted }}>Manage application preferences and your active session.</p>
          <div className="profile-page-i12">
            <button type="button" onClick={() => host._goToView('settings')} className="profile-page-i13" style={{ background: clay.accentGradient, borderRadius: 12, boxShadow: clay.shadowButton }}>Open Settings</button>
            <button type="button" onClick={host._handleSignOut} className="profile-page-i14" style={{ background: clay.surfaceRaised, color: clay.accentDeep, border: `1px solid ${clay.accentSoft}`, borderRadius: 12 }}>Sign out</button>
          </div>
        </section>
      )}
    </div>
  );
}
