/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { Icon } from '@fluentui/react/lib/Icon';
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
  ApprovalItem, NotificationItem, UserItem,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import { FolderStructureModeSection } from './FolderStructureModeSection';
import { VesselFolderTemplateSection } from './VesselFolderTemplateSection';
import { TagConfigurationSection } from './TagConfigurationSection';
import { ModuleManagementSection } from './ModuleManagementSection';
import { ColorManagementSection } from './ColorManagementSection';
import { SettingsTabManagementSection } from './SettingsTabManagementSection';
import { CertificateMappingSection } from './CertificateMappingSection';
import { clay } from '../clayTheme';
import {
  DmsPageHeader, dmsBtn, dmsRowBtn, dmsControlStyle, DMS_ON_ACCENT, DMS_FONT_DISPLAY,
  DMS_TABLE_CARD, DMS_TABLE, DMS_TH, DMS_TR, DMS_TD, DMS_TD_NAME,
} from '../dmsDesignSystem';

export function renderSettingsPage(host: VesselEmail): React.ReactElement {
  return <SettingsPageView host={host} />;
}

// Every tab that can be hidden via Settings → Settings Management. Keep in
// sync with SETTINGS_TAB_CATALOG in backend/app/settings_tab_api.py.
// Note: 'Site Management' used to be listed here too, but that tab moved to
// the main Sites page (see SiteManagementSection.tsx), so Settings no
// longer has a pane for it.
const HIDEABLE_SETTINGS_TABS = [
  // 'Vessel Settings', // hidden from the UI for now — uncomment to bring the tab back
  'Tag Configuration', 'Module Management', 'Color Management', 'Audit Logs', 'Activity Log'
];

function SettingsPageView({ host }: { host: VesselEmail }): React.ReactElement {
    const { settingsTab, hiddenSettingsTabs } = host.state;

    // 'Settings Management' is always shown — it's the only place to
    // un-hide everything else, so it can never be hidden itself (the
    // server also strips it from any hidden list it's saved with).
    // Only admins see the configuration tabs; everyone else gets Appearance and
    // Audit Logs (their own session history). Admin status comes from the same
    // is_admin flag the config endpoints already return (null = still loading,
    // in which case the admin tabs are shown so an admin doesn't get bounced).
    const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
    React.useEffect(() => {
      let cancelled = false;
      fetch(`${host._base()}/api/settings-tab-settings/config`, { headers: host._headers() })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => { if (!cancelled) setIsAdmin(!!d?.is_admin); })
        .catch(() => { if (!cancelled) setIsAdmin(false); });
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const showAdminTabs = isAdmin !== false;
    // Configuration tabs (admin only) stay as plain Settings tabs; Appearance is personal.
    const configTabs = showAdminTabs
      ? [
        ...HIDEABLE_SETTINGS_TABS.filter(tab => tab !== 'Audit Logs' && tab !== 'Activity Log' && hiddenSettingsTabs.indexOf(tab) === -1),
        // 'Certificate Mapping', // moved to Certificates → Mapping tab (admin only)
        ...(hiddenSettingsTabs.indexOf('Audit Logs') === -1 ? ['Audit Logs'] : []),
        ...(hiddenSettingsTabs.indexOf('Activity Log') === -1 ? ['Activity Log'] : []),
      ]
      : [];
    // Appearance (Night/Light) lives inside Color Management for admins; everyone
    // else (or when Color Management is hidden) keeps the standalone tab.
    const appearanceInColor = configTabs.indexOf('Color Management') !== -1;
    const topTabs = [...(appearanceInColor ? [] : ['Appearance']), ...configTabs];

    const visibleTabs = topTabs;

    // If the currently-selected tab was just hidden (by this admin or
    // another one), land on the first tab that's still visible instead of
    // rendering a blank/unreachable pane.
    React.useEffect(() => {
      if (isAdmin === null) return;
      if (visibleTabs.indexOf(settingsTab) === -1) {
        host.setState({ settingsTab: visibleTabs[0] as any });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsTab, hiddenSettingsTabs, isAdmin]);

    const TAB_ICONS: Record<string, string> = {
      'Appearance': 'Color', 'Vessel Settings': 'Ferry', 'Tag Configuration': 'Tag', 'Module Management': 'GridViewMedium',
      'Color Management': 'Color', 'Certificate Mapping': 'Certificate', 'Audit Logs': 'History', 'Activity Log': 'TimelineProgress', 'Settings Management': 'Settings',
      'Site Management': 'SharepointLogo', 'User Management': 'People',
    };
    const navIcon = (name: string, active: boolean): React.ReactElement => (
      <Icon iconName={TAB_ICONS[name] || 'Settings'} aria-hidden="true" className="settings-page-i1" style={{ width: 18, display: 'inline-block', color: active ? DMS_ON_ACCENT : 'var(--vdms-text-muted)' }} />
    );
    const navGroupLabel = (text: string): React.ReactElement => (
      <div className="settings-page-i2">{text}</div>
    );
    const navBtnStyle = (active: boolean, indent = 0): React.CSSProperties => ({
      border: 'none',
      background: active ? clay.accentGradient : 'transparent',
      color: active ? DMS_ON_ACCENT : 'var(--vdms-text)', fontWeight: active ? 800 : 600,
      fontSize: 14, padding: indent ? '9px 8px 9px 16px' : '10px 12px', whiteSpace: 'nowrap', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      boxShadow: active ? clay.shadowButton : 'none',
    });

    return (
      <div className="vdms-settings" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', height: 'calc(100vh - 114px)', maxHeight: 'calc(100vh - 114px)', boxSizing: 'border-box', padding: 0, marginTop: -12, overflow: 'hidden' }}>
        <div className="settings-page-i3">
          <DmsPageHeader title="Settings" subtitle="Configure application settings and preferences." />
        </div>

        <div className="vdms-settings-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(212px, 218px) minmax(0, 1fr)', gap: 0, width: '100%', flex: '1 1 0', minHeight: 0, height: '100%', background: 'var(--vdms-glass)', backdropFilter: 'blur(20px) saturate(1.3)', WebkitBackdropFilter: 'blur(20px) saturate(1.3)', borderRadius: clay.radiusCard + 16, border: '1px solid var(--vdms-line)', boxShadow: clay.shadowRaised, overflow: 'hidden', boxSizing: 'border-box', alignSelf: 'stretch' }}>
          {/* Settings Left Nav */}
          <div className="vdms-settings-nav" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid var(--vdms-line)', background: 'var(--vdms-surface-alt)', padding: '16px 8px', boxSizing: 'border-box', height: '100%', overflowY: 'auto' }}>
            {!appearanceInColor && navGroupLabel('Personal')}
            {topTabs.filter(t => t === 'Appearance').map(tab => (
              <button key={tab} onClick={() => host.setState({ settingsTab: tab as any })} style={navBtnStyle(settingsTab === tab)}>
                {navIcon(tab, settingsTab === tab)}{tab}
              </button>
            ))}
            {configTabs.length > 0 && navGroupLabel('Configuration')}
            {configTabs.map(tab => (
              <button key={tab} onClick={() => host.setState({ settingsTab: tab as any })} style={navBtnStyle(settingsTab === tab)}>
                {navIcon(tab, settingsTab === tab)}{tab}
              </button>
            ))}
          </div>

          {/* Settings Content Area */}
          <div className="vdms-settings-body" style={(settingsTab === 'Tag Configuration' || settingsTab === 'Module Management' || settingsTab === 'Color Management' || settingsTab === 'Audit Logs' || (settingsTab as string) === 'Activity Log')
            ? { width: '100%', minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 20px 14px', boxSizing: 'border-box' }
            : { width: '100%', minWidth: 0, height: '100%', overflowY: 'auto', padding: '24px 32px 32px', boxSizing: 'border-box' }}>
            {settingsTab === 'Tag Configuration' ? (
              <div className="settings-page-i4">
                <h3 className="settings-page-i5" style={{ fontFamily: DMS_FONT_DISPLAY, letterSpacing: '-0.025em' }}>{settingsTab}</h3>
                <div className="settings-page-i6">Changes are pushed to SharePoint and the Term Store automatically.</div>
              </div>
            ) : (
              <h3 className="settings-page-i7" style={{ margin: (settingsTab === 'Module Management' || settingsTab === 'Color Management' || settingsTab === 'Audit Logs' || (settingsTab as string) === 'Activity Log') ? '0 0 8px' : '0 0 20px', fontFamily: DMS_FONT_DISPLAY, letterSpacing: '-0.025em' }}>{settingsTab}</h3>
            )}

            {settingsTab === 'Vessel Settings' && (
              <>
                <FolderStructureModeSection host={host} />
                <VesselFolderTemplateSection host={host} />
              </>
            )}

            {settingsTab === 'Tag Configuration' && (
              <TagConfigurationSection host={host} />
            )}

            {settingsTab === 'Module Management' && (
              <ModuleManagementSection host={host} />
            )}

            {settingsTab === 'Color Management' && (
              <ColorManagementSection host={host} />
            )}

            {settingsTab === 'Audit Logs' && (
              <SessionAuditLog host={host} />
            )}

            {(settingsTab as string) === 'Activity Log' && (
              <AdminActivityLog host={host} />
            )}

            {(settingsTab as string) === 'Appearance' && (
              <div className="settings-page-i8">
                <div className="settings-page-i9">Choose how the application looks for you.</div>
                <div role="radiogroup" aria-label="Theme" className="settings-page-i10" style={{ borderRadius: 12 }}>
                  {([['night', 'Night', 'ClearNight'], ['light', 'Light', 'Sunny']] as const).map(([mode, label, icon]) => {
                    const active = (host.state.themeMode === 'night') === (mode === 'night');
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => { if (!active) host._toggleThemeMode(); }}
                        className="settings-page-i11" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", background: active ? clay.accentGradient : 'transparent', color: active ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: active ? clay.shadowButton : 'none' }}
                      >
                        <Icon iconName={icon} /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {settingsTab === 'Certificate Mapping' && (
              <CertificateMappingSection host={host} />
            )}

            {settingsTab === 'Settings Management' && (
              <SettingsTabManagementSection host={host} />
            )}
          </div>
        </div>
      </div>
    );
}

/**
 * Renders the signed-in user's session audit trail from GET /api/sessions/audit
 * (backend/app/main.py, list_session_audit). That endpoint filters strictly by
 * the X-User-Email header, so this shows the current user's own login/logout
 * history — not a tenant-wide admin audit log (no such endpoint exists yet).
 */
function SessionAuditLog({ host }: { host: VesselEmail }): React.ReactElement {
  const [entries, setEntries] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<string | null>(null);

  const loadAuditLog = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    try {
      const response = await fetch(`${host._base()}/api/sessions/audit?limit=50`, { headers: host._headers() });
      const data = await response.json();
      if (!response.ok) throw new Error((data && data.detail) || 'Failed to load audit log');
      setEntries(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => {
    void loadAuditLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.props.userEmail]);

  // Date on the first line, time on the second, so the Login / Logout columns stay narrow.
  const formatTime = (iso: string | null): React.ReactNode => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return (
      <span className="settings-page-i12">
        <span className="settings-page-i13">{d.toLocaleDateString()}</span>
        <span className="settings-page-i14">{d.toLocaleTimeString()}</span>
      </span>
    );
  };

  return (
    <div className="settings-page-i15">
      <div className="settings-page-i16">
        <p className="settings-page-i17">
          Your recent sign-in and sign-out activity for this application.
        </p>
        <button
          onClick={() => void loadAuditLog()}
          disabled={loading}
          style={dmsBtn('secondary', !loading)}
        >
          {loading ? 'Refreshing…' : <><Icon iconName="Refresh" aria-hidden="true" className="settings-page-i18" /> Refresh</>}
        </button>
      </div>

      {err && (
        <div className="settings-page-i19" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 6 }}>
          {err}
        </div>
      )}

      {loading && entries.length === 0 && !err ? (
        <div className="settings-page-i20">Loading audit log…</div>
      ) : entries.length === 0 && !err ? (
        <div className="settings-page-i20">
          No audit log entries yet. Sign-in / sign-out activity will appear here as it happens.
        </div>
      ) : (
        <div className="vdms-scroll-clean" style={{ ...DMS_TABLE_CARD, flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <table style={{ ...DMS_TABLE, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '15%' }} /><col style={{ width: '19%' }} /><col className="settings-page-i21" /><col style={{ width: '10%' }} />
              <col className="settings-page-i21" /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                {['Event', 'Detail', 'Status', 'IP Address', 'Browser', 'Login Time', 'Logout Time', 'Duration'].map(h => (
                  <th key={h} style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 2, background: 'var(--vdms-surface-alt, #f4f8fb)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={e.session_id ? `${e.session_id}-${idx}` : idx} style={DMS_TR}>
                  <td style={{ ...DMS_TD_NAME, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.event || ''}>{e.event || '—'}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.detail || ''}>{e.detail || '—'}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>
                    {badge(e.status === 'success' || e.status === 'active' ? 'green' : e.status === 'failed' ? 'red' : 'default', e.status || '—')}
                  </td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.ip_address || '—'}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.browser || ''}>{e.browser || '—'}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>{formatTime(e.login_time)}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>{formatTime(e.logout_time)}</td>
                  <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>{e.active_duration_formatted || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ACTIVITY_LOG_ACTIONS = [
  'access_request', 'login', 'password_set', 'profile_update', 'role_updated',
  'site_permissions_updated', 'user_created', 'user_updated', 'access_granted',
  'access_denied', 'user_deleted', 'removed', 'hidden', 'unhidden',
];

/**
 * Admin-only, tenant-wide view over every sensitive action recorded in
 * `activity_logs` (GET /api/admin/activity-log) — role changes, permission
 * edits, user lifecycle, password resets, profile updates. This is the same
 * table SessionAuditLog's sibling tab draws its OWN per-user session history
 * from, but here filterable across every user instead of capped at a flat
 * feed buried inside the Alerts bell's CRUD tab.
 */
function AdminActivityLog({ host }: { host: VesselEmail }): React.ReactElement {
  const [entries, setEntries] = React.useState<Array<{ id: number; user_email: string; action: string; detail: string | null; created_at: string | null }>>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [userFilter, setUserFilter] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const PAGE_SIZE = 50;

  const load = React.useCallback(async (nextOffset: number): Promise<void> => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (userFilter.trim()) params.set('user_email', userFilter.trim());
      if (actionFilter) params.set('action', actionFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const response = await fetch(`${host._base()}/api/admin/activity-log?${params.toString()}`, { headers: host._headers() });
      const data = await response.json();
      if (!response.ok) throw new Error((data && data.detail) || 'Failed to load activity log');
      setEntries(nextOffset === 0 ? (data.items || []) : [...entries, ...(data.items || [])]);
      setTotal(data.total || 0);
      setOffset(nextOffset);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, userFilter, actionFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFilter, actionFilter, dateFrom, dateTo]);

  const formatTime = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  return (
    <div className="settings-page-i15">
      <div className="settings-page-i16">
        <p className="settings-page-i17">
          Every role change, permission edit, user lifecycle event and password reset, tenant-wide ({total} total).
        </p>
        <button onClick={() => void load(0)} disabled={loading} style={dmsBtn('secondary', !loading)}>
          {loading && offset === 0 ? 'Refreshing…' : <><Icon iconName="Refresh" aria-hidden="true" className="settings-page-i18" /> Refresh</>}
        </button>
      </div>

      <div className="settings-page-i66">
        <input
          placeholder="Filter by user email…"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          style={{ ...dmsControlStyle(), minWidth: 200 }}
        />
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={dmsControlStyle()}>
          <option value="">All actions</option>
          {ACTIVITY_LOG_ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dmsControlStyle()} title="From date" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dmsControlStyle()} title="To date" />
      </div>

      {err && (
        <div className="settings-page-i19" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 6 }}>
          {err}
        </div>
      )}

      {loading && entries.length === 0 && !err ? (
        <div className="settings-page-i20">Loading activity log…</div>
      ) : entries.length === 0 && !err ? (
        <div className="settings-page-i20">No activity log entries match these filters.</div>
      ) : (
        <>
          <div className="vdms-scroll-clean" style={{ ...DMS_TABLE_CARD, flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            <table style={{ ...DMS_TABLE, width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18%' }} /><col style={{ width: '16%' }} /><col /><col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  {['When', 'User', 'Detail', 'Action'].map(h => (
                    <th key={h} style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 2, background: 'var(--vdms-surface-alt, #f4f8fb)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} style={DMS_TR}>
                    <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>{formatTime(e.created_at)}</td>
                    <td style={{ ...DMS_TD_NAME, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.user_email}>{e.user_email}</td>
                    <td style={{ ...DMS_TD, overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.detail || ''}>{e.detail || '—'}</td>
                    <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>{badge('default', e.action.replace(/_/g, ' '))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length < total && (
            <div className="settings-page-i67">
              <button onClick={() => void load(offset + PAGE_SIZE)} disabled={loading} style={dmsBtn('secondary', !loading)}>
                {loading ? 'Loading…' : `Load more (${entries.length} of ${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VesselSiteProvisioningPanel({ host }: { host: VesselEmail }): React.ReactElement {
  const [sites, setSites] = React.useState<Array<{
    site_key: string;
    display_name: string;
    site_name: string;
    site_id: string;
    drive_id: string;
    is_available_for_provisioning: boolean;
    is_default_provisioning: boolean;
    is_hidden?: boolean;
  }>>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [siteMsg, setSiteMsg] = React.useState<string | null>(null);
  const [siteErr, setSiteErr] = React.useState<string | null>(null);

  // Per-vessel provisioning
  const [vesselSearch, setVesselSearch] = React.useState<string>('');
  const [selectedVessel, setSelectedVessel] = React.useState<VesselRecord | null>(null);
  const [targetSiteKeys, setTargetSiteKeys] = React.useState<string[]>([]);
  const [provisioning, setProvisioning] = React.useState<boolean>(false);
  const [provMsg, setProvMsg] = React.useState<string | null>(null);
  const [provErr, setProvErr] = React.useState<string | null>(null);
  const [provResults, setProvResults] = React.useState<Record<string, any> | null>(null);

  const loadSites = () => {
    setLoading(true);
    fetch(`${host._base()}/api/admin/site-provisioning/sites`, { headers: host._headers() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        setSites(d.sites || []);
      })
      .catch((e: any) => {
        setSiteErr(e?.message || 'Failed to load site provisioning settings');
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    loadSites();
  }, []);

  const handleSaveSiteSettings = async () => {
    setSaving(true);
    setSiteMsg(null);
    setSiteErr(null);
    try {
      const res = await fetch(`${host._base()}/api/admin/site-provisioning/sites`, {
        method: 'PUT',
        headers: {
          ...host._headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sites: sites.map(s => ({
            site_key: s.site_key,
            is_available_for_provisioning: s.is_available_for_provisioning,
            is_default_provisioning: s.is_default_provisioning,
            display_name: s.display_name,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to save settings');
      if (data.sites) setSites(data.sites);
      setSiteMsg('✓ Site provisioning settings saved successfully.');
      setTimeout(() => setSiteMsg(null), 3000);
    } catch (err: any) {
      setSiteErr(err?.message || 'Failed to save site settings');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenVesselModal = (v: VesselRecord) => {
    setSelectedVessel(v);
    setTargetSiteKeys(v.provisioned_site_ids || []);
    setProvMsg(null);
    setProvErr(null);
    setProvResults(null);
  };

  const handleProvisionSites = async () => {
    if (!selectedVessel) return;
    setProvisioning(true);
    setProvMsg(null);
    setProvErr(null);
    setProvResults(null);
    try {
      const res = await fetch(`${host._base()}/api/vessels/${selectedVessel.id}/provision-sites`, {
        method: 'POST',
        headers: {
          ...host._headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ site_keys: targetSiteKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Provisioning failed');
      setProvResults(data.results || {});
      const newlyProvisioned = data.provisioned_sites || targetSiteKeys;
      setProvMsg(`✓ Provisioning complete across target sites.`);

      const updatedVessels = host.state.vessels.map(v =>
        v.id === selectedVessel.id
          ? { ...v, is_provisioned: true, provisioned_site_ids: newlyProvisioned }
          : v
      );
      host.setState({ vessels: updatedVessels });
      setSelectedVessel({ ...selectedVessel, is_provisioned: true, provisioned_site_ids: newlyProvisioned });
    } catch (err: any) {
      setProvErr(err?.message || 'Provisioning request failed');
    } finally {
      setProvisioning(false);
    }
  };

  const vessels = host.state.vessels || [];
  const filteredVessels = vessels.filter(v => {
    const q = vesselSearch.trim().toLowerCase();
    if (!q) return true;
    return (v.name || '').toLowerCase().includes(q) || (v.imo || '').includes(q);
  });

  const siteNameMap: Record<string, string> = {};
  sites.forEach(s => { siteNameMap[s.site_key] = s.display_name; });

  return (
    <div className="settings-page-i22">
      {/* Intro banner */}
      <div className="settings-page-i23" style={{ background: clay.accentSoft, borderRadius: clay.radiusCard }}>
        <div className="settings-page-i24" style={{ color: clay.accentDark }}>
          Multi-Site Vessel Provisioning & DMS Folder Structure
        </div>
        <div className="settings-page-i25">
          Control which connected SharePoint sites are available for vessel DMS folder structures. Adding sites to an existing vessel creates standard folders on the newly selected site only, preserving existing sites intact.
        </div>
        <div className="settings-page-i26">
          <strong>Note:</strong> File uploads reside inside the targeted site document library and do not replicate files across sites.
        </div>
        <div className="settings-page-i27">
        </div>
      </div>

      {siteMsg && <div className="settings-page-i28" style={{ background: clay.pillActiveBg, color: clay.pillActiveText, borderRadius: 8 }}>{siteMsg}</div>}
      {siteErr && <div className="settings-page-i28" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 8 }}>{siteErr}</div>}

      {/* Section 1: Connected Sites */}
      <div className="settings-page-i29" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}>
        <div className="settings-page-i30">
          <div>
            <h4 className="settings-page-i31">1. Connected Sites & Availability</h4>
            <span className="settings-page-i32">Configure which sites can receive vessel folder structures.</span>
          </div>
          <button
            onClick={handleSaveSiteSettings}
            disabled={saving || loading}
            style={dmsBtn('primary', !(saving || loading))}
          >
            {saving ? 'Saving...' : 'Save Site Settings'}
          </button>
        </div>

        {loading ? (
          <div className="settings-page-i33">Loading sites...</div>
        ) : sites.length === 0 ? (
          <div className="settings-page-i33">No connected sites discovered.</div>
        ) : (
          <div style={{ ...DMS_TABLE_CARD, overflowX: 'auto' }}>
            <table style={DMS_TABLE}>
              <thead>
                <tr>
                  <th style={DMS_TH}>Site Display Name</th>
                  <th style={DMS_TH}>Internal Key</th>
                  <th style={{ ...DMS_TH, textAlign: 'center' }}>Available for Provisioning</th>
                  <th style={{ ...DMS_TH, textAlign: 'center' }}>Default for New Vessels</th>
                </tr>
              </thead>
              <tbody>
                {sites.filter(s => !s.is_hidden).map(s => (
                  <tr key={s.site_key} style={DMS_TR}>
                    <td style={DMS_TD_NAME}>
                      {s.display_name}
                    </td>
                    <td style={DMS_TD}>
                      <code className="settings-page-i34">{s.site_key}</code>
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={s.is_available_for_provisioning}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSites(sites.map(item => item.site_key === s.site_key ? { ...item, is_available_for_provisioning: checked } : item));
                        }}
                        className="settings-page-i35" style={{ width: 16, accentColor: clay.accent }}
                      />
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        disabled={!s.is_available_for_provisioning}
                        checked={s.is_default_provisioning}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSites(sites.map(item => item.site_key === s.site_key ? { ...item, is_default_provisioning: checked } : item));
                        }}
                        className="settings-page-i36" style={{ width: 16, cursor: s.is_available_for_provisioning ? 'pointer' : 'default', accentColor: clay.accent }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Vessel Provisioning Status */}
      <div className="settings-page-i29" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}>
        <div className="settings-page-i30">
          <div>
            <h4 className="settings-page-i31">2. Vessel Site Allocation & Status</h4>
            <span className="settings-page-i32">View provisioned sites per vessel and trigger provisioning for newly added sites.</span>
          </div>
          <input
            type="text"
            value={vesselSearch}
            onChange={e => setVesselSearch(e.target.value)}
            placeholder="Search vessels by name or IMO..."
            style={{ ...dmsControlStyle(), width: 220 }}
          />
        </div>

        <div className="settings-page-i37" style={{ borderRadius: 8 }}>
          <table style={DMS_TABLE}>
            <thead>
              <tr className="settings-page-i38">
                <th style={DMS_TH}>Vessel</th>
                <th style={DMS_TH}>IMO</th>
                <th style={DMS_TH}>Provisioned Sites</th>
                <th style={{ ...DMS_TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVessels.length === 0 ? (
                <tr>
                  <td colSpan={4} className="settings-page-i39">No vessels match your search.</td>
                </tr>
              ) : (
                filteredVessels.map(v => {
                  const provSites = v.provisioned_site_ids || [];
                  return (
                    <tr key={v.id} style={DMS_TR}>
                      <td style={DMS_TD_NAME}>
                        <Icon iconName="Ferry" aria-hidden="true" className="settings-page-i40" /> {v.name}
                      </td>
                      <td style={DMS_TD}>
                        {v.imo || '—'}
                      </td>
                      <td style={DMS_TD}>
                        <div className="settings-page-i41">
                          {provSites.length === 0 ? (
                            <span className="settings-page-i42" style={{ background: clay.pillWarnBg, color: clay.pillWarnText, borderRadius: 10 }}>
                              Default site only
                            </span>
                          ) : (
                            provSites.map(sk => (
                              <span
                                key={sk}
                                className="settings-page-i43" style={{ background: clay.pillActiveBg, color: clay.pillActiveText, borderRadius: 10 }}
                              >
                                <span><Icon iconName="CheckMark" aria-hidden="true" className="settings-page-i44" /></span>
                                {siteNameMap[sk] || sk}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ ...DMS_TD, textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenVesselModal(v)}
                          style={dmsRowBtn('plain')}
                        >
                          Manage Sites
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Vessel Provisioning Modal */}
      {selectedVessel && (
        <div
          className="settings-page-i45" style={{ position: 'fixed', background: 'rgba(15,23,42,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget && !provisioning) setSelectedVessel(null); }}
        >
          <div className="settings-page-i46" style={{ background: 'var(--vdms-surface)', boxShadow: clay.shadowRaised }}>
            <div className="settings-page-i47">
              <div>
                <h3 className="settings-page-i48">
                  Manage Sites: {selectedVessel.name}
                </h3>
                <span className="settings-page-i32">IMO: {selectedVessel.imo || '—'}</span>
              </div>
              {!provisioning && (
                <button
                  onClick={() => setSelectedVessel(null)}
                  className="settings-page-i49"
                ><Icon iconName="Cancel" aria-hidden="true" className="settings-page-i50" /></button>
              )}
            </div>

            {provMsg && <div className="settings-page-i51" style={{ background: clay.pillActiveBg, color: clay.pillActiveText, borderRadius: 6 }}>{provMsg}</div>}
            {provErr && <div className="settings-page-i51" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 6 }}>{provErr}</div>}

            <div className="settings-page-i52">
              Select additional sites to provision the DMS folder tree. Already provisioned sites will not be recreated.
            </div>

            <div className="settings-page-i53">
              {sites.filter(s => s.is_available_for_provisioning && !s.is_hidden).map(site => {
                const isAlreadyProvisioned = (selectedVessel.provisioned_site_ids || []).includes(site.site_key);
                const isChecked = targetSiteKeys.includes(site.site_key);

                return (
                  <label
                    key={site.site_key}
                    className="settings-page-i54" style={{ borderRadius: 8, background: isAlreadyProvisioned ? 'var(--vdms-surface-alt)' : isChecked ? clay.accentSoft : 'var(--vdms-surface)', border: `1px solid ${isChecked ? clay.accent : 'var(--vdms-line)'}`, cursor: isAlreadyProvisioned ? 'default' : 'pointer' }}
                  >
                    <div className="settings-page-i55">
                      <input
                        type="checkbox"
                        disabled={isAlreadyProvisioned || provisioning}
                        checked={isChecked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...targetSiteKeys, site.site_key]
                            : targetSiteKeys.filter(k => k !== site.site_key);
                          setTargetSiteKeys(next);
                        }}
                        className="settings-page-i36" style={{ width: 16, accentColor: clay.accent }}
                      />
                      <div>
                        <div className="settings-page-i56">{site.display_name}</div>
                        <div className="settings-page-i57">Key: {site.site_key}</div>
                      </div>
                    </div>

                    {isAlreadyProvisioned ? (
                      <span className="settings-page-i58" style={{ color: clay.pillActiveText, background: clay.pillActiveBg, borderRadius: 10 }}>
                        <Icon iconName="CheckMark" aria-hidden="true" className="settings-page-i44" /> Provisioned
                      </span>
                    ) : isChecked ? (
                      <span className="settings-page-i59" style={{ color: clay.accentDark, background: clay.accentSoft, borderRadius: 10 }}>
<Icon iconName="Add" aria-hidden="true" className="settings-page-i44" /> Will Provision
                      </span>
                    ) : (
                      <span className="settings-page-i60">Not provisioned</span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Results breakdown if present */}
            {provResults && (
              <div className="settings-page-i61" style={{ borderRadius: 8 }}>
                <div className="settings-page-i62">Provisioning Results:</div>
                {Object.entries(provResults).map(([sk, res]: [string, any]) => (
                  <div key={sk} className="settings-page-i63">
                    <span>{siteNameMap[sk] || sk}:</span>
                    <span className="settings-page-i64" style={{ color: res.status === 'success' ? clay.pillActiveText : clay.pillDangerText }}>
                      {res.status === 'success' ? <><Icon iconName="CheckMark" aria-hidden="true" className="settings-page-i18" /> Provisioned</> : <><Icon iconName="ErrorBadge" aria-hidden="true" className="settings-page-i18" /> Failed: {res.error || 'Error'}</>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="settings-page-i65">
              <button
                onClick={() => setSelectedVessel(null)}
                disabled={provisioning}
                style={dmsBtn('secondary', !provisioning)}
              >
                Close
              </button>
              <button
                onClick={handleProvisionSites}
                disabled={provisioning || targetSiteKeys.filter(k => !(selectedVessel.provisioned_site_ids || []).includes(k)).length === 0}
                style={dmsBtn('primary', !(provisioning || targetSiteKeys.filter(k => !(selectedVessel.provisioned_site_ids || []).includes(k)).length === 0))}
              >
                {provisioning ? 'Provisioning Folders...' : 'Provision Missing Sites'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

