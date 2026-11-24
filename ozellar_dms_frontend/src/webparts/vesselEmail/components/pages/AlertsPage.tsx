import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import type { AlertItem, FolderAnomalyItem } from '../types/ui';
import { clay } from '../clayTheme';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY } from '../dmsDesignSystem';
import { isMobileWidth } from '../responsive';

type AlertCategory = 'dms' | 'crud' | 'email';

const categoryLabels: Record<AlertCategory, string> = {
  dms: 'Vessels',
  crud: 'SPFx activity',
  email: 'Email alerts',
};
const tabLabels: Record<'all' | AlertCategory, string> = { all: 'All', dms: 'Vessels', crud: 'SPFx Activity', email: 'Email Alerts' };

function categoryOf(alert: AlertItem): AlertCategory {
  return alert.alert_category === 'crud' || alert.alert_type === 'crud_operation'
    ? 'crud'
    : alert.alert_category === 'email' || alert.alert_type === 'email_alert'
      ? 'email'
      : 'dms';
}

function typeLabel(alert: AlertItem): string {
  if (alert.alert_type === 'crud_operation') return 'CRUD operation';
  if (alert.alert_type === 'email_alert') return 'Email notification';
  if (alert.alert_type === 'vessel_deleted') return 'Deleted';
  if (alert.alert_type === 'document_deleted') return 'Document deleted';
  if (alert.alert_type === 'vessel_provisioned') return 'Provisioned';
  if (alert.alert_type === 'file_outside_structure') return 'File outside structure';
  if (alert.alert_type === 'vessel_unrecognised') return 'Unknown folder';
  if (alert.alert_type === 'subfolder_anomaly') return 'Folder anomaly';
  return 'Folder update';
}

function anomalyForAlert(alert: AlertItem): FolderAnomalyItem {
  return {
    id: alert.anomaly_id ?? Date.now(),
    drive_item_id: alert.drive_item_id || '',
    name: alert.folder_name,
    item_type: alert.item_type || 'folder',
    anomaly_type: 'vessel_level_unmatched',
    department: alert.department,
    vessel_name: alert.vessel_name,
    spo_path: alert.spo_path || alert.folder_path,
    resolved: false,
    detected_at: alert.created_at,
  };
}

const ATTENTION_ALERT_TYPES = new Set(['vessel_unrecognised', 'file_outside_structure', 'subfolder_anomaly']);

export function AlertsPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024));

  const unreadCount = host._unreadAlertCount();

  const attentionSite = host.state.alertsAttentionSite;
  const inAttentionMode = attentionSite !== null;
  const attentionSiteName = !inAttentionMode || attentionSite === 'all'
    ? 'All SharePoint Sites'
    : ((host.state.documentSites || []).find(site => site.site_key === attentionSite)?.sp_site_name || attentionSite);
  const noDocVessels: string[] = inAttentionMode ? (host.state.dashboardStats?.vessels_without_documents_list || []) : [];

  // Single-selection filter tab: exactly ONE tab is active at a time (no dual active buttons)
  type ActiveTab = 'all' | 'unread' | 'vessels' | 'crud' | 'email';
  let activeTab: ActiveTab = 'all';
  if (host.state.alertFilter === 'unread') {
    activeTab = 'unread';
  } else if (host.state.alertCategory === 'dms') {
    activeTab = 'vessels';
  } else if (host.state.alertCategory === 'crud') {
    activeTab = 'crud';
  } else if (host.state.alertCategory === 'email') {
    activeTab = 'email';
  } else {
    activeTab = 'all';
  }

  const handleSelectTab = (tab: ActiveTab): void => {
    if (tab === 'unread') {
      host.setState({ alertCategory: 'all', alertFilter: 'unread', selectedAlertId: null });
    } else if (tab === 'vessels') {
      host.setState({ alertCategory: 'dms', alertFilter: 'all', selectedAlertId: null });
    } else if (tab === 'crud') {
      host.setState({ alertCategory: 'crud', alertFilter: 'all', selectedAlertId: null });
    } else if (tab === 'email') {
      host.setState({ alertCategory: 'email', alertFilter: 'all', selectedAlertId: null });
    } else {
      host.setState({ alertCategory: 'all', alertFilter: 'all', selectedAlertId: null });
    }
  };

  const rawAlerts = host.state.alertsList.filter(alert => {
    if (inAttentionMode) {
      if (!ATTENTION_ALERT_TYPES.has(alert.alert_type) || alert.read) return false;
      if (attentionSite !== 'all' && String(alert.site_key || '').trim().toLowerCase() !== String(attentionSite).trim().toLowerCase()) return false;
      return true;
    }
    if (activeTab === 'unread') return !alert.read;
    if (activeTab === 'vessels') return categoryOf(alert) === 'dms';
    if (activeTab === 'crud') return categoryOf(alert) === 'crud';
    if (activeTab === 'email') return categoryOf(alert) === 'email';
    return true;
  });

  const query = searchQuery.trim().toLowerCase();
  const alerts = rawAlerts.filter(alert => {
    if (!query) return true;
    return (
      (alert.folder_name && alert.folder_name.toLowerCase().indexOf(query) !== -1) ||
      (alert.folder_path && alert.folder_path.toLowerCase().indexOf(query) !== -1) ||
      (alert.department && alert.department.toLowerCase().indexOf(query) !== -1) ||
      (alert.created_by_name && alert.created_by_name.toLowerCase().indexOf(query) !== -1) ||
      (alert.created_by_email && alert.created_by_email.toLowerCase().indexOf(query) !== -1) ||
      (alert.vessel_name && alert.vessel_name.toLowerCase().indexOf(query) !== -1) ||
      (alert.site_name && alert.site_name.toLowerCase().indexOf(query) !== -1) ||
      (alert.reason && alert.reason.toLowerCase().indexOf(query) !== -1) ||
      typeLabel(alert).toLowerCase().indexOf(query) !== -1
    );
  });

  const filteredNoDocVessels = noDocVessels.filter(name => {
    if (!query) return true;
    return name.toLowerCase().indexOf(query) !== -1;
  });

  const [selectedAttentionVessel, setSelectedAttentionVessel] = React.useState<string | null>(
    host.state.alertsAttentionVessel || null
  );

  React.useEffect(() => {
    if (host.state.alertsAttentionVessel) {
      setSelectedAttentionVessel(host.state.alertsAttentionVessel);
    }
  }, [host.state.alertsAttentionVessel]);

  React.useEffect(() => {
    if (inAttentionMode && !host.state.dashboardStats) {
      void host._loadDashboardStats();
    }
  }, [inAttentionMode, host.state.dashboardStats]);

  // Determine active attention vessel selection
  const activeAttentionVessel: string | null = inAttentionMode
    ? (selectedAttentionVessel && filteredNoDocVessels.indexOf(selectedAttentionVessel) !== -1
        ? selectedAttentionVessel
        : (!host.state.selectedAlertId && filteredNoDocVessels.length > 0 ? filteredNoDocVessels[0] : null))
    : null;

  const selectedAlert = (!activeAttentionVessel && host.state.selectedAlertId)
    ? host.state.alertsList.find(alert => alert.id === host.state.selectedAlertId) || alerts[0] || null
    : (!activeAttentionVessel ? (alerts[0] || null) : null);

  return (
    <div
      className="alerts-page-i1" style={{ width: '100%', maxWidth: 1400 }}
    >

      {/* Header bar */}
      <div className="alerts-page-i2">
        <div style={{ minWidth: 0 }}>
          <h1 className="alerts-page-i3" style={{ fontFamily: DMS_FONT_DISPLAY, letterSpacing: '-0.02em' }}>
            <span className="alerts-page-i4" style={{ borderRadius: 10, background: clay.accentSoft, color: clay.accent }}>
              <Icon iconName="Ringer" className="alerts-page-i5" />
            </span>
            Notifications
            {unreadCount > 0 && (
              <span className="alerts-page-i6" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 12 }}>
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="alerts-page-i7">All your application notifications in one place.</p>
        </div>
        <div className="alerts-page-i8">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={host._markAllAlertsRead}
              className="alerts-page-i9" style={{ background: clay.pillWarnBg, color: clay.pillWarnText, borderRadius: clay.radiusButton, boxShadow: clay.pillWarnShadow }}
            >
              Mark all as read
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (inAttentionMode) {
                host.setState({ alertsAttentionSite: null, alertsAttentionVessel: null, selectedAlertId: null });
              }
              void host._goToView('dashboard');
            }}
            style={{
              ...dmsBtn('secondary'),
              height: 32,
              padding: '0 12px',
              fontSize: 12.5,
              gap: 6,
            }}
          >
            <Icon iconName="ChevronLeft" className="alerts-page-i10" /> Back
          </button>
        </div>
      </div>

      {inAttentionMode && (
        <div className="alerts-page-i11" style={{ borderRadius: 8, background: clay.pillWarnBg, color: clay.pillWarnText }}>
          <span><Icon iconName="Warning" className="alerts-page-i12" />Requires attention · {attentionSiteName}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedAttentionVessel(null);
              host.setState({ alertsAttentionSite: null, alertsAttentionVessel: null, selectedAlertId: null });
            }}
            className="alerts-page-i13" style={{ background: 'var(--vdms-surface)', color: 'var(--vdms-text)', borderRadius: 6 }}
          >
            All notifications
          </button>
        </div>
      )}

      {/* Filter Tabs - Single Choice Active Filter */}
      <div className="alerts-page-i14" style={{ display: inAttentionMode ? 'none' : 'flex' }}>
        {[
          { key: 'all' as ActiveTab, label: 'All', count: host.state.alertsList.length },
          { key: 'unread' as ActiveTab, label: 'Unread', count: unreadCount },
          { key: 'vessels' as ActiveTab, label: 'Vessels', count: host.state.alertsList.filter(a => categoryOf(a) === 'dms').length },
          { key: 'crud' as ActiveTab, label: 'SPFx Activity', count: host.state.alertsList.filter(a => categoryOf(a) === 'crud').length },
          { key: 'email' as ActiveTab, label: 'Email Alerts', count: host.state.alertsList.filter(a => categoryOf(a) === 'email').length },
        ].map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSelectTab(tab.key)}
              className="alerts-page-i15" style={{ border: active ? 'none' : '1px solid var(--vdms-line)', background: active ? clay.accentGradient : 'var(--vdms-surface)', color: active ? '#fff' : 'var(--vdms-text)', borderRadius: 8, boxShadow: active ? clay.shadowButton : 'none' }}
            >
              <span>{tab.label}</span>
              <span className="alerts-page-i16" style={{ opacity: active ? 0.9 : 0.65, background: active ? 'rgba(255,255,255,0.2)' : 'var(--vdms-surface-alt)', borderRadius: 10 }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Two-Column View with Equal Full Height */}
      <div
        className="alerts-page-i17" style={{ gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.4fr) minmax(320px, 0.95fr)' }}
      >
        {/* Left: Notifications List Container */}
        <section
          className="alerts-page-i18" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}
        >
          {/* List Card Header: Label & Live Search */}
          <div
            className="alerts-page-i19"
          >
            <div className="alerts-page-i20" style={{ minWidth: 0 }}>
              <span className="alerts-page-i21" style={{ fontFamily: DMS_FONT_DISPLAY }}>
                {inAttentionMode
                  ? 'Requires attention'
                  : activeTab === 'all'
                    ? 'All'
                    : activeTab === 'unread'
                      ? 'Unread'
                      : activeTab === 'vessels'
                        ? 'Vessels'
                        : activeTab === 'crud'
                          ? 'SPFx Activity'
                          : 'Email Alerts'}
              </span>
              <span className="alerts-page-i22" style={{ borderRadius: 10, background: 'var(--vdms-surface)', color: 'var(--vdms-text-muted)' }}>
                {alerts.length + filteredNoDocVessels.length}
              </span>
            </div>

            {/* Search Input Box */}
            <div className="alerts-page-i23" style={{ width: 220, maxWidth: '100%' }}>
              <Icon
                iconName="Search"
                className="alerts-page-i24"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                style={{
                  ...dmsControlStyle(),
                  height: 30,
                  paddingLeft: 28,
                  paddingRight: searchQuery ? 24 : 8,
                  fontSize: 12,
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 6,
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="alerts-page-i25"
                >
                  <Icon iconName="Cancel" className="alerts-page-i26" />
                </button>
              )}
            </div>
          </div>

          {/* List Scrollable Body */}
          <div
            className="vdms-scroll-clean"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            {filteredNoDocVessels.map(name => {
              const isSelected = activeAttentionVessel === name;
              return (
                <button
                  key={`nodocs:${name}`}
                  type="button"
                  onClick={() => {
                    setSelectedAttentionVessel(name);
                    host.setState({ selectedAlertId: null, alertsAttentionVessel: name });
                  }}
                  className="vdms-notif-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: '1px solid var(--vdms-line-soft)',
                    borderLeft: isSelected ? `3px solid ${clay.accent}` : '3px solid transparent',
                    background: isSelected ? 'var(--vdms-surface-alt)' : 'transparent',
                    padding: '13px 18px',
                    cursor: 'pointer',
                  }}
                >
                  <div className="alerts-page-i27">
                    <strong className="alerts-page-i28" style={{ fontWeight: isSelected ? 800 : 700 }}>{name}</strong>
                    <span className="alerts-page-i29" style={{ color: clay.pillWarnText, background: clay.pillWarnBg, borderRadius: 10 }}>
                      No Documents
                    </span>
                  </div>
                  <div className="alerts-page-i30">
                    Vessel folder holds no documents · {attentionSiteName}
                  </div>
                </button>
              );
            })}

            {alerts.length === 0 && filteredNoDocVessels.length === 0 ? (
              <div className="alerts-page-i31">
                <Icon iconName="Info" className="alerts-page-i32" />
                <div className="alerts-page-i33">
                  {searchQuery.trim()
                    ? `No notifications found matching "${searchQuery}".`
                    : inAttentionMode
                      ? (attentionSite === 'all' ? 'No issues found.' : 'No issues found for this site.')
                      : 'No notifications here.'}
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ ...dmsBtn('ghost'), height: 28, fontSize: 12, padding: '0 10px', marginTop: 4 }}
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            ) : alerts.map(alert => {
              const isSelected = !activeAttentionVessel && (selectedAlert?.id === alert.id);
              return (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => {
                    setSelectedAttentionVessel(null);
                    host.setState({ alertsAttentionVessel: null });
                    host._openAlertsPage(alert.id);
                  }}
                  className="vdms-notif-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: '1px solid var(--vdms-line-soft)',
                    borderLeft: isSelected ? `3px solid ${clay.accent}` : '3px solid transparent',
                    background: isSelected ? 'var(--vdms-surface-alt)' : 'transparent',
                    padding: '13px 18px',
                    cursor: 'pointer',
                  }}
                >
                  <div className="alerts-page-i34">
                    <strong className="alerts-page-i28" style={{ fontWeight: isSelected ? 800 : 700 }}>
                      {alert.folder_name}
                    </strong>
                    <span
                      className="alerts-page-i35" style={{ borderRadius: 10, background: alert.read ? 'transparent' : clay.pillDangerBg, color: alert.read ? 'var(--vdms-text-muted)' : clay.pillDangerText, border: alert.read ? '1px solid var(--vdms-line)' : 'none' }}
                    >
                      {alert.read ? 'Read' : 'Unread'}
                    </span>
                  </div>
                  <div className="alerts-page-i36">
                    {typeLabel(alert)} · {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Recent'}
                  </div>
                  <div className="alerts-page-i37">
                    {alert.folder_path}
                  </div>
                  {(alert.alert_type === 'vessel_deleted' || alert.alert_type === 'document_deleted') && (
                    <div className="alerts-page-i38">
                      Deleted by {alert.created_by_name || alert.created_by_email || 'Unknown user'}{alert.site_name ? ` · ${alert.site_name}` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: Notifications Detail Container (Full Height) */}
        {activeAttentionVessel ? (() => {
          const vName = activeAttentionVessel;
          const vesselMeta = (host.state.vessels || []).find(v => (v.name || '').trim().toLowerCase() === vName.trim().toLowerCase());
          return (
            <aside
              className="alerts-page-i18" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}
            >
              {/* Header */}
              <div
                className="alerts-page-i39"
              >
                <div style={{ minWidth: 0 }}>
                  <div className="alerts-page-i40" style={{ color: clay.pillWarnText }}>
                    <Icon iconName="Warning" className="alerts-page-i10" />
                    Requires Attention
                  </div>
                  <h2 className="alerts-page-i41" style={{ fontFamily: DMS_FONT_DISPLAY }}>
                    {vName}
                  </h2>
                </div>
                <span
                  className="alerts-page-i42" style={{ borderRadius: 10, background: clay.pillWarnBg, color: clay.pillWarnText }}
                >
                  No Documents
                </span>
              </div>

              {/* Scrollable Body */}
              <div
                className="vdms-scroll-clean"
                style={{
                  flex: '1 1 auto',
                  overflowY: 'auto',
                  padding: '18px 20px 28px',
                  minHeight: 0,
                }}
              >
                <div
                  className="alerts-page-i43" style={{ borderRadius: 8, background: clay.pillWarnBg, color: clay.pillWarnText }}
                >
                  <Icon iconName="Info" className="alerts-page-i44" />
                  <div>
                    This vessel currently has no documents indexed in SharePoint. It was discovered in the fleet directory or registry, but does not yet contain compliance or operational records.
                  </div>
                </div>

                <dl className="alerts-page-i45">
                  <div>
                    <dt className="alerts-page-i46">Vessel Name</dt>
                    <dd className="alerts-page-i47">{vName}</dd>
                  </div>
                  <div>
                    <dt className="alerts-page-i46">IMO Number</dt>
                    <dd className="alerts-page-i47">{vesselMeta?.imo || 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt className="alerts-page-i46">Vessel Type</dt>
                    <dd className="alerts-page-i47">{vesselMeta?.vessel_type || 'Standard Vessel'}</dd>
                  </div>
                  <div>
                    <dt className="alerts-page-i46">Location / SharePoint Site</dt>
                    <dd className="alerts-page-i47">{attentionSiteName}</dd>
                  </div>
                  <div>
                    <dt className="alerts-page-i46">Fleet Status</dt>
                    <dd className="alerts-page-i47">{vesselMeta?.status || 'Active'}</dd>
                  </div>
                  <div>
                    <dt className="alerts-page-i46">Recommended Action</dt>
                    <dd className="alerts-page-i47">
                      Inspect this vessel in Fleet management to review its folder structure or upload initial certificates and documentation.
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Sticky Action Footer */}
              <div
                className="alerts-page-i48"
              >
                <button
                  type="button"
                  onClick={() => {
                    host.setState({ vesselsSearch: vName, vesselStatusFilter: 'all' });
                    void host._goToView('vessels');
                  }}
                  style={{ ...dmsBtn('primary'), height: 32, padding: '0 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon iconName="Ferry" className="alerts-page-i10" /> View in Vessels →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    host.setState({ vesselFilter: vName, docScopeType: 'vessels', view: 'list' });
                  }}
                  style={{ ...dmsBtn('secondary'), height: 32, padding: '0 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
                >
                  <Icon iconName="Document" className="alerts-page-i10" /> Open in Documents
                </button>
              </div>
            </aside>
          );
        })() : selectedAlert ? (
          <aside
            className="alerts-page-i18" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}
          >
            {/* Header */}
            <div
              className="alerts-page-i39"
            >
              <div style={{ minWidth: 0 }}>
                <div className="alerts-page-i49" style={{ color: clay.accent }}>
                  {typeLabel(selectedAlert)}
                </div>
                <h2 className="alerts-page-i41" style={{ fontFamily: DMS_FONT_DISPLAY }}>
                  {selectedAlert.folder_name}
                </h2>
              </div>
              <span
                className="alerts-page-i50" style={{ borderRadius: 10, background: selectedAlert.read ? 'var(--vdms-surface)' : clay.pillDangerBg, color: selectedAlert.read ? 'var(--vdms-text-muted)' : clay.pillDangerText, border: selectedAlert.read ? '1px solid var(--vdms-line)' : 'none' }}
              >
                {selectedAlert.read ? 'Read' : 'Unread'}
              </span>
            </div>

            {/* Scrollable Body */}
            <div
              className="vdms-scroll-clean"
              style={{
                flex: '1 1 auto',
                overflowY: 'auto',
                padding: '18px 20px',
                minHeight: 0,
              }}
            >
              {(() => {
                const isDeletion = selectedAlert.alert_type === 'vessel_deleted' || selectedAlert.alert_type === 'document_deleted';
                return (
                  <dl className="alerts-page-i45">
                    <div>
                      <dt className="alerts-page-i46">
                        {isDeletion ? 'Original path' : 'Location / detail'}
                      </dt>
                      <dd className="alerts-page-i51">
                        {selectedAlert.folder_path || 'No detail provided'}
                      </dd>
                    </div>
                    {isDeletion && (
                      <div>
                        <dt className="alerts-page-i46">Site</dt>
                        <dd className="alerts-page-i47">{selectedAlert.site_name || 'Unknown site'}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="alerts-page-i46">Department</dt>
                      <dd className="alerts-page-i47">{selectedAlert.department || 'Application'}</dd>
                    </div>
                    <div>
                      <dt className="alerts-page-i46">
                        {isDeletion ? 'Deleted by' : 'Created by'}
                      </dt>
                      <dd className="alerts-page-i47">
                        {selectedAlert.created_by_name || selectedAlert.created_by_email || (isDeletion ? 'Unknown user' : 'System')}
                      </dd>
                    </div>
                    {isDeletion && selectedAlert.reason && (
                      <div>
                        <dt className="alerts-page-i46">Reason</dt>
                        <dd className="alerts-page-i47">{selectedAlert.reason}</dd>
                      </div>
                    )}
                    {isDeletion && selectedAlert.item_type && (
                      <div>
                        <dt className="alerts-page-i46">Item type</dt>
                        <dd className="alerts-page-i52">
                          {selectedAlert.vessel_name && selectedAlert.alert_type === 'vessel_deleted' ? 'Vessel' : selectedAlert.item_type}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="alerts-page-i46">Time</dt>
                      <dd className="alerts-page-i47">
                        {selectedAlert.created_at ? new Date(selectedAlert.created_at).toLocaleString() : 'Recent'}
                      </dd>
                    </div>
                  </dl>
                );
              })()}
            </div>

            {/* Sticky Action Footer */}
            <div
              className="alerts-page-i53"
            >
              {!selectedAlert.read && (
                <button
                  type="button"
                  onClick={() => host._markAlertRead(selectedAlert.id)}
                  style={{ ...dmsBtn('primary'), height: 32, padding: '0 14px', fontSize: 12 }}
                >
                  Mark as read
                </button>
              )}
              {(selectedAlert.alert_type === 'vessel_deleted' || selectedAlert.alert_type === 'document_deleted') && (
                <button
                  type="button"
                  onClick={() => { host._markAlertRead(selectedAlert.id); void host._goToView('recycle'); }}
                  style={{ ...dmsBtn('danger'), height: 32, padding: '0 14px', fontSize: 12 }}
                >
                  View in Recycle Bin
                </button>
              )}
              {selectedAlert.alert_type === 'vessel_unrecognised' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      host._markAlertRead(selectedAlert.id);
                      void host._goToView('vessels');
                      host.setState({ spoClassifyDialog: { anomaly: anomalyForAlert(selectedAlert), provisioning: false, done: false, error: null } });
                    }}
                    style={{ ...dmsBtn('primary'), height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Make it a Vessel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      host._markAlertRead(selectedAlert.id);
                      void host._goToView('vessels');
                      host.setState({ spoClassifyDialog: { anomaly: anomalyForAlert(selectedAlert), provisioning: false, done: false, doneNormal: false, error: null } });
                    }}
                    style={{ ...dmsBtn('secondary'), height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Normal Folder
                  </button>
                </>
              )}
              {(selectedAlert.alert_type === 'file_outside_structure' || selectedAlert.alert_type === 'subfolder_anomaly') && (
                <button
                  type="button"
                  onClick={() => {
                    host._markAlertRead(selectedAlert.id);
                    void host._goToView('vessels');
                    if (selectedAlert.alert_type === 'file_outside_structure') {
                      const normName = (v: string): string => (v || '').trim().toLowerCase();
                      const vName = selectedAlert.vessel_name;
                      const subFolderOptions = vName
                        ? Array.from(new Map(host.state.rows
                            .filter(r => normName(r.vesselName) === normName(vName) && r.canUpload)
                            .map(r => [r.groupKey, { label: r.subFolderPath, groupKey: r.groupKey, uploadFolderId: r.uploadFolderId, subFolderPath: r.subFolderPath }])).values()).slice(0, 40)
                        : [];
                      host.setState({ spoFileAlertDialog: { fileId: selectedAlert.drive_item_id || '', fileName: selectedAlert.folder_name, spoPath: selectedAlert.spo_path || selectedAlert.folder_path, vesselName: selectedAlert.vessel_name, subFolderOptions, moving: false, moved: false, error: null } });
                    }
                  }}
                  style={{ ...dmsBtn('secondary'), height: 32, padding: '0 14px', fontSize: 12 }}
                >
                  {selectedAlert.alert_type === 'file_outside_structure' ? 'Review File' : 'Track in Vessels'}
                </button>
              )}
              {(selectedAlert.alert_type === 'vessel_unrecognised' || selectedAlert.alert_type === 'file_outside_structure') && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      host._markAlertRead(selectedAlert.id);
                      host.setState({ spoClassifyDialog: { anomaly: anomalyForAlert(selectedAlert), provisioning: false, done: false, error: null } });
                    }}
                    style={{ ...dmsBtn('secondary'), height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Classify
                  </button>
                  <button
                    type="button"
                    onClick={() => host._moveAnomalyToRecycleBin(anomalyForAlert(selectedAlert))}
                    style={{ ...dmsBtn('danger'), height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Move to Recycle Bin
                  </button>
                </>
              )}
            </div>
          </aside>
        ) : (
          <aside
            className="alerts-page-i54" style={{ background: 'var(--vdms-surface)', borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}
          >
            <Icon iconName="MailAlert" className="alerts-page-i55" />
            <div className="alerts-page-i56">No notification selected</div>
            <div className="alerts-page-i57">
              Select a notification from the list to view its full details and actions.
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export function renderAlertsPage(host: VesselEmail): React.ReactElement {
  return <AlertsPage host={host} />;
}
