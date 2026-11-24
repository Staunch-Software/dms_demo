/* eslint-disable @typescript-eslint/no-unused-vars */
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { UserFormModal } from '../modals/UserFormModal';
import { clay } from '../clayTheme';
import {
  badge, GROUP_COLORS, DATASOURCE_TAGS_MAP, VESSEL_TYPES, cleanName, suggestTagFromFilename,
  INITIAL_MOCK_DOCUMENTS, INITIAL_MOCK_TEMPLATES, INITIAL_MOCK_APPROVALS,
  INITIAL_MOCK_NOTIFICATIONS, INITIAL_MOCK_USERS,
} from '../constants';
import type {
  FlatRow, GroupedRow, VesselRecord,
} from '../types/rows';
import type { BentoEmailLog } from '../types/bento';
import type { AppView, ModalMode } from '../types/view';
import type {
  FormState, DocPreviewItem, DeletedNode, DocumentItem, TemplateItem,
  ApprovalItem, NotificationItem, UserItem, UserSitePermissionItem,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import {
  DmsPageHeader, DMS_SECTION_CARD, DMS_TABLE_CARD, DMS_TABLE, DMS_TH, DMS_TR, DMS_TD, DMS_TD_NAME, DMS_NAME_CELL,
  dmsBtn, dmsControlStyle, dmsRowBtn, dmsTone,
} from '../dmsDesignSystem';

// Reaching this page at all means /api/users (admin-gated server-side via
// require_admin_session) already returned data for the signed-in user, so
// every row rendered here belongs to an admin session -- no separate
// client-side admin check is needed before showing the edit controls.

const emptyPermission = (siteKey: string): UserSitePermissionItem => ({
  site_key: siteKey, can_view: true, can_upload: false, can_tag_on_upload: false,
});

function PermissionsEditor({ host, usr }: { host: VesselEmail; usr: UserItem }): React.ReactElement {
  const draft = host.state.usersPermissionsDraft;
  const busy = host.state.usersPermissionsBusy;
  const knownSites = (host.state.documentSites || []).map(s => ({
    key: s.site_key || s.site_id || '',
    label: s.sp_site_name || s.site_key || s.site_id || '',
  })).filter(s => s.key);

  const setDraft = (next: UserSitePermissionItem[]): void => host.setState({ usersPermissionsDraft: next });

  const updateRow = (siteKey: string, patch: Partial<UserSitePermissionItem>): void => {
    const next = draft.map(p => {
      if (p.site_key !== siteKey) return p;
      const merged = { ...p, ...patch };
      // Mirror the server-side dependency (require_site_permission /
      // update_user_permissions in backend/app/main.py): upload implies
      // view, tag-on-upload implies upload -- keep the checkboxes honest
      // rather than letting the admin set a combination the save will
      // silently narrow anyway.
      if (!merged.can_view) { merged.can_upload = false; merged.can_tag_on_upload = false; }
      if (!merged.can_upload) { merged.can_tag_on_upload = false; }
      return merged;
    });
    setDraft(next);
  };

  const addSite = (siteKey: string): void => {
    if (!siteKey || draft.some(p => p.site_key === siteKey)) return;
    setDraft([...draft, emptyPermission(siteKey)]);
  };

  const removeSite = (siteKey: string): void => setDraft(draft.filter(p => p.site_key !== siteKey));

  const [manualSiteKey, setManualSiteKey] = React.useState('');

  return (
    <div className="users-page-i1">
      <div className="users-page-i2">
        SharePoint site access for {usr.email}
      </div>
      {draft.length === 0 && (
        <div className="users-page-i3">No site access granted yet.</div>
      )}
      <div className="users-page-i4">
        {draft.map(p => (
          <div key={p.site_key} className="users-page-i5" style={{ background: 'var(--vdms-surface)', borderRadius: 6 }}>
            <span className="users-page-i6" style={{ minWidth: 160 }}>
              {knownSites.find(s => s.key === p.site_key)?.label || p.site_key}
            </span>
            <label className="users-page-i7">
              <input type="checkbox" checked={p.can_view} onChange={e => updateRow(p.site_key, { can_view: e.target.checked })} />
              View
            </label>
            <label className="users-page-i7">
              <input type="checkbox" checked={p.can_upload} disabled={!p.can_view} onChange={e => updateRow(p.site_key, { can_upload: e.target.checked })} />
              Upload
            </label>
            <label className="users-page-i7">
              <input type="checkbox" checked={p.can_tag_on_upload} disabled={!p.can_upload} onChange={e => updateRow(p.site_key, { can_tag_on_upload: e.target.checked })} />
              Tag on upload
            </label>
            <button
              type="button"
              onClick={() => removeSite(p.site_key)}
              className="users-page-i8" style={{ color: dmsTone('danger').fg }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="users-page-i9">
        {knownSites.length > 0 ? (
          <select
            value=""
            onChange={e => { if (e.target.value) addSite(e.target.value); }}
            style={{ ...dmsControlStyle(), padding: '5px 8px' }}
          >
            <option value="">+ Add a site...</option>
            {knownSites.filter(s => !draft.some(p => p.site_key === s.key)).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="text"
              placeholder="site_key (e.g. from Sites page)"
              value={manualSiteKey}
              onChange={e => setManualSiteKey(e.target.value)}
              style={{ ...dmsControlStyle(), padding: '5px 8px', width: 200 }}
            />
            <button
              type="button"
              onClick={() => { addSite(manualSiteKey.trim().toLowerCase()); setManualSiteKey(''); }}
              style={dmsBtn('secondary')}
            >
              Add
            </button>
          </>
        )}
      </div>

      <div className="users-page-i10">
        <button
          type="button"
          disabled={busy}
          onClick={() => void host._updateUserSitePermissions(usr.email, draft)}
          style={dmsBtn('primary', !busy)}
        >
          {busy ? 'Saving...' : 'Save access'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => host.setState({ usersExpandedEmail: null })}
          style={dmsBtn('secondary', !busy)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Grant / Deny controls for a user waiting for (or denied) access. */
function AccessDecision({ host, usr }: { host: VesselEmail; usr: UserItem }): React.ReactElement {
  const [role, setRole] = React.useState<'Admin' | 'User'>('User');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const pending = usr.access_status === 'PENDING';
  const run = async (action: 'grant' | 'deny'): Promise<void> => {
    setBusy(true);
    setNote(null);
    const res = action === 'grant' ? await host._grantAccess(usr.email, role) : await host._denyAccess(usr.email);
    setBusy(false);
    if (!res.success) setNote(res.error || 'That did not work.');
    else if (action === 'grant' && (res as { inviteError?: string }).inviteError) {
      setNote('Access granted, but the email failed: ' + (res as { inviteError?: string }).inviteError);
    }
  };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <select
          value={role}
          disabled={busy}
          onChange={e => setRole(e.target.value as 'Admin' | 'User')}
          style={{ ...dmsControlStyle(), padding: '4px 6px', fontSize: 12 }}
          aria-label={'Role for ' + usr.email}
        >
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void run('grant')} style={{ ...dmsBtn('primary', !busy), padding: '4px 10px', fontSize: 12 }}>
          {pending ? 'Grant' : 'Grant now'}
        </button>
        {pending && (
          <button type="button" disabled={busy} onClick={() => void run('deny')} style={{ ...dmsBtn('danger', !busy), padding: '4px 10px', fontSize: 12 }}>
            Deny
          </button>
        )}
      </div>
      {note && <span style={{ fontSize: 11.5, color: dmsTone('danger').fg, maxWidth: 260, textAlign: 'right' }}>{note}</span>}
    </div>
  );
}

/** Resend-invitation button and the last send error, for an active user. */
function InviteControls({ host, usr }: { host: VesselEmail; usr: UserItem }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const resend = async (): Promise<void> => {
    setBusy(true);
    setNote(null);
    const res = await host._resendInvite(usr.email);
    setBusy(false);
    setNote(res.success ? 'Invitation sent.' : (res.error || 'The email could not be sent.'));
  };
  const error = note && note !== 'Invitation sent.' ? note : (!note ? usr.invite_error : null);
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        disabled={busy}
        title={usr.login_method === 'PASSWORD' ? 'Email a new one-time set-password link' : 'Email the sign-in instructions again'}
        onClick={() => void resend()}
        style={{ ...dmsRowBtn('plain'), display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
      >
        <Icon iconName="Mail" className="users-page-i12" />
        {busy ? 'Sending...' : 'Resend invite'}
      </button>
      {note === 'Invitation sent.' && <span style={{ fontSize: 11.5, color: dmsTone('success').fg }}>{note}</span>}
      {error && <span style={{ fontSize: 11.5, color: dmsTone('danger').fg, maxWidth: 260, textAlign: 'right' }}>Email failed: {error}</span>}
    </div>
  );
}

export function renderUsersPage(host: VesselEmail): React.ReactElement {
    const { usersList, userSearch, usersExpandedEmail } = host.state;
    const filtered = usersList.filter(u =>
      u.name.toLowerCase().indexOf(userSearch.toLowerCase()) !== -1 ||
      u.email.toLowerCase().indexOf(userSearch.toLowerCase()) !== -1
    ).sort((a, b) => (a.access_status === 'PENDING' ? 0 : 1) - (b.access_status === 'PENDING' ? 0 : 1));
    const pendingCount = usersList.filter(u => u.access_status === 'PENDING').length;

    const toggleExpanded = (usr: UserItem): void => {
      if (usersExpandedEmail === usr.email) {
        host.setState({ usersExpandedEmail: null });
        return;
      }
      host.setState({
        usersExpandedEmail: usr.email,
        usersPermissionsDraft: (usr.permissions || []).map(p => ({ ...p })),
      });
    };

    return (
      <div className="users-page-i11 vdms-users">
        <DmsPageHeader
          title="User Management"
          subtitle="Manage credentials, roles, per-user module access, and SharePoint site permissions."
        />

        <div className="vdms-users__toolbar" style={{ ...DMS_SECTION_CARD, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, gap: 12, flexWrap: 'wrap' }}>
          <input
            className="vdms-users__search"
            type="text"
            placeholder="Search users by name or email..."
            value={userSearch}
            onChange={e => host.setState({ userSearch: e.target.value })}
            style={{ ...dmsControlStyle(), padding: '6px 12px', fontSize: 13, width: 260 }}
          />
          <button
            type="button"
            onClick={() => host.setState({ userFormModalOpen: true, userFormTarget: null })}
            style={{
              ...dmsBtn('primary'),
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon iconName="Add" className="users-page-i12" />
            Create User
          </button>
        </div>

        {pendingCount > 0 && (
          <div style={{ ...DMS_SECTION_CARD, padding: 12, background: dmsTone('warning').bg, color: dmsTone('warning').fg, fontWeight: 600, fontSize: 13 }}>
            {pendingCount} access request{pendingCount === 1 ? '' : 's'} waiting for a decision. Grant or Deny them below (requests are listed first).
          </div>
        )}

        <div className="vdms-users__table-card" style={DMS_TABLE_CARD}>
          <table className="vdms-users__table" style={DMS_TABLE}>
            <thead>
              <tr>
                <th style={DMS_TH}>Name</th>
                <th style={DMS_TH}>Email / User ID</th>
                <th style={DMS_TH}>Role</th>
                <th style={DMS_TH}>Status</th>
                <th style={DMS_TH}>Login</th>
                <th style={DMS_TH}>Certificate Approver</th>
                <th style={DMS_TH}>Last Login</th>
                <th style={{ ...DMS_TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(usr => (
                <React.Fragment key={usr.id}>
                  <tr style={DMS_TR}>
                    <td style={DMS_TD_NAME}>
                      <div style={DMS_NAME_CELL}>
                        <div className="users-page-i13" style={{ width: 28 }}>
                          {usr.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="users-page-i14">{usr.name}</span>
                      </div>
                    </td>
                    <td style={DMS_TD}>{usr.email}</td>
                    <td style={DMS_TD}>
                      <span className="users-page-i15" style={{ color: usr.role === 'Admin' ? clay.accent : 'var(--vdms-text)' }}>
                        {usr.role}
                      </span>
                    </td>
                    <td style={DMS_TD}>
                      {badge(usr.status === 'Active' ? 'green' : usr.status === 'Pending' ? 'orange' : 'red', usr.status)}
                    </td>
                    <td style={DMS_TD}>
                      {usr.login_method === 'PASSWORD' ? badge('purple', 'Password') : badge('blue', 'Microsoft SSO')}
                    </td>
                    <td style={DMS_TD}>
                      {usr.can_approve_certificates ? (
                        <div className="users-page-j1">
                          <span
                            className="users-page-j2" style={{ background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a' }}
                          >
                            <Icon iconName="Certificate" className="users-page-j3" /> Approver
                          </span>
                          {Array.isArray(usr.assigned_vessels) && usr.assigned_vessels.length > 0 && !usr.assigned_vessels.includes('ALL') ? (
                            <span className="users-page-j4">
                              {usr.assigned_vessels.length} vessel{usr.assigned_vessels.length === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="users-page-j5">All vessels</span>
                          )}
                        </div>
                      ) : (
                        <span className="users-page-i20">-</span>
                      )}
                    </td>
                    <td style={DMS_TD}>{usr.lastLogin}</td>
                    <td style={{ ...DMS_TD, textAlign: 'right' }}>
                      <div className="users-page-i21">
                        <button
                          type="button"
                          title="Edit user details, module access & permissions"
                          onClick={() => host.setState({ userFormModalOpen: true, userFormTarget: usr })}
                          style={{
                            ...dmsRowBtn('plain'),
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            fontSize: 12,
                          }}
                        >
                          <Icon iconName="Edit" className="users-page-i12" />
                          Edit
                        </button>
                        {(usr.access_status === 'PENDING' || usr.access_status === 'DENIED') && (
                          <AccessDecision host={host} usr={usr} />
                        )}
                        {usr.status === 'Active' && <InviteControls host={host} usr={usr} />}
                        {usr.role !== 'Admin' && (
                          <button
                            type="button"
                            title="Inline SharePoint site access"
                            onClick={() => toggleExpanded(usr)}
                            style={{
                              ...dmsRowBtn('plain'),
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 8px',
                              fontSize: 12,
                            }}
                          >
                            <Icon iconName="SharepointLogo" className="users-page-i12" />
                            {usersExpandedEmail === usr.email ? 'Close' : 'Sites'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {usersExpandedEmail === usr.email && (
                    <tr>
                      <td colSpan={8} className="users-page-i22">
                        <PermissionsEditor host={host} usr={usr} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...DMS_TD, padding: '32px 16px', textAlign: 'center' }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {host.state.userFormModalOpen && (
          <UserFormModal
            host={host}
            user={host.state.userFormTarget}
            isOpen={host.state.userFormModalOpen}
            onClose={() => host.setState({ userFormModalOpen: false, userFormTarget: null })}
            onSuccess={() => void host._reloadUsersList()}
          />
        )}
      </div>
    );
}
