/* eslint-disable @typescript-eslint/no-unused-vars */
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
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
  UserItem,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import { isMobileWidth, isTabletOrBelow } from '../responsive';
import { clay } from '../clayTheme';
import { OZELLAR_LOGO_BASE64, BRAND_SYSTEM_TITLE } from '../brandAssets';

// Enterprise Maritime: a single dark-navy rail (clay.accentDeep, so it still
// follows Settings → Color Management) with one consistent accent for
// the active item — no per-module colour, no gradients.
const hexRgb = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbaOf = (hex: string, a: number): string => `rgba(${hexRgb(hex).join(',')},${a})`;
const SB_FONT_UI = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SB_FONT_DISPLAY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SB_FONT_MONO = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// Hex fallback mirroring clayLight.accent — used only where a literal hex is
// required (rgba() math); `clay.accent` (the CSS-var form) is used everywhere
// else so Settings → Color Management keeps re-theming this correctly.
const ACCENT_HEX = '#2563eb';
// Sidebar text is always light — the rail background (clay.accentDeep) is
// always dark, in both light and night app themes.
const SB_TEXT = '#f3f7fb';
const SB_TEXT_MUTED = 'rgba(243,247,251,0.6)';
const SB_DIVIDER = 'rgba(243,247,251,0.14)';

export function renderSidebar(host: VesselEmail): React.ReactElement {
  const { view, sidebarCollapsed, windowWidth } = host.state;
  const isNight = host.state.themeMode === 'night';
  const viewportWidth = windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const tabletOrBelow = isTabletOrBelow(viewportWidth);
  const phone = isMobileWidth(viewportWidth);
  const desktopCollapsed = !tabletOrBelow && sidebarCollapsed;
  const mobileOpen = tabletOrBelow && !sidebarCollapsed;
  const collapsed = desktopCollapsed;
  const expandedWidth = 260;
  const sidebarWidth = collapsed ? 72 : expandedWidth;

  const toggleCollapsed = (): void => {
    if (tabletOrBelow) {
      host.setState({ sidebarCollapsed: mobileOpen });
      return;
    }
    host.setState({ sidebarCollapsed: !sidebarCollapsed });
  };

  const handleNavClick = (action: () => void): void => {
    if (tabletOrBelow) {
      host.setState({ sidebarCollapsed: true });
    }
    action();
  };

  const collapseBtn = (
    <button
      onClick={toggleCollapsed}
      title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      className="sidebar-i1" style={{ width: 28, borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#ffffff', transition: 'background 0.2s ease' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
    >
      <Icon iconName={collapsed ? 'GlobalNavButton' : 'DoubleChevronLeft'} className="sidebar-i2" />
    </button>
  );

  // Module access control:
  // 1. App-wide hiddenModules (from Settings -> Module Management)
  // 2. User Management ('users') is admin-only
  // 3. Admin has access to all non-globally-hidden modules
  // 4. Non-admin users are restricted to host.state.myAllowedModules if set
  const { hiddenModules, myAllowedModules } = host.state;
  const isAdmin = host._isAdmin();

  const isHidden = (id: string): boolean => {
    // User Management and Certificate Master are strictly admin-only
    if ((id === 'users' || id === 'certificate_master') && !isAdmin) return true;

    // App-wide module hiding (except Settings for Admin)
    if (hiddenModules.indexOf(id) !== -1) {
      if (id === 'settings' && isAdmin) return false;
      return true;
    }

    // Admins can see all other available modules
    if (isAdmin) return false;

    // For non-admin, if myAllowedModules is assigned, enforce it
    if (Array.isArray(myAllowedModules)) {
      return myAllowedModules.indexOf(id) === -1;
    }

    // Default for non-admin without custom list: settings is hidden
    if (id === 'settings') return true;

    return false;
  };

  // Typed on the literal itself (not on the .filter() result) — a type
  // annotation on the variable alone doesn't reach an array literal that's
  // immediately chained into .filter(): TS widens each `id: 'dashboard'`
  // to plain `string` before .filter() ever runs, and .filter() just
  // carries that widened `string[]` through, which no longer matches
  // `AppView`. Annotating ALL_NAV_ITEMS directly keeps every `id` as its
  // literal AppView member.
  const ALL_NAV_ITEMS: Array<{ id: AppView; label: string; iconName: string; badge?: number }> = [
    { id: 'dashboard',  label: 'Dashboard',           iconName: 'Home' },
    { id: 'list',       label: 'Vessel DMS',      iconName: 'Documentation' },
    { id: 'sites',      label: 'Sites',             iconName: 'SharepointLogo' },
    { id: 'vessels',    label: 'Vessel Master',   iconName: 'Ferry' },
    { id: 'certificates', label: 'Certificates',     iconName: 'Certificate' },
    { id: 'certificate_master', label: 'Certificate Master', iconName: 'DocumentApproval' },
    { id: 'service_agreements', label: 'Service Agreements', iconName: 'TextDocument' },
    { id: 'ship_register', label: 'Ship Register', iconName: 'Ferry' },
    { id: 'approvals',  label: 'Approvals',          iconName: 'CheckList' },
    // 'templates' (Templates & OCR) removed — that functionality already
    // lives directly on the SharePoint site, so this module was redundant.
    // 'reports' removed from the nav — it now opens from the Reports tile on
    // the Vessel DMS page (DocumentsPage, next to the top-level folder tiles).
    { id: 'migration',  label: 'Migration Assistant', iconName: 'MoveToFolder' },
    { id: 'users',      label: 'User Management',  iconName: 'People' },
    { id: 'settings',   label: 'Settings',         iconName: 'Settings' },
  ];
  const navItems = ALL_NAV_ITEMS.filter(item => !isHidden(item.id));

  // Same reason as ALL_NAV_ITEMS above: annotate the literal directly, then
  // .filter() it into auxLinks, rather than annotating the .filter() result.
  const ALL_AUX_LINKS: Array<{ id: AppView | 'bento_compose'; label: string; iconName: string; onClick: () => void }> = [
    /* Send Email option commented out as requested
    {
      id: 'bento_compose',
      label: 'Send Email',
      iconName: 'Send',
      onClick: () => {
        void host._goToView('bento_email');
        host.setState({
          bentoComposeOpen: true,
          bentoComposeMsg: null,
          bentoComposeErr: null,
          bentoComposeForm: {
            vessel_name: '',
            datasource_tag: 'mail',
            subject_text: host._buildAutoSubject('', 'mail', ''),
            body: '',
            file: null,
            existing_attachment: '',
            recipient: '',
          },
        });
      },
    },
    */
    { id: 'recycle', label: 'Recycle Bin', iconName: 'RecycleBin', onClick: () => host._goToView('recycle') },
    { id: 'archive', label: 'Archive',     iconName: 'Archive',    onClick: () => host._goToView('archive') },
  ];
  const auxLinks = ALL_AUX_LINKS.filter(link =>
    // 'bento_compose' isn't its own module in module_settings_api's catalog
    // (it's just "AI Bento Email" with the compose panel pre-opened), so it
    // rides on 'bento_email''s visibility instead of having its own toggle.
    link.id === 'bento_compose' ? !isHidden('bento_email') : !isHidden(link.id)
  );

  const renderNavBtn = (
    id: AppView | 'bento_compose' | 'classic_site',
    label: string,
    iconName: string,
    onClick: () => void,
    badgeCount?: number,
    isAux = false,
    overrideActive?: boolean,
  ): React.ReactElement => {
    const classicOpen = host.state.classicSiteOpen;
    // While the traditional site is shown, only its own button is highlighted.
    const active = overrideActive !== undefined
      ? overrideActive
      : (id === 'classic_site' ? classicOpen : view === id && !classicOpen);

    return (
      <button
        key={id}
        onClick={onClick}
        title={collapsed ? label : undefined}
        className="sidebar-i3" style={{ justifyContent: collapsed ? 'center' : 'space-between', width: '100%', padding: collapsed ? '0' : '0 10px 0 12px', borderRadius: 8, background: active ? rgbaOf(ACCENT_HEX, 0.22) : 'transparent', color: active ? '#ffffff' : SB_TEXT, fontWeight: active ? 700 : 500, fontSize: 13.5, transition: 'background 150ms ease, color 150ms ease', fontFamily: SB_FONT_UI }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Thin left accent indicator — replaces a solid bright fill for the active row */}
        {active && !collapsed && (
          <span aria-hidden="true" className="sidebar-i4" style={{ background: clay.accent }} />
        )}
        <div className="sidebar-i5" style={{ gap: collapsed ? 0 : 9, minWidth: 0, justifyContent: collapsed ? 'center' : 'flex-start', width: collapsed ? '100%' : 'auto' }}>
          {/* Icon container — flat tile, single accent, no per-module colour */}
          <div className="sidebar-i6" style={{ width: 28, borderRadius: 6, background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)' }}>
            <Icon iconName={iconName} className="sidebar-i7" />

            {/* Badge anchored to icon container when collapsed */}
            {badgeCount !== undefined && collapsed && (
              <span className="sidebar-i8" style={{ background: '#ef4444', color: '#fff', borderRadius: 8, minWidth: 16, border: `2px solid ${clay.accentDeep}` }}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </div>

          <span className="sidebar-i9" style={{ maxWidth: collapsed ? 0 : 180, opacity: collapsed ? 0 : 1, display: collapsed ? 'none' : 'inline-block', transition: 'max-width 0.2s ease, opacity 0.15s ease' }}>
            {label}
          </span>
        </div>

        {/* Badge in expanded mode */}
        {badgeCount !== undefined && !collapsed && (
          <span className="sidebar-i10" style={{ background: '#ef4444', color: '#fff', borderRadius: 8 }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div
          onClick={() => host.setState({ sidebarCollapsed: true })}
          className="sidebar-i11" style={{ position: 'fixed', background: 'rgba(2, 6, 23, 0.45)', zIndex: 100000 }}
        />
      )}
      <div className="vessel-dms-sidebar" style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
        height: '100vh',
        maxHeight: '100dvh',
        background: clay.accentDeep,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow: tabletOrBelow ? '10px 0 28px rgba(2,10,24,0.14)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflow: 'hidden',
        flexShrink: 0,
        position: tabletOrBelow ? 'fixed' : 'relative',
        top: 0,
        left: tabletOrBelow ? 0 : undefined,
        zIndex: tabletOrBelow ? 100001 : 1,
        transform: tabletOrBelow && !mobileOpen ? 'translateX(-104%)' : 'translateX(0)',
        opacity: tabletOrBelow && !mobileOpen ? 0 : 1,
        pointerEvents: tabletOrBelow && !mobileOpen ? 'none' : 'auto',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease, transform 0.25s ease, opacity 0.2s ease',
      }}>

        {/* Brand Header */}
        <div className="sidebar-i12" style={{ padding: collapsed ? '10px 0' : '10px 14px', borderBottom: `1px solid ${SB_DIVIDER}`, gap: collapsed ? 0 : 10, justifyContent: collapsed ? 'center' : 'space-between', width: '100%' }}>
          {!collapsed && (
            <div className="sidebar-i13" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Ozellar Marine brand mark */}
              <div
                aria-label={BRAND_SYSTEM_TITLE}
                role="img"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  flexShrink: 0
                }}
              >
                <img
                  src={OZELLAR_LOGO_BASE64}
                  alt={BRAND_SYSTEM_TITLE}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div className="sidebar-i5" style={{ minWidth: 0 }}>
                <div className="sidebar-i16" style={{ fontFamily: SB_FONT_DISPLAY, color: SB_TEXT, fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {BRAND_SYSTEM_TITLE}
                </div>
              </div>
            </div>
          )}
          {collapseBtn}
        </div>

        {/* Main Navigation (ONLY THIS SCROLLS) */}
        <div
          className="vessel-dms-sidebar-nav"
          style={{
            position: 'relative', zIndex: 1,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: collapsed ? '6px 6px' : '6px 10px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {!collapsed && (
            <div className="sidebar-i17" style={{ fontFamily: SB_FONT_MONO }}>
              Main
            </div>
          )}
          {navItems.map(item => {
            if (item.id === 'vessels') {
              const isVesselsActive = view === 'vessels' || !!host.state.vesselSuggestionDialog?.open;
              return renderNavBtn(
                'vessels',
                'Vessel Master',
                'Ferry',
                () => {
                  if (host.state.vesselSuggestionDialog?.open) {
                    host.setState({ vesselSuggestionDialog: null });
                  }
                  handleNavClick(() => host._goToView('vessels'));
                },
                undefined,
                false,
                isVesselsActive
              );
            }
            const btn = renderNavBtn(
              item.id,
              item.label,
              item.iconName,
              () => handleNavClick(() => host._goToView(item.id)),
              item.badge
            );
            if (item.id !== 'list') return btn;
            if (isHidden('classic_site')) return btn;
            return [
              btn,
              renderNavBtn('classic_site', 'Documents', 'DocLibrary', () => {
                handleNavClick(() => {
                  if (host.state.classicSiteOpen) host._closeClassicSite(); else void host._openClassicSite();
                });
              }),
            ];
          })}
        </div>

        {/* Tools Section (STICKY AT BOTTOM OF SIDEBAR) */}
        <div
          
          className="vessel-dms-sidebar-tools sidebar-i18" style={{ padding: collapsed ? '6px 6px' : '6px 10px', borderTop: `1px solid ${SB_DIVIDER}`, background: clay.accentDeep }}
        >
          {!collapsed && (
            <div className="sidebar-i19" style={{ fontFamily: SB_FONT_MONO }}>
              Tools
            </div>
          )}
          {auxLinks.map(link =>
            renderNavBtn(
              link.id,
              link.label,
              link.iconName,
              () => handleNavClick(link.onClick),
              undefined,
              true
            )
          )}
        </div>

        {collapsed && !tabletOrBelow && (
          <div
            title="Vessel DMS v2.0"
            className="sidebar-i20" style={{ borderTop: `1px solid ${SB_DIVIDER}` }}
          >
            <span className="sidebar-i21" style={{ background: '#2dd4bf' }} />
          </div>
        )}
        {!collapsed && !tabletOrBelow && (
          <div className="sidebar-i22" style={{ borderTop: `1px solid ${SB_DIVIDER}`, fontFamily: SB_FONT_MONO }}>
            <span className="sidebar-i23" style={{ background: '#2dd4bf' }} />
            Vessel DMS v2.0
          </div>
        )}
      </div>
    </>
  );
}
