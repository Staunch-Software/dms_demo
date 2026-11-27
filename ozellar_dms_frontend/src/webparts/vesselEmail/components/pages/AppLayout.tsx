import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import {
  badge, GROUP_COLORS, DATASOURCE_TAGS_MAP, VESSEL_TYPES, cleanName, suggestTagFromFilename,
  INITIAL_MOCK_DOCUMENTS, INITIAL_MOCK_TEMPLATES,
  INITIAL_MOCK_NOTIFICATIONS, INITIAL_MOCK_USERS,
} from '../constants';
import type {
  FlatRow, GroupedRow, VesselRecord,
} from '../types/rows';
import type { BentoEmailLog } from '../types/bento';
import type { AppView, ModalMode } from '../types/view';
import type {
  FormState, DocPreviewItem, DeletedNode, DocumentItem, TemplateItem,
  NotificationItem, UserItem, AlertItem,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import { isMobileWidth, isTabletOrBelow } from '../responsive';
import { ThemeProvider } from '@fluentui/react';
import { clay, buildDeepHarborTheme } from '../clayTheme';
import { injectFuturisticTheme } from '../futuristicTheme';
import { ShipTransitions } from './ShipScenes';
import { DmsLoadingState, dmsBtn } from '../dmsDesignSystem';

// View → display label
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  list: 'Vessel DMS',
  vessels: 'Vessel Master',
  sites: 'Sites',
  certificates: 'Certificates & Compliance',
  certificate_master: 'Certificate Master',
  service_agreements: 'Service Agreements',
  ship_register: 'Ship Register',
  templates: 'Templates',
  migration: 'Migration Assistant',
  reports: 'Reports',
  users: 'User Management',
  settings: 'Settings',
  profile: 'Profile',
  alerts: 'Notifications',
  bento_email: 'AI Bento Email',
  email_notify: 'AI Bento Email',
  recycle: 'Recycle Bin',
  archive: 'Archive',
};

/** Live deletion popup (Part 3): a transient toast for any newly-seen
 * vessel_deleted / document_deleted alert — the same deletion_log-backed
 * rows the alert bell already lists (GET /api/alerts/all, polled every
 * 30s by host._fetchAlerts). Shows who deleted it, what, and which site,
 * auto-dismisses after 10s, can be dismissed early, and clicking it
 * deep-links into the Recycle Bin — reusing the exact same handling the
 * bell dropdown's own "View in Recycle Bin" buttons already use. */
function DeletionToastLayer({ host }: { host: VesselEmail }): React.ReactElement | null {
  // All deletion notifications are consolidated into the single bottom toast
  // layer (_renderSpoDeletionToasts in VesselEmail.tsx) so duplicate toasts
  // never appear on both bottom and right sides.
  return null;
}

function getEmbeddedDocUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl, typeof window !== 'undefined' ? window.location.href : 'https://sharepoint.com');
    u.searchParams.set('env', 'WebView');
    return u.toString();
  } catch {
    const sep = rawUrl.indexOf('?') >= 0 ? '&' : '?';
    return `${rawUrl}${sep}env=WebView`;
  }
}

interface ClassicSiteLibraryViewerProps {
  url: string;
  onClose: () => void;
}

interface ClassicSiteLibraryViewerState {
  loadedUrl: string;
  loading: boolean;
  slow: boolean;
}

class ClassicSiteLibraryViewer extends React.Component<ClassicSiteLibraryViewerProps, ClassicSiteLibraryViewerState> {
  private _slowTimer: any = null;

  constructor(props: ClassicSiteLibraryViewerProps) {
    super(props);
    this.state = {
      loadedUrl: '',
      loading: true,
      slow: false,
    };
  }

  public componentDidMount(): void {
    this._startSlowTimer();
  }

  public componentDidUpdate(prevProps: ClassicSiteLibraryViewerProps): void {
    if (prevProps.url !== this.props.url) {
      this.setState({ loading: true, slow: false });
      this._startSlowTimer();
    }
  }

  public componentWillUnmount(): void {
    if (this._slowTimer) {
      clearTimeout(this._slowTimer);
      this._slowTimer = null;
    }
  }

  private _startSlowTimer(): void {
    if (this._slowTimer) clearTimeout(this._slowTimer);
    this._slowTimer = setTimeout(() => {
      if (this.state.loading) {
        this.setState({ slow: true });
      }
    }, 6000);
  }

  private _handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement>): void => {
    if (this._slowTimer) {
      clearTimeout(this._slowTimer);
      this._slowTimer = null;
    }
    this.setState({ loading: false, loadedUrl: this.props.url, slow: false });

    const f = e.currentTarget;
    const injectFlushStyles = (): void => {
      try {
        const d = f.contentDocument;
        if (!d || !d.head) return;
        const styleId = 'vdms-flush-sharepoint-style';
        let s = d.getElementById(styleId) as HTMLStyleElement | null;
        if (!s) {
          s = d.createElement('style');
          s.id = styleId;
          d.head.appendChild(s);
        }
        s.textContent = `
          html, body, #s4-workspace, #spPageChromeAppDiv, #spSiteHeader, #spCommandBar, #spPageCanvasContent, .od-Files-main {
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: hidden !important;
          }
          #spPageCanvasContent,
          #spCommandBar,
          #spSiteHeader,
          .od-Files-main,
          .od-ItemContent,
          .od-FilesContent,
          [class*="canvasContent"],
          [class*="pageContent"],
          [class*="viewContainer"],
          [class*="mainContent"],
          [class*="SPCanvas"],
          [class*="CanvasZone"],
          [class*="ControlZone"],
          [data-automation-id="pageContent"],
          [data-automationid="DetailsList"],
          .ms-DetailsList {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
          }
          div[class*="card-"],
          div[class*="Card-"],
          div[class*="surface-"],
          div[style*="border-radius"],
          div[style*="box-shadow"] {
            border-radius: 0 !important;
            box-shadow: none !important;
            margin-right: 0 !important;
            margin-bottom: 0 !important;
          }
        `;

        // Modern SharePoint uses hashed class names, so selectors alone miss the inset card.
        // Walk the large ancestors of the content and flatten them: white, square, no shadow, no inset.
        const w = f.clientWidth || 1;
        const h = f.clientHeight || 1;
        const view = d.defaultView;
        if (view && d.body) {
          const all = d.body.querySelectorAll<HTMLElement>('div, section, main');
          for (let i = 0; i < all.length; i++) {
            const el = all[i];
            const r = el.getBoundingClientRect();
            if (r.width < w * 0.6 || r.height < h * 0.35) continue;
            const cs = view.getComputedStyle(el);
            const hasRadius = cs.borderTopLeftRadius !== '0px' || cs.borderTopRightRadius !== '0px';
            const hasShadow = cs.boxShadow !== 'none';
            const insetLeft = r.left > 1 && r.left < 60;
            const gapRight = w - r.right > 1 && w - r.right < 60;
            const insetTop = r.top > 1 && r.top < 60;
            const hasBorder = cs.borderTopWidth !== '0px' || cs.borderLeftWidth !== '0px';
            if (!hasRadius && !hasShadow && !insetLeft && !gapRight && !insetTop && !hasBorder) continue;
            el.style.setProperty('border-radius', '0', 'important');
            el.style.setProperty('box-shadow', 'none', 'important');
            el.style.setProperty('border', '0', 'important');
            if (insetTop) el.style.setProperty('margin-top', '0', 'important');
            el.style.setProperty('background-color', '#ffffff', 'important');
            if (insetLeft) el.style.setProperty('margin-left', '0', 'important');
            if (gapRight) el.style.setProperty('margin-right', '0', 'important');
            if (insetLeft || gapRight) el.style.setProperty('width', '100%', 'important');
          }
        }
      } catch {
        // Cross-origin fallback handled by env=WebView native rendering
      }
    };

    injectFlushStyles();
    [500, 1500, 3000].forEach(ms => window.setTimeout(injectFlushStyles, ms));
  };

  public render(): React.ReactElement {
    const { url, onClose } = this.props;
    const { loading, slow } = this.state;
    const embedUrl = getEmbeddedDocUrl(url);

    return (
      <div className="app-layout-j1" style={{ borderRadius: 12, background: 'var(--vdms-surface)' }}>
        <div className="app-layout-j2">
          <Icon iconName="DocLibrary" className="app-layout-j3" style={{ color: clay.accent }} />
          <span className="app-layout-j4" style={{ minWidth: 0 }}>
            SharePoint Documents — {url}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-layout-j5" style={{ color: clay.accent }}
          >
            <Icon iconName="OpenInNewWindow" className="app-layout-j6" />
            Open in new tab
          </a>
        </div>

        <div className="app-layout-j7" style={{ background: '#ffffff' }}>
          {loading && (
            <div className="app-layout-j8">
              <DmsLoadingState
                label="Loading SharePoint Documents Library..."
                hint={slow
                  ? "SharePoint Online is taking a bit longer to load inside this view. You can continue waiting or open it in a new tab."
                  : "Connecting directly to your SharePoint document library..."
                }
              />
              {slow && (
                <div className="app-layout-j9">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...dmsBtn('primary'),
                      textDecoration: 'none',
                      fontSize: 12,
                    }}
                  >
                    <Icon iconName="OpenInNewWindow" className="app-layout-j10" />
                    Open in SharePoint Tab
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      ...dmsBtn('ghost'),
                      fontSize: 12,
                    }}
                  >
                    Back to Ozellar Marine DMS
                  </button>
                </div>
              )}
            </div>
          )}

          <iframe
            title="SharePoint Documents library"
            src={embedUrl}
            loading="lazy"
            onLoad={this._handleLoad}
            className="app-layout-j11" style={{ width: '100%', background: '#fff' }}
          />
        </div>
      </div>
    );
  }
}

export function renderLayout(host: VesselEmail, content: React.ReactElement): React.ReactElement {
  const userDisplayName = host.state.customUserDisplayName || host.props.userDisplayName || 'Admin';
  const isNight = host.state.themeMode === 'night';
  const classicOpen = host.state.classicSiteOpen;
  const isWorkspaceFullScreen = host.state.fullScreenWorkspace && host.state.view === 'list' && !classicOpen;
  // The sidebar "Documents" entry opens the traditional SharePoint library over whatever view
  // was active, so the title must follow classicOpen rather than host.state.view.
  const viewLabel = classicOpen ? 'Documents' : (VIEW_LABELS[host.state.view] || host.state.view.replace(/_/g, ' '));
  const viewportWidth = host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const tabletOrBelow = isTabletOrBelow(viewportWidth);
  const phone = isMobileWidth(viewportWidth);

  injectFuturisticTheme();

  // Settings → Color Management (color_settings_api.py) recolors the app at
  // runtime; the clay.* tokens above already pick that up via CSS custom
  // properties (applyColorTheme), and Fluent's own theme is rebuilt here
  // from the same saved colors so its handful of stock controls match.
  const colorSet = isNight ? host.state.colorTheme.night : host.state.colorTheme.light;
  const fluentTheme = buildDeepHarborTheme(colorSet, isNight);

  // Rendered via a portal straight onto <body>: the SharePoint modern-page
  // shell wraps the web part zone in ancestor elements that establish their
  // own containing block for `position: fixed` (a known SPFx/SharePoint
  // quirk), so this overlay's `inset: 0` was being measured against that
  // ancestor's box instead of the real viewport — leaving a stray strip of
  // page chrome visible above the app on every page. Mounting on <body>
  // (never transformed by SharePoint) makes `fixed` pin to the true
  // viewport. React event handling is unaffected — portals still bubble
  // through the React tree, not the DOM tree.
  return ReactDOM.createPortal((
    <ThemeProvider theme={fluentTheme}>
    <div className="vessel-dms-app" style={{
      display: 'flex', alignItems: 'stretch',
      height: '100vh', minHeight: '100vh',
      width: '100vw', overflow: 'hidden',
      background: clay.bg,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999,
    }} data-vessel-theme={host.state.themeMode}>
      <DeletionToastLayer host={host} />
      <ShipTransitions host={host} />
      {!isWorkspaceFullScreen && host._renderSidebar()}

      <div className="app-layout-i11" style={{ minWidth: 0 }}>

        {/* ── Top Bar ── */}
        <div className="vessel-dms-topbar" style={{
          height: 76, flexShrink: 0,
          background: 'var(--vdms-surface)',
          borderBottom: '1px solid var(--vdms-border)',
          boxShadow: '0 1px 2px rgba(16,27,45,0.04)',
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: phone ? '0 12px' : tabletOrBelow ? '0 18px' : '0 36px',
          gap: 10,
        }}>
          {/* Breadcrumb */}
          <div className="vdms-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 0 }}>
            {tabletOrBelow && (
              <button
                type="button"
                className="vdms-topbar-btn"
                onClick={() => host.setState({ sidebarCollapsed: false })}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  border: '1px solid var(--vdms-line-strong)',
                  background: 'var(--vdms-field)',
                  color: 'var(--vdms-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--vdms-glass-strong)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--vdms-field)'; }}
                aria-label="Open navigation"
              >
                <Icon iconName="GlobalNavButton" className="app-layout-i12" />
              </button>
            )}
            <span className="vdms-topbar-title" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', color: 'var(--vdms-text)', fontSize: phone ? 18 : 26, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
              {viewLabel}
            </span>
            {/* Slot the Documents page portals its folder route (back/forward
                + breadcrumb path) into, so it sits right next to the title. */}
            <div id="vdms-header-route" className="app-layout-i13" style={{ minWidth: 0 }} />
          </div>

          {/* Right controls */}
          <div className="vdms-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
            {/* Traditional SharePoint site is opened from the sidebar ("Documents", under Vessel DMS);
                while it is showing, this Back button returns to the app. */}
            {classicOpen && (
              <button
                type="button"
                className="vdms-topbar-btn"
                onClick={host._closeClassicSite}
                title="Back to Ozellar Marine DMS"
                aria-label="Back to Ozellar Marine DMS"
                style={{
                  height: 42, padding: phone ? '0 12px' : '0 16px', borderRadius: 12,
                  border: '1px solid var(--vdms-line-strong)',
                  background: 'var(--vdms-field)',
                  color: 'var(--vdms-text)', display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
                }}
              >
                <Icon iconName="Back" className="app-layout-i14" />
                {!phone && 'Back'}
              </button>
            )}
            {host.state.view === 'list' && !classicOpen && (
              <button
                type="button"
                className="vdms-topbar-btn"
                onClick={host._toggleFullScreenWorkspace}
                title={isWorkspaceFullScreen ? 'Exit full-screen workspace' : 'Open full-screen workspace'}
                aria-label={isWorkspaceFullScreen ? 'Exit full-screen workspace' : 'Open full-screen workspace'}
                style={{
                  width: 42, height: 42, borderRadius: 12,
                  border: '1px solid var(--vdms-line-strong)',
                  background: isWorkspaceFullScreen ? 'var(--vdms-glass-strong)' : 'var(--vdms-field)',
                  color: 'var(--vdms-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
                }}
              >
                <Icon iconName={isWorkspaceFullScreen ? 'BackToWindow' : 'FullScreen'} className="app-layout-i15" />
              </button>
            )}
            {/* Top-bar Search box removed per request — it was dead UI on
                every module (no value/onChange ever wired to it; see git
                history), and each module already has its own real search
                (the "Search vessel, file name..." box in Documents, etc.). */}

            {/* ── Alert Bell ── */}
            <div className="app-layout-i16">
              <button
                type="button"
                data-alert-bell="true"
                className="vdms-topbar-btn"
                onClick={e => { e.stopPropagation(); host._toggleAlertBell(); }}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none',
                  background: host.state.alertOpen ? 'var(--vdms-glass-strong)' : 'var(--vdms-field)',
                  color: 'var(--vdms-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative',
                  transition: 'background 0.15s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
                onMouseEnter={e => { if (!host.state.alertOpen) e.currentTarget.style.background = 'var(--vdms-glass-strong)'; }}
                onMouseLeave={e => { if (!host.state.alertOpen) e.currentTarget.style.background = 'var(--vdms-field)'; }}
                aria-label="Alerts"
              >
                <Icon iconName="Ringer" className="app-layout-i17" />
                {host._unreadAlertCount() > 0 && (
                  <span className="app-layout-i18" style={{ minWidth: 18, background: '#ef4444', color: '#fff' }}>
                    {host._unreadAlertCount() > 99 ? '99+' : host._unreadAlertCount()}
                  </span>
                )}
              </button>

            </div>
            {/* End Alert Bell */}

            {/* Avatar & Sign Out */}
            <div className="app-layout-i19">
              <button type="button" className="vdms-topbar-btn" onClick={() => host._goToView('profile')} title="Open profile" aria-label="Open profile" style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--vdms-glass-strong)',
                border: '2.5px solid var(--vdms-line-strong)',
                color: 'var(--vdms-text)', fontSize: 18, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                cursor: 'pointer',
              }}>
                {userDisplayName.charAt(0).toUpperCase()}
              </button>
              {!phone && (
                <span className="vdms-topbar-user" style={{ fontSize: 15, fontWeight: 800, color: 'var(--vdms-text)', letterSpacing: '0.2px' }}>{userDisplayName}</span>
              )}
              <button
                type="button"
                onClick={host._handleSignOut}
                title="Log Out"
                aria-label="Log Out"
                className="app-layout-i20" style={{ borderRadius: 10, transition: 'all 0.15s ease' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#fca5a5';
                  e.currentTarget.style.background = '#fef2f2';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--vdms-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--vdms-line-strong)';
                  e.currentTarget.style.background = 'var(--vdms-field)';
                }}
              >
                <Icon iconName="SignOut" className="app-layout-i14" />
              </button>
            </div>
          </div>
        </div>

        {host.state.scanProgress.status !== 'idle' && (
          <div role="status" className="app-layout-i21" style={{ background: host.state.scanProgress.status === 'failed' ? '#fef2f2' : '#eff6ff', color: host.state.scanProgress.status === 'failed' ? '#b91c1c' : '#075985' }}>
            <span className="app-layout-i22">
              {host.state.scanProgress.status === 'running' ? 'Scanning files' : host.state.scanProgress.status === 'completed' ? 'Scan complete' : 'Scan failed'}
            </span>
            <span className="app-layout-i23" style={{ minWidth: 0 }}>
              {host.state.scanProgress.title}
              {host.state.scanProgress.status === 'running' && host.state.scanProgress.recentFiles[0] ? ` · ${host.state.scanProgress.recentFiles[0]}` : ''}
            </span>
            {host.state.scanProgress.status === 'running' && <span className="app-layout-i22">{host.state.scanProgress.completed} / {host.state.scanProgress.total}</span>}
            {host.state.scanProgress.status === 'completed' && (
              <button type="button" onClick={() => host.setState({ scanProgress: { ...host.state.scanProgress, status: 'idle' } })} className="app-layout-i24" style={{ background: 'transparent', color: '#075985' }} aria-label="Dismiss scan status">Dismiss</button>
            )}
          </div>
        )}

        <div
          className="vdms-main-scroll"
          style={{
            flex: 1,
            overflowY: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? 'hidden' : 'auto',
            padding: host.state.view === 'certificates'
              ? (phone ? '6px 10px 8px' : '8px 20px 8px')
              : host.state.view === 'alerts'
              ? (phone ? '8px 10px 10px' : '14px 24px 16px')
              : host.state.view === 'vessels'
              ? (phone ? '10px 12px 12px' : '16px 24px 16px')
              : host.state.view === 'certificate_master'
              ? (phone ? '8px 10px 10px' : '12px 18px 12px')
              : host.state.view === 'dashboard'
              ? (phone ? '10px 12px 48px' : tabletOrBelow ? '14px 18px 48px' : '16px 24px 48px')
              : (isWorkspaceFullScreen ? (phone ? 10 : 18) : (phone ? 12 : tabletOrBelow ? 18 : 24)),
            background: 'transparent',
            boxSizing: 'border-box',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            height: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? 'calc(100vh - 76px)' : '100%',
            maxHeight: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? 'calc(100vh - 76px)' : undefined,
            ['--vdms-content-pad' as any]: `${isWorkspaceFullScreen ? (phone ? 10 : 18) : (phone ? 12 : tabletOrBelow ? 18 : 24)}px`
          }}
        >
          {/* The app stays mounted (hidden) while the classic site is shown, so Back restores it as-is. */}
          <div className="app-layout-i25" style={{ display: classicOpen ? 'none' : ((host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? 'flex' : 'block'), height: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? '100%' : undefined, maxHeight: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? '100%' : undefined, overflow: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? 'hidden' : undefined, flex: (host.state.view === 'certificates' || host.state.view === 'certificate_master' || host.state.view === 'alerts' || host.state.view === 'vessels') ? '1 1 0' : undefined }}>{content}</div>
          {classicOpen && (
            <ClassicSiteLibraryViewer
              url={host.state.classicSiteUrl}
              onClose={host._closeClassicSite}
            />
          )}
        </div>

        {/* Right-side Document Preview Drawer */}
        {host._renderDocPreviewDrawer()}
      </div>
    </div>
    </ThemeProvider>
  ), document.body);
}
