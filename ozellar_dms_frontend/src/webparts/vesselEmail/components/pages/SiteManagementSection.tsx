/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { Icon } from '@fluentui/react/lib/Icon';
import { clay } from '../clayTheme';
import { VesselRootsControl } from './VesselRootsControl';
import { DMS_FONT_DISPLAY, DMS_ON_ACCENT, dmsBtn, dmsControlStyle, dmsTone } from '../dmsDesignSystem';

/**
 * Sites → Site Management.
 * Moved here (unchanged) from the former Settings → Site Management tab —
 * same component, same state, same handlers, same backend calls
 * (app/main.py's /api/admin/* site-configuration endpoints). Lives on the
 * main Sites page now so site browsing and site administration are in one
 * place; Settings no longer has a Site Management tab.
 */
function SiteIntegrationInfo({ host }: { host: VesselEmail }): React.ReactElement {
  const [info, setInfo] = React.useState<any>(null);
  const [adminConfig, setAdminConfig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

  // Default site state
  const [settingDefaultKey, setSettingDefaultKey] = React.useState<string | null>(null);
  const [defaultMsg, setDefaultMsg] = React.useState<string | null>(null);

  // Site visibility toggle state
  const [togglingSiteKey, setTogglingSiteKey] = React.useState<string | null>(null);
  const [removingSiteKey, setRemovingSiteKey] = React.useState<string | null>(null);
  const [visibilityMsg, setVisibilityMsg] = React.useState<string | null>(null);

  // Add-site state
  const [showAddSite, setShowAddSite] = React.useState<boolean>(false);
  const [addSiteTenantSites, setAddSiteTenantSites] = React.useState<any[]>([]);
  const [addSiteTenantLoading, setAddSiteTenantLoading] = React.useState<boolean>(false);
  const [addSiteSearch, setAddSiteSearch] = React.useState<string>('');
  const [addSiteSelected, setAddSiteSelected] = React.useState<any>(null);
  const [addSiteDrives, setAddSiteDrives] = React.useState<any[]>([]);
  const [addSiteDrivesLoading, setAddSiteDrivesLoading] = React.useState<boolean>(false);
  const [addSiteSelDrive, setAddSiteSelDrive] = React.useState<any>(null);
  const [addSiteDisplayName, setAddSiteDisplayName] = React.useState<string>('');
  const [addSiteKey, setAddSiteKey] = React.useState<string>('');
  const [addSiteSaving, setAddSiteSaving] = React.useState<boolean>(false);
  const [addSiteMsg, setAddSiteMsg] = React.useState<string | null>(null);

  // Audit changes
  const [siteChanges, setSiteChanges] = React.useState<any[]>([]);
  const [showChanges, setShowChanges] = React.useState<boolean>(false);

  // Tenant-site discovery
  const [tenantSitesLoading, setTenantSitesLoading] = React.useState<boolean>(false);
  const [siteSearch, setSiteSearch] = React.useState<string>('');

  const loadTenantSites = React.useCallback(async (base: string, headers: any, forceRefresh: boolean = false): Promise<string | null> => {
    setTenantSitesLoading(true);
    try {
      const r = await fetch(`${base}/api/admin/discover-sites${forceRefresh ? '?force_refresh=true' : ''}`, { headers, cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return d?.detail || `Site discovery failed (${r.status})`;
      if (Array.isArray(d.sites)) setAddSiteTenantSites(d.sites);
      return null;
    } catch (e: any) {
      return e?.message || 'Could not reach the server';
    } finally {
      setTenantSitesLoading(false);
    }
  }, []);

  const loadAdminConfig = React.useCallback(async () => {
    const base = host._base();
    try {
      const r = await fetch(`${base}/api/admin/site-configuration?include_hidden=true`, { headers: host._headers() });
      if (r.status === 403) { setIsAdmin(false); return; }
      const d = await r.json();
      if (d) {
        setAdminConfig(d);
        setIsAdmin(true);
      }
    } catch {
      // ignore
    }
  }, [host]);

  const loadSiteChanges = React.useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${host._base()}/api/admin/site-changes?limit=10`, { headers: host._headers() });
      const data = await response.json();
      if (response.ok) setSiteChanges(data.changes || []);
    } catch {
      // Keep the existing audit list when refresh fails.
    }
  }, [host]);

  const handleSetDefaultSite = async (siteKey: string) => {
    setSettingDefaultKey(siteKey);
    setDefaultMsg(null);
    try {
      const r = await fetch(`${host._base()}/api/admin/set-default-site`, {
        method: 'POST',
        headers: { ...host._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_name: siteKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to set default site');
      setDefaultMsg(`✓ Successfully set "${d.new_site_name || siteKey}" as the default site.`);
      setInfo((prev: any) => ({ ...(prev || {}), active_site: d.new_site, site_name: d.new_site_name }));
      setAdminConfig((prev: any) => prev ? { ...prev, current_site: d.new_site, current_site_name: d.new_site_name } : prev);
      void Promise.all([host._loadDocumentSites(), host._loadData()]).catch(() => undefined);
      setTimeout(() => setDefaultMsg(null), 4000);
    } catch (e: any) {
      setDefaultMsg(`⚠️ ${e?.message || 'Failed to set default site'}`);
      setTimeout(() => setDefaultMsg(null), 4000);
    } finally {
      setSettingDefaultKey(null);
    }
  };

  const handleToggleVisibility = async (siteKey: string, currentIsHidden: boolean) => {
    setTogglingSiteKey(siteKey);
    setVisibilityMsg(null);
    try {
      const r = await fetch(`${host._base()}/api/admin/site-configurations/${encodeURIComponent(siteKey)}/visibility`, {
        method: 'PATCH',
        headers: { ...host._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: !currentIsHidden }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to update visibility');
      await Promise.all([loadAdminConfig(), loadSiteChanges()]);
      // Documents/Vessels' own site list, plus the Home dashboard's cached
      // counts. Deliberately UNforced (no force_refresh): the backend just
      // reconciled its site list in place when the visibility change above
      // invalidated the cache, so an unforced read already reflects this
      // instantly — forcing here would instead make this request itself
      // wait on a full live rescan of every site (20-30s+), which is the
      // "stuck for 20-30 seconds" symptom this replaces.
      void Promise.all([
        host._loadDocumentSites(),
        host._loadData(),
        host._loadDashboardStats(),
      ]).catch(() => undefined);
    } catch (e: any) {
      setVisibilityMsg(`⚠️ ${e?.message || 'Failed to update visibility'}`);
      setTimeout(() => setVisibilityMsg(null), 4000);
    } finally {
      setTogglingSiteKey(null);
    }
  };

  const handleRemoveSite = async (siteKey: string, displayName: string): Promise<void> => {
    if (!window.confirm(`Remove "${displayName}" from the Site Management list? The SharePoint site and its files will not be deleted, but this cannot be undone from here.`)) return;
    setRemovingSiteKey(siteKey);
    setVisibilityMsg(null);
    try {
      const r = await fetch(`${host._base()}/api/admin/site-configurations/${encodeURIComponent(siteKey)}`, {
        method: 'DELETE',
        headers: host._headers(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'Failed to remove site');
      await Promise.all([loadAdminConfig(), loadSiteChanges()]);
      // Unforced — see the matching comment in handleToggleVisibility.
      void Promise.all([
        host._loadDocumentSites(),
        host._loadData(),
        host._loadDashboardStats(),
      ]).catch(() => undefined);
    } catch (e: any) {
      setVisibilityMsg(`⚠️ ${e?.message || 'Failed to remove site'}`);
    } finally {
      setRemovingSiteKey(null);
    }
  };

  React.useEffect(() => {
    const base = host._base();
    const userEmail = host.props.userEmail;

    // Fetch basic site info
    fetch(`${base}/api/config/site-info`, { headers: host._headers() })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch((e: any) => setErr(e?.message || 'Failed to load site information'));

    if (userEmail) {
      fetch(`${base}/api/admin/site-configuration?include_hidden=true`, { headers: host._headers() })
        .then(r => {
          if (r.status === 403) { setIsAdmin(false); setLoading(false); return null; }
          return r.json();
        })
        .then(d => {
          if (d) {
            setAdminConfig(d);
            setIsAdmin(true);

            void loadSiteChanges();

            void loadTenantSites(base, host._headers());
          }
          setLoading(false);
        })
        .catch(() => { setIsAdmin(false); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, [host, host.props.userEmail, loadTenantSites, loadSiteChanges]);

  const filteredConfiguredSites = (adminConfig?.available_sites || []).filter((s: any) => {
    const q = siteSearch.toLowerCase();
    return !q || `${s.display_name} ${s.name}`.toLowerCase().includes(q);
  });

  if (loading) return <div className="site-management-section-i1">Loading site configuration...</div>;

  const successTone = dmsTone('success');
  const warnTone = dmsTone('warning');
  const dangerTone = dmsTone('danger');

  return (
    <div className="site-management-section-i2" style={{ width: '100%' }}>
      <div className="site-management-section-i3" style={{ borderRadius: 8, width: '100%' }}>
        <div className="site-management-section-i4">
          <span><Icon iconName="Globe" aria-hidden="true" className="site-management-section-i5" /></span> Default Site: {info?.site_name || info?.active_site}
        </div>
        <div className="site-management-section-i6" style={{ gridTemplateColumns: '170px minmax(0, 1fr)', width: '100%' }}>
          <span className="site-management-section-i7">Site Key:</span>
          <span className="site-management-section-i8" style={{ fontFamily: 'monospace' }}>{info?.active_site}</span>

          <span className="site-management-section-i7">Database:</span>
          <span className="site-management-section-i9" style={{ fontFamily: 'monospace', color: info?.db_configured ? successTone.fg : warnTone.fg }}>
            {info?.db_name || (info?.db_configured ? 'Connected' : 'In-Memory Stub')}
          </span>

          <span className="site-management-section-i7">SharePoint Status:</span>
          <span className="site-management-section-i9" style={{ color: info?.sp_configured ? successTone.fg : 'var(--vdms-text-muted)' }}>
            {info?.sp_configured ? <><Icon iconName="CheckMark" aria-hidden="true" className="site-management-section-i10" /> Configured</> : <><Icon iconName="StatusCircleRing" aria-hidden="true" className="site-management-section-i10" /> Stub / Local Mode</>}
          </span>

          <span className="site-management-section-i7">Drive ID:</span>
          <span className="site-management-section-i11" style={{ fontFamily: 'monospace' }}>
            {info?.drive_id || '—'}
          </span>

          <span className="site-management-section-i7">Backend Mode:</span>
          <span className="site-management-section-i9" style={{ color: clay.accent }}>{info?.mode}</span>
        </div>
      </div>

      {isAdmin && adminConfig && (
        <div className="site-management-section-i12" style={{ background: successTone.bg, border: `1px solid ${successTone.bg}`, borderRadius: 8 }}>
          <div className="site-management-section-i13" style={{ color: successTone.fg }}>
            <span><Icon iconName="Contact" aria-hidden="true" className="site-management-section-i5" /> Configured SharePoint Sites & Default Site</span>
            <button
              onClick={() => {
                void (async () => {
                  setVisibilityMsg(null);
                  const [error] = await Promise.all([
                    loadTenantSites(host._base(), host._headers(), true),
                    loadAdminConfig(),
                    loadSiteChanges(),
                  ]);
                  // Keep the app-wide site pickers (Documents, Sites, Vessels) in step with the refreshed list.
                  void host._loadDocumentSites().catch(() => undefined);
                  setVisibilityMsg(error ? `⚠️ ${error}` : '✓ Sites refreshed.');
                  setTimeout(() => setVisibilityMsg(null), 4000);
                })();
              }}
              disabled={tenantSitesLoading}
              title="Refresh all tenant and configured sites"
              style={dmsBtn('primary', !tenantSitesLoading)}
            >
              {tenantSitesLoading ? <><Icon iconName="Sync" aria-hidden="true" className="site-management-section-i14" /> Loading…</> : <><Icon iconName="Refresh" aria-hidden="true" className="site-management-section-i14" /> Refresh Sites</>}
            </button>
          </div>
          <p className="site-management-section-i15" style={{ color: successTone.fg }}>
            Select the default site and manage site visibility. Hiding a site removes it from Sites, Documents, and Vessel Management modules. Hidden sites remain disabled here until you click Unhide.
          </p>

          {/* Search filter */}
          <input
            value={siteSearch}
            onChange={e => setSiteSearch(e.target.value)}
            placeholder="Search site by name or URL…"
            style={{ ...dmsControlStyle(), width: '100%', marginBottom: 8 }}
          />

          {defaultMsg && (
            <div className="site-management-section-i16" style={{ background: defaultMsg.startsWith('✓') ? successTone.bg : dangerTone.bg, border: `1px solid ${defaultMsg.startsWith('✓') ? successTone.bg : dangerTone.bg}`, color: defaultMsg.startsWith('✓') ? successTone.fg : dangerTone.fg, borderRadius: 6 }}>
              {defaultMsg}
            </div>
          )}

          {visibilityMsg && (
            <div className="site-management-section-i16" style={{ background: dangerTone.bg, border: `1px solid ${dangerTone.bg}`, color: dangerTone.fg, borderRadius: 6 }}>
              {visibilityMsg}
            </div>
          )}

          {/* ── Configured Sites card list ── */}
          <div className="site-management-section-i17">
            <div className="site-management-section-i18">
              <label className="site-management-section-i19" style={{ color: successTone.fg }}>Configured Sites:</label>
              <span className="site-management-section-i20">Hidden sites remain listed here for unhide.</span>
            </div>

            <div className="site-management-section-i21">
              {filteredConfiguredSites.map((site: any) => {
                const isCurrent = site.name === adminConfig.current_site;
                const isHidden = !!site.is_hidden;
                const isToggling = togglingSiteKey === site.name;
                const isSettingDefault = settingDefaultKey === site.name;
                const isRemoving = removingSiteKey === site.name;

                return (
                  <React.Fragment key={`cfg-${site.name}`}>
                  <div
                    className="site-management-section-i22" style={{ borderRadius: 8, border: `1px solid ${isCurrent ? successTone.bg : isHidden ? 'var(--vdms-line-strong)' : successTone.bg}`, background: isCurrent ? successTone.bg : isHidden ? 'var(--vdms-surface-alt)' : successTone.bg, opacity: isHidden && !isCurrent ? 0.65 : 1 }}
                  >
                    <div>
                      <div className="site-management-section-i23">
                        <span className="site-management-section-i24" style={{ color: isHidden ? 'var(--vdms-text-muted)' : successTone.fg }}>
                          {site.display_name || site.name}
                        </span>
                        {isCurrent && (
                          <span className="site-management-section-i25" style={{ background: successTone.fg, color: DMS_ON_ACCENT, borderRadius: 8 }}>
                            <Icon iconName="FavoriteStar" aria-hidden="true" className="site-management-section-i26" /> DEFAULT
                          </span>
                        )}
                        {isHidden && (
                          <span className="site-management-section-i27" style={{ borderRadius: 8 }}>
                            HIDDEN
                          </span>
                        )}
                      </div>
                      <span className="site-management-section-i28" style={{ fontFamily: 'monospace' }}>
                        {site.name}
                      </span>
                    </div>
                    <div className="site-management-section-i29">
                      {/* Set as Default button */}
                      {!isCurrent && !isHidden && (
                        <button
                          onClick={() => handleSetDefaultSite(site.name)}
                          disabled={isSettingDefault || isToggling}
                          title="Set this site as the default site"
                          style={dmsBtn('primary', !(isSettingDefault || isToggling))}
                        >
                          {isSettingDefault ? <><Icon iconName="Sync" aria-hidden="true" className="site-management-section-i14" /> Setting…</> : <><Icon iconName="FavoriteStar" aria-hidden="true" className="site-management-section-i14" /> Set as Default</>}
                        </button>
                      )}
                      {/* Hidden rows stay visible here, but are disabled everywhere else. */}
                      {isHidden && (
                        <button
                          type="button"
                          disabled
                          style={dmsBtn('secondary', false)}
                        >
                          HIDDEN
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleVisibility(site.name, isHidden)}
                        disabled={isCurrent || isToggling || (!isHidden && isCurrent)}
                        title={
                          isCurrent
                            ? 'The default site cannot be hidden. Set another site as default first.'
                            : isHidden ? 'Make this site visible across all modules' : 'Hide this site from Sites, Documents, and Vessel Management'
                        }
                        style={dmsBtn('secondary', !isCurrent)}
                      >
                        {isToggling ? <Icon iconName="Sync" aria-hidden="true" className="site-management-section-i14" /> : isHidden ? 'Unhide' : 'Hide'}
                      </button>
                      {/* Shown for every configured site, not just ones added via
                          "Add New Site" — an .env-discovered site (e.g. local/dev/prod)
                          has no DB row until it's removed or hidden, but it should
                          still be removable. */}
                      <button
                        type="button"
                        onClick={() => void handleRemoveSite(site.name, site.display_name || site.name)}
                        disabled={isCurrent || isToggling || isRemoving}
                        title={isCurrent ? 'Switch to a different site before removing this registration.' : 'Permanently remove this site from the Site Management list'}
                        style={dmsBtn('danger', !isCurrent)}
                      >
                        {isRemoving ? <><Icon iconName="Sync" aria-hidden="true" className="site-management-section-i14" /> Removing…</> : 'Remove'}
                      </button>
                    </div>
                  </div>
                  {!isHidden && <VesselRootsControl host={host} siteKey={site.name} />}
                  </React.Fragment>
                );
              })}
              {filteredConfiguredSites.length === 0 && (
                <div className="site-management-section-i30">
                  No configured sites match your search.
                </div>
              )}
            </div>
          </div>

          {/* ── Add New Site section ── */}
          <div className="site-management-section-i31" style={{ border: `1px solid ${successTone.bg}`, borderRadius: 8 }}>
            <button
              onClick={async () => {
                const next = !showAddSite;
                setShowAddSite(next);
                if (next && addSiteTenantSites.length === 0) {
                  setAddSiteTenantLoading(true);
                  try {
                    const r = await fetch(`${host._base()}/api/admin/discover-sites`, { headers: host._headers() });
                    const d = await r.json();
                    setAddSiteTenantSites(d.sites || []);
                  } catch { /* ignore */ } finally { setAddSiteTenantLoading(false); }
                }
              }}
              className="site-management-section-i32" style={{ width: '100%', background: successTone.bg, color: successTone.fg }}
            >
              {showAddSite ? <><Icon iconName="Cancel" aria-hidden="true" className="site-management-section-i10" /> Cancel Add Site</> : <><Icon iconName="Add" aria-hidden="true" className="site-management-section-i10" /> Add New Site</>}
            </button>

            {showAddSite && (
              <div className="site-management-section-i33" style={{ background: 'var(--vdms-surface)' }}>
                <div className="site-management-section-i34">Search and select a SharePoint site to register as a new configured site.</div>
                
                {host.props.siteUrl && (
                  <div style={{
                    marginBottom: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 13 }}>Current SharePoint Site:</div>
                      <div style={{ fontSize: 12, color: 'var(--vdms-text-muted)', wordBreak: 'break-all' }}>{host.props.siteUrl}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const pathParts = (host.props.siteUrl || '').split('/').filter(Boolean);
                        const cleanName = pathParts[pathParts.length - 1] || 'DemoDMS';
                        const rawKey = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'demodms';
                        const currentSiteItem = {
                          id: host.props.siteId || `site_${rawKey}`,
                          name: cleanName,
                          web_url: host.props.siteUrl
                        };
                        setAddSiteSelected(currentSiteItem);
                        setAddSiteDisplayName(cleanName);
                        setAddSiteKey(rawKey);
                        const drv = { id: host.props.driveId || 'default', name: 'Documents', drive_type: 'documentLibrary' };
                        setAddSiteDrives([drv]);
                        setAddSiteSelDrive(drv);
                      }}
                      style={{
                        padding: '6px 14px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Use Current Site
                    </button>
                  </div>
                )}

                <input
                  value={addSiteSearch}
                  onChange={e => setAddSiteSearch(e.target.value)}
                  placeholder="Search tenant sites…"
                  style={{ ...dmsControlStyle(), width: '100%', marginBottom: 8 }}
                />
                {addSiteTenantLoading && <div className="site-management-section-i35"><Icon iconName="Sync" aria-hidden="true" className="site-management-section-i10" /> Loading tenant sites…</div>}
                <div className="site-management-section-i36" style={{ borderRadius: 6 }}>
                  {addSiteTenantSites
                    .filter(s => {
                      const text = `${s.name} ${s.web_url}`.toLowerCase();
                      if (['nissen', 'nks', 'sg-nissenkaiun', 'contentstorage'].some(x => text.indexOf(x) !== -1)) return false;
                      return !addSiteSearch || text.indexOf(addSiteSearch.toLowerCase()) !== -1;
                    })
                    .map(ts => (
                      <button
                        key={ts.id}
                        onClick={async () => {
                          setAddSiteSelected(ts);
                          setAddSiteSelDrive(null);
                          setAddSiteDrives([]);
                          setAddSiteDisplayName(ts.name || '');
                          const rawKey = (ts.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                          setAddSiteKey(rawKey);
                          setAddSiteDrivesLoading(true);
                          try {
                            const r = await fetch(`${host._base()}/api/admin/discover-sites/${encodeURIComponent(ts.id)}/drives`, { headers: host._headers() });
                            const d = await r.json();
                            const drives = r.ok ? (d.drives || []) : [];
                            setAddSiteDrives(drives);
                            if (drives.length === 1) setAddSiteSelDrive(drives[0]);
                          } catch { setAddSiteDrives([]); } finally { setAddSiteDrivesLoading(false); }
                        }}
                        className="site-management-section-i37" style={{ width: '100%', background: addSiteSelected?.id === ts.id ? clay.accentSoft : 'var(--vdms-surface)' }}
                      >
                        <strong>{ts.name}</strong>
                        <span className="site-management-section-i38">{ts.web_url}</span>
                      </button>
                    ))}
                </div>

                {/* Drive picker */}
                {addSiteSelected && (
                  <div className="site-management-section-i39">
                    <div className="site-management-section-i40">Document Library:</div>
                    {addSiteDrivesLoading && <div className="site-management-section-i20">Loading libraries…</div>}
                    {!addSiteDrivesLoading && addSiteDrives.map(drv => (
                      <button
                        key={drv.id}
                        onClick={() => setAddSiteSelDrive(drv)}
                        className="site-management-section-i41" style={{ width: '100%', border: `1px solid ${addSiteSelDrive?.id === drv.id ? successTone.fg : 'var(--vdms-line)'}`, background: addSiteSelDrive?.id === drv.id ? successTone.bg : 'var(--vdms-surface)' }}
                      >
                        <strong>{drv.name}</strong>
                        <span className="site-management-section-i38">{drv.drive_type}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Display name + site key inputs */}
                {addSiteSelected && addSiteSelDrive && (
                  <div className="site-management-section-i42">
                    <input
                      value={addSiteDisplayName}
                      onChange={e => setAddSiteDisplayName(e.target.value)}
                      placeholder="Display Name (e.g. Vessel Mgmt - Production)"
                      style={dmsControlStyle()}
                    />
                    <input
                      value={addSiteKey}
                      onChange={e => setAddSiteKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="Internal site key (e.g. vessel_prod)"
                      style={{ ...dmsControlStyle(), fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                {addSiteMsg && (
                  <div className="site-management-section-i16" style={{ background: addSiteMsg.startsWith('✓') ? successTone.bg : dangerTone.bg, border: `1px solid ${addSiteMsg.startsWith('✓') ? successTone.bg : dangerTone.bg}`, color: addSiteMsg.startsWith('✓') ? successTone.fg : dangerTone.fg, borderRadius: 6 }}>
                    {addSiteMsg}
                  </div>
                )}

                <button
                  disabled={!addSiteSelected || !addSiteSelDrive || !addSiteDisplayName.trim() || !addSiteKey.trim() || addSiteSaving}
                  onClick={async () => {
                    if (!addSiteSelected || !addSiteSelDrive || !addSiteDisplayName.trim() || !addSiteKey.trim()) return;
                    setAddSiteSaving(true);
                    setAddSiteMsg(null);
                    try {
                      const r = await fetch(`${host._base()}/api/admin/site-configurations`, {
                        method: 'POST',
                        headers: { ...host._headers(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          site_key: addSiteKey.trim(),
                          display_name: addSiteDisplayName.trim(),
                          site_name: addSiteSelected.name,
                          site_id: addSiteSelected.id,
                          drive_id: addSiteSelDrive.id,
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.detail || 'Failed to save site');
                      setAddSiteMsg(`✓ Site "${addSiteDisplayName.trim()}" registered successfully.`);
                      // Refresh the configured-sites list, and the Home
                      // dashboard's cached counts. Deliberately UNforced: the
                      // backend already reconciled the new site into the
                      // dashboard's site list the instant the save above
                      // invalidated the cache (see
                      // invalidate_dashboard_stats_cache), so it appears
                      // immediately with placeholder counts while its real
                      // scan runs in the background — forcing here would
                      // instead make this request block on a full live
                      // rescan of every site before the new one even shows up.
                      await Promise.all([loadAdminConfig(), loadSiteChanges()]);
                      void host._loadDocumentSites();
                      void host._loadDashboardStats().catch(() => undefined);
                      // Reset add-site form
                      setTimeout(() => {
                        setShowAddSite(false);
                        setAddSiteSelected(null); setAddSiteSelDrive(null);
                        setAddSiteDrives([]); setAddSiteDisplayName(''); setAddSiteKey('');
                        setAddSiteMsg(null); setAddSiteSearch('');
                      }, 2000);
                    } catch (e: any) {
                      setAddSiteMsg(`⚠️ ${e?.message || 'Failed to save'}`);
                    } finally {
                      setAddSiteSaving(false);
                    }
                  }}
                  style={dmsBtn('primary', !(!addSiteSelected || !addSiteSelDrive || !addSiteDisplayName.trim() || !addSiteKey.trim() || addSiteSaving))}
                >
                  {addSiteSaving ? <><Icon iconName="Sync" aria-hidden="true" className="site-management-section-i10" /> Saving…</> : <><Icon iconName="CheckMark" aria-hidden="true" className="site-management-section-i10" /> Save & Register Site</>}
                </button>
              </div>
            )}
          </div>

          {showChanges && siteChanges.length > 0 && (
            <div className="site-management-section-i43" style={{ borderTop: `1px solid ${successTone.bg}` }}>
              <div className="site-management-section-i44" style={{ color: successTone.fg }}>Recent Changes:</div>
              <div className="site-management-section-i45" style={{ color: successTone.fg }}>
                {siteChanges.map((change: any) => (
                  <div key={change.id} className="site-management-section-i46" style={{ borderBottom: `1px solid ${successTone.bg}` }}>
                    <div>
                      <strong>
                        {change.action === 'hidden' ? 'Hidden' : change.action === 'unhidden' ? 'Unhidden' : change.action === 'removed' ? 'Removed' : `${change.previous_site} → ${change.new_site}`}
                      </strong>
                      {change.action && change.action !== 'success' ? ` ${change.new_site_name || change.new_site}` : ` (${change.status})`}
                      {change.action && change.action !== 'success' && <span> ({change.status})</span>}
                    </div>
                    <div className="site-management-section-i47" style={{ color: successTone.fg }}>
                      {change.changed_by_email} • {new Date(change.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {siteChanges.length > 0 && (
            <button
              onClick={() => setShowChanges(!showChanges)}
              className="site-management-section-i48" style={{ color: successTone.fg }}
            >
              {showChanges ? <Icon iconName="ChevronDown" aria-hidden="true" className="site-management-section-i26" /> : <Icon iconName="ChevronRight" aria-hidden="true" className="site-management-section-i26" />} Hide / Show Recent Changes
            </button>
          )}
        </div>
      )}

      {err && (
        <div className="site-management-section-i49" style={{ background: dangerTone.bg, border: `1px solid ${dangerTone.bg}`, borderRadius: 6, color: dangerTone.fg }}>
          <Icon iconName="Warning" aria-hidden="true" className="site-management-section-i10" /> {err}
        </div>
      )}
    </div>
  );
}

/**
 * Wraps the (unchanged) site-administration panel above in a card that
 * matches the rest of the Sites page — a heading plus a white, rounded,
 * shadowed container — instead of the bare block it used to sit in under
 * Settings' own left-nav shell.
 */
export function SiteManagementSection({ host }: { host: VesselEmail }): React.ReactElement {
  return (
    <div className="site-management-section-i50">
      <h2 className="site-management-section-i51" style={{ fontFamily: DMS_FONT_DISPLAY }}>Site Management</h2>
      <div className="site-management-section-i52" style={{ boxShadow: clay.shadowRaised }}>
        <SiteIntegrationInfo host={host} />
      </div>
    </div>
  );
}
