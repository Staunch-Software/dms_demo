/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
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
  ApprovalItem, NotificationItem, UserItem, FolderAnomalyItem, NormalFolderRecord,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import { KAIZEN_KNOWLEDGE_BANK_TREE, MAIN_FOLDERS } from '../vesselFolderTemplate';
import { isMobileWidth } from '../responsive';
import { clay } from '../clayTheme';
import { SiteSelector } from '../SiteSelector';
import { VesselDocumentPanel, VesselDocStatsCells, clearVesselSummaryCache, COMPACT_VESSEL_CARD, VESSEL_CARD_SHOW_IMAGE } from './VesselDocumentPanel';
import { VesselRootsControl } from './VesselRootsControl';
import { vdmsFont } from '../futuristicTheme';
import {
  DmsPageHeader, dmsControlStyle, dmsBtn, dmsTone, DmsLoadingState, DmsEmptyState,
  DMS_SECTION_CARD, DMS_TILE, DMS_TILE_TITLE, dmsGrid, DMS_ON_ACCENT,
} from '../dmsDesignSystem';


function getSpoVesselFolderUrl(
  hostOrSiteUrl?: VesselEmail | string,
  vesselOrName?: VesselRecord | string,
  siteUrlProp?: string
): string {
  let host: VesselEmail | undefined;
  let siteUrl = '';
  let vesselName = '';
  let vesselObj: VesselRecord | undefined;

  if (hostOrSiteUrl && typeof hostOrSiteUrl === 'object' && 'state' in hostOrSiteUrl) {
    host = hostOrSiteUrl as VesselEmail;
    if (vesselOrName && typeof vesselOrName === 'object' && 'name' in vesselOrName) {
      vesselObj = vesselOrName as VesselRecord;
      vesselName = vesselObj.name || '';
    } else if (typeof vesselOrName === 'string') {
      vesselName = vesselOrName;
    }
    const documentSites = host?.state?.documentSites || [];
    siteUrl = siteUrlProp || (vesselObj ? getVesselSharePointSiteUrl(host, vesselObj) : (documentSites.find(s => s.site_key === host?.state?.activeDocumentSite)?.web_url || host?.props?.siteUrl || ''));
  } else {
    siteUrl = typeof hostOrSiteUrl === 'string' ? hostOrSiteUrl : '';
    if (vesselOrName && typeof vesselOrName === 'object' && 'name' in vesselOrName) {
      vesselName = (vesselOrName as VesselRecord).name || '';
      vesselObj = vesselOrName as VesselRecord;
    } else if (typeof vesselOrName === 'string') {
      vesselName = vesselOrName;
    }
  }

  if (host && vesselName) {
    const cleanVessel = vesselName.trim().toLowerCase();
    const liveMatch = (host.state?.documentLiveFolders || []).find(f =>
      f.is_folder !== false && f.name.trim().toLowerCase() === cleanVessel
    );
    if (liveMatch?.web_url) {
      return liveMatch.web_url;
    }
  }

  const fallbackSite = 'https://{tenant}.sharepoint.com';
  const effectiveSite = (siteUrl && siteUrl !== '#') ? siteUrl.trim() : fallbackSite;

  try {
    const urlObj = new URL(effectiveSite);
    const basePath = urlObj.pathname.replace(/\/$/, '');

    let libName = 'Shared Documents';
    if (host) {
      const documentSites = host.state?.documentSites || [];
      const safeVesselObj = vesselObj;
      const safeHost = host;
      const matchedSite = safeVesselObj
        ? documentSites.find(s => {
            const vesselSiteIds = safeVesselObj.provisioned_site_ids || [];
            return vesselSiteIds.some(id => String(id).toLowerCase() === String(s.site_key || '').toLowerCase()) ||
              ((safeVesselObj.provisioned_site_key || '').toLowerCase() === String(s.site_key || '').toLowerCase()) ||
              s.web_url === effectiveSite;
          })
        : documentSites.find(s => s.site_key === safeHost.state?.activeDocumentSite || s.web_url === effectiveSite);
      const siteKey = String(matchedSite?.site_key || '').toLowerCase();
      const siteName = String(matchedSite?.sp_site_name || '').toLowerCase();
      const isCommunicationSite = siteKey === 'dev' || siteKey === 'communication' || siteKey === 'root' ||
        siteName === 'communication site' || siteName.includes('communication');
      if (isCommunicationSite) {
        // The tenant root Communication site uses the SharePoint library
        // named "Shared Documents", even when its configuration record says
        // "Documents" (the latter is the default for other site types).
        libName = 'Shared Documents';
      } else if (matchedSite?.default_library_name) {
        libName = matchedSite.default_library_name;
      }
    }

    const encodedLib = encodeURIComponent(libName);
    const customPath = vesselObj?.vessel_folder_path?.trim().replace(/^\/+|\/+$/g, '');
    if (customPath) {
      const pathParts = customPath.split('/').map(p => p.trim()).filter(Boolean);
      const normalizedParts = pathParts[0] && pathParts[0].toLowerCase() === libName.toLowerCase() ? pathParts.slice(1) : pathParts;
      const relativePath = normalizedParts.map(part => encodeURIComponent(part)).join('/');
      return `${urlObj.origin}${basePath}/${encodedLib}/${relativePath}`;
    }

    if (!vesselName) {
      return `${urlObj.origin}${basePath}/${encodedLib}`;
    }

    let deptName = 'Technical & Crewing';
    if (host) {
      const liveDept = (host.state.documentLiveFolders || []).find(f =>
        f.depth === 0 && /technical/i.test(f.name)
      );
      if (liveDept?.name) {
        deptName = liveDept.name;
      }
    }

    const encodedDept = encodeURIComponent(deptName);
    const encodedVessel = encodeURIComponent(vesselName.trim());
    return `${urlObj.origin}${basePath}/${encodedLib}/${encodedDept}/${encodedVessel}`;
  } catch {
    return '#';
  }
}

function getVesselSharePointSiteUrl(host: VesselEmail, vessel: VesselRecord): string {
  const candidateSiteIds = Array.from(new Set([...(vessel.provisioned_site_ids || []), vessel.provisioned_site_key].filter(Boolean) as string[]));

  // 1. Try matching with known document sites
  const targetSite = host.state.documentSites.find(site =>
    candidateSiteIds.some(id => {
      const idStr = String(id).toLowerCase();
      return (
        idStr === site.site_key.toLowerCase() ||
        (!!site.site_id && idStr === site.site_id.toLowerCase()) ||
        (!!site.sp_site_name && idStr === site.sp_site_name.toLowerCase())
      );
    })
  ) || (host.state.activeDocumentSite ? host.state.documentSites.find(s => s.site_key === host.state.activeDocumentSite) : null);

  if (targetSite?.web_url) {
    let url = targetSite.web_url.trim();
    // If target site is OzellarDMS but web_url was set without /sites/, fix it
    if ((targetSite.site_key.toLowerCase().includes('nks') || targetSite.sp_site_name.toLowerCase().includes('nks')) && !url.includes('/sites/')) {
      url = 'https://{tenant}.sharepoint.com/sites/OzellarDMS';
    }
    return url;
  }

  // 2. Fallback heuristic from provisionedSiteIds or activeDocumentSite
  const hasNks = candidateSiteIds.some(id => {
    const s = String(id).toLowerCase();
    return s.includes('nks') || s.includes('docman') || s === 'local';
  });
  if (hasNks || (host.state.activeDocumentSite && (host.state.activeDocumentSite.toLowerCase().includes('nks') || host.state.activeDocumentSite.toLowerCase() === 'local'))) {
    return 'https://{tenant}.sharepoint.com/sites/OzellarDMS';
  }

  const hasExternal = candidateSiteIds.some(id => String(id).toLowerCase().includes('external'));
  if (hasExternal || (host.state.activeDocumentSite && host.state.activeDocumentSite.toLowerCase().includes('external'))) {
    return 'https://{tenant}.sharepoint.com/sites/OzellarDMS';
  }

  return host.props.siteUrl || 'https://{tenant}.sharepoint.com';
}

function resolveVesselDocumentNavigation(host: VesselEmail, vessel: VesselRecord): {
  docMainFolder: VesselEmail['state']['docMainFolder'];
  folderPathStack: { id: string; name: string }[];
  vesselFilter: string;
} {
  const vesselName = cleanName(vessel.name || '').trim();
  const customPath = (vessel.vessel_folder_path || '').trim();
  const fallbackMain = host.state.docMainFolder || 'Technical & Crewing';
  // Resolve the vessel's OWN site first (same candidate matching
  // getVesselSharePointSiteUrl already uses), before ever falling back to
  // whatever site happens to be active in the app right now. Falling back
  // to activeDocumentSite/documentSites[0] first (the previous order here)
  // meant "View Documents" ignored provisioned_site_key/provisioned_site_ids
  // entirely whenever the active site's own site_key satisfied that check
  // trivially — landing on the wrong site's (usually empty) folder for any
  // vessel whose real site differs from the currently active one, most
  // visibly the "Found in SharePoint" rows merged from a non-active site.
  const vesselSiteIds = Array.from(new Set(
    [...(vessel.provisioned_site_ids || []), vessel.provisioned_site_key].filter(Boolean) as string[]
  ));
  const selectedSite =
    host.state.documentSites.find(site => vesselSiteIds.some(id => {
      const idStr = String(id).toLowerCase();
      return idStr === (site.site_key || '').toLowerCase() ||
        (!!site.site_id && idStr === site.site_id.toLowerCase()) ||
        (!!site.sp_site_name && idStr === site.sp_site_name.toLowerCase());
    })) ||
    host.state.documentSites.find(site =>
      !!site.web_url && getVesselSharePointSiteUrl(host, vessel).startsWith(site.web_url) ||
      site.site_key === host.state.activeDocumentSite ||
      site.sp_site_name.toLowerCase() === (host.state.activeDocumentSite || '').toLowerCase()
    ) || host.state.documentSites[0];

  const rootStack: { id: string; name: string }[] = [];
  if (selectedSite) {
    // These three nodes (sites_root sentinel, then the site, then the
    // drive) are the exact shape DocumentsPage.tsx's live-folder browsing
    // expects at indices [0]/[1]/[2] (atSitesRoot, isSitesScopeNav, the
    // click handler below's own folderPathStack[1]/[0]==='sites_root'
    // checks). Without the 'sites_root' sentinel this stack was
    // off-by-one — folderPathStack[0] held the site node, so every one of
    // those checks failed, docScopeType always fell back to 'vessels'
    // instead of 'sites', and the live Graph children fetch that actually
    // populates Folder view never ran. That's what made "View Documents"
    // (and any breadcrumb click rebuilding a slice of this same stack)
    // land on a permanently empty listing for a flat, Part-C-provisioned
    // vessel folder.
    rootStack.push({ id: 'sites_root', name: 'SharePoint Sites' });
    rootStack.push({ id: `site:${selectedSite.site_id || selectedSite.site_key}`, name: selectedSite.sp_site_name || selectedSite.site_key || 'Communication Site' });
    rootStack.push({ id: `drive:${selectedSite.drive_id || 'root'}`, name: selectedSite.default_library_name || 'Documents' });
  }

  const fallbackDocMainFolder = (fallbackMain || 'Technical & Crewing') as VesselEmail['state']['docMainFolder'];

  if (!customPath) {
    const docMainFolder = fallbackDocMainFolder;
    return {
      docMainFolder,
      folderPathStack: [...rootStack, { id: String(vessel.id || vesselName), name: vesselName }],
      vesselFilter: vesselName,
    };
  }

  const rawSegments = customPath.replace(/\\/g, '/').split('/').map(part => part.trim()).filter(Boolean);
  const filteredSegments = rawSegments.filter(segment => !['SharePoint Sites', 'Documents', 'Communication Site', 'Shared Documents', 'Site Documents'].some(token => token.toLowerCase() === segment.toLowerCase()));
  const relativeSegments = filteredSegments;

  const mainMatch = relativeSegments.find(segment =>
    MAIN_FOLDERS.some((mf) => mf.name.toLowerCase() === segment.toLowerCase())
  );
  const resolvedMain = (mainMatch || fallbackDocMainFolder || 'Technical & Crewing') as string;
  const docMainFolder = resolvedMain as VesselEmail['state']['docMainFolder'];

  const stack: { id: string; name: string }[] = [...rootStack];
  for (const segment of relativeSegments) {
    const cleanSegment = cleanName(segment);
    if (!cleanSegment) continue;
    const normalized = cleanSegment.toLowerCase();
    if (stack.some(existing => existing.name.trim().toLowerCase() === normalized)) {
      continue;
    }
    stack.push({ id: `${segment}-${stack.length}`, name: cleanSegment });
  }

  if (stack.length === rootStack.length) {
    stack.push({ id: String(vessel.id || vesselName), name: vesselName });
  }

  return {
    docMainFolder,
    folderPathStack: stack,
    vesselFilter: vesselName,
  };
}

// ── Dismiss Confirm Dialog ────────────────────────────────────────────────────
// Shown when user clicks "Dismiss" on any anomaly item.
// Gives two options: "Keep it here" (close dialog) or "Move to Recycle Bin".
export function renderDismissConfirmDialog(host: VesselEmail): React.ReactElement | null {
  const anomaly = host.state.spoAnomalyDismissConfirm;
  if (!anomaly) return null;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dismiss Confirmation"
      className="vessels-page-i1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) host.setState({ spoAnomalyDismissConfirm: null }); }}
    >
      <div className="vessels-page-i2" style={{ background: clay.surface, padding: isMobile ? 16 : 32, width: '100%' }}>
        {/* Close */}
        <button
          onClick={() => host.setState({ spoAnomalyDismissConfirm: null })}
          className="vessels-page-i3" style={{ minWidth: 44 }}
          title="Cancel"
        ><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i4" /></button>

        {/* Icon + title */}
        <div className="vessels-page-i5">
          <div className="vessels-page-i6"><Icon iconName="Delete" aria-hidden="true" className="vessels-page-i7" /></div>
          <h3 className="vessels-page-i8">
            What would you like to do?
          </h3>
          <p className="vessels-page-i9">
            The {anomaly.item_type} <strong>"{anomaly.name}"</strong> was found outside the expected SharePoint structure.
          </p>
        </div>

        {/* Path */}
        <div className="vessels-page-i10" style={{ borderRadius: 8, fontFamily: 'monospace' }}>
          <Icon iconName="OpenFolderHorizontal" aria-hidden="true" className="vessels-page-i11" /> {anomaly.spo_path}
        </div>

        <div className="vessels-page-i12">
          {/* Keep it here */}
          <button
            onClick={() => host.setState({ spoAnomalyDismissConfirm: null })}
            className="vessels-page-i13" style={{ borderRadius: 10, transition: 'border-color 0.15s' }}
          >
            <Icon iconName="Pin" aria-hidden="true" className="vessels-page-i14" />
            <div>
              <div className="vessels-page-i15">Keep it here</div>
              <div className="vessels-page-i16">
                Leave this item listed in the warning section for now. You can classify or dismiss it later.
              </div>
            </div>
          </button>

          {/* Move to Recycle Bin */}
          <button
            onClick={() => host._moveAnomalyToRecycleBin(anomaly)}
            className="vessels-page-i17" style={{ background: clay.pillDangerText, color: DMS_ON_ACCENT, borderRadius: 10, transition: 'opacity 0.15s' }}
          >
            <Icon iconName="Delete" aria-hidden="true" className="vessels-page-i14" />
            <div>
              <div className="vessels-page-i18">Move to Recycle Bin</div>
              <div className="vessels-page-i19" style={{ opacity: 0.9 }}>
                Dismiss this warning and move the item record to the Recycle Bin. You can restore it from there.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vessel Field Save Confirm Dialog ────────────────────────────────────────
// Shown by a vessel card's inline IMO/Hull No./Shipyard/Type field
// (renderVesselsPage/renderEditableField) on blur/select, before the value
// is written. The field can only ever be set once from the card — once
// saved it renders as locked, read-only text — so this is the one chance to
// catch a typo before it's committed.
export function renderVesselFieldConfirmDialog(host: VesselEmail): React.ReactElement | null {
  const pending = host.state.vesselFieldConfirm;
  if (!pending) return null;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Save"
      className="vessels-page-i1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) host._cancelSaveVesselField(); }}
    >
      <div className="vessels-page-i20" style={{ background: clay.surface, padding: isMobile ? 16 : 32, width: '100%' }}>
        {/* Close */}
        <button
          onClick={() => host._cancelSaveVesselField()}
          className="vessels-page-i3" style={{ minWidth: 44 }}
          title="Cancel"
        ><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i4" /></button>

        {/* Icon + title */}
        <div className="vessels-page-i5">
          <div className="vessels-page-i6"><Icon iconName="Save" aria-hidden="true" className="vessels-page-i7" /></div>
          <h3 className="vessels-page-i8">
            Save {pending.fieldLabel}?
          </h3>
          <p className="vessels-page-i9">
            This sets <strong>{pending.fieldLabel}</strong> for <strong>{pending.vesselName}</strong> to the value below.
            Once saved, this field can't be edited again from this card.
          </p>
        </div>

        {/* Value */}
        <div className="vessels-page-i21" style={{ borderRadius: 8 }}>
          {pending.value}
        </div>

        <div className="vessels-page-i22">
          <button
            onClick={() => host._cancelSaveVesselField()}
            className="vessels-page-i23" style={{ borderRadius: 10 }}
          >
            Cancel
          </button>
          <button
            onClick={() => host._confirmSaveVesselField()}
            className="vessels-page-i24" style={{ background: clay.pillActiveText, color: DMS_ON_ACCENT, borderRadius: 10 }}
          >
            Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Classify Dialog ──────────────────────────────────────────────────────────
export function renderClassifyDialog(host: VesselEmail): React.ReactElement | null {
  const dlg = host.state.spoClassifyDialog;
  if (!dlg) return null;

  return <ClassifyModalContent host={host} dlg={dlg} />;
}

function ClassifyModalContent({ host, dlg }: { host: VesselEmail; dlg: any }): React.ReactElement {

  const { anomaly, provisioning, done, doneNormal, alreadyExisted, error } = dlg;
  const [documentScope, setDocumentScope] = React.useState<'vessels' | 'common' | 'kaizen'>('vessels');
  const [selectedVessel, setSelectedVessel] = React.useState('');
  const [selectedMainFolder, setSelectedMainFolder] = React.useState(MAIN_FOLDERS[0]?.name || '');
  const [selectedFolderPath, setSelectedFolderPath] = React.useState<string[]>([]);

  const selectedMain = MAIN_FOLDERS.find(main => main.name === selectedMainFolder);
  const categoryNodes = documentScope === 'kaizen'
    ? KAIZEN_KNOWLEDGE_BANK_TREE
    : (selectedMain ? (documentScope === 'common' ? selectedMain.commonTree : selectedMain.perVesselTree) : []);
  const categoryLabel = documentScope === 'kaizen' ? 'Kaizen category' : 'Category';
  const folderLevels: Array<{ level: number; options: typeof categoryNodes }> = [];
  let levelNodes = categoryNodes;
  for (let level = 0; level < 8 && levelNodes.length > 0; level += 1) {
    folderLevels.push({ level, options: levelNodes });
    const selected = selectedFolderPath[level];
    const selectedNode = levelNodes.find(folder => folder.name === selected);
    if (!selectedNode?.children?.length) break;
    levelNodes = selectedNode.children;
  }
  const selectedDestinationChildren = selectedFolderPath.reduce<typeof categoryNodes>((nodes, name) => {
    return nodes.find(folder => folder.name === name)?.children || [];
  }, categoryNodes);
  const canPlaceInCategory = !!(
    selectedFolderPath.length > 0 &&
    selectedDestinationChildren.length === 0 &&
    (documentScope !== 'vessels' || selectedVessel)
  );

  React.useEffect(() => {
    setDocumentScope('vessels');
    setSelectedVessel(host.state.vessels[0]?.name || '');
    setSelectedMainFolder(MAIN_FOLDERS[0]?.name || '');
    setSelectedFolderPath([]);
  }, [anomaly.id]);

  React.useEffect(() => {
    const nextNodes = documentScope === 'kaizen'
      ? KAIZEN_KNOWLEDGE_BANK_TREE
      : (selectedMain ? (documentScope === 'common' ? selectedMain.commonTree : selectedMain.perVesselTree) : []);
    const nextCategory = nextNodes[0]?.name || '';
    setSelectedFolderPath(nextCategory ? [nextCategory] : []);
  }, [documentScope, selectedMainFolder]);
  const [elapsed, setElapsed] = React.useState(0);
  const [autoClose, setAutoClose] = React.useState(8);
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  React.useEffect(() => {
    if (!provisioning) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, [provisioning]);

  React.useEffect(() => {
    if (!done && !doneNormal) { setAutoClose(8); return; }
    const timer = setInterval(() => setAutoClose(s => {
      if (s <= 1) { clearInterval(timer); handleClose(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, doneNormal]);
  const formatTimer = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const handleVessel = async (): Promise<void> => {
    host.setState({ spoClassifyDialog: { ...dlg, provisioning: true, error: null } });
    try {
      // 1. Create vessel record via API
      const base = host._base();
      const newVessel = await host._fetchJson(`${base}/api/vessels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: anomaly.name, imo: null, shipyard: 'Auto-Discovered', vessel_type: 'Bulk Carrier' }),
      });
      if (!newVessel?.id) {
        // Without a real database ID we can't provision folders (the
        // backend's flat-root /provision-sites endpoint is keyed on it) —
        // surface this now instead of silently continuing with a synthetic
        // client-side id that provisioning would later reject.
        throw new Error('Vessel was not created correctly — the server did not return an ID.');
      }

      const newRecord: VesselRecord = {
        id: newVessel.id,
        name: cleanName(anomaly.name),
        imo: newVessel?.imo || '—',
        status: 'Active',
        image_url: pickRandomVesselImage('Bulk Carrier'),
      };

      // 2. Add vessel directly to top of state grid so it appears at the top of the vessel list immediately
      host.setState(prev => ({
        vessels: [newRecord, ...prev.vessels.filter(v => v.name.toLowerCase() !== newRecord.name.toLowerCase())],
      }));

      // 3. Provision SPO DMS folder structure
      await host._provisionVesselFolders(anomaly.name, newRecord.id);

      // 4. Dismiss the anomaly
      host._dismissAnomaly(anomaly.id);

      // 5. Transition to success screen!
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: true, error: null } });
    } catch (e: any) {
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: false, error: e?.message || 'Failed to provision vessel.' } });
    }
  };

  const handleNormal = async (): Promise<void> => {
    host.setState({ spoClassifyDialog: { ...dlg, provisioning: true, error: null } });
    try {
      const result = await host._saveNormalFolder(anomaly);
      // Dismiss anomaly warning
      host._dismissAnomaly(anomaly.id);
      // Refresh normal folder list in state
      host._loadNormalFolders();
      // Show success screen
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: false, doneNormal: true, alreadyExisted: result?.already_existed === true, error: null } });
    } catch (e: any) {
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: false, doneNormal: false, error: e?.message || 'Failed to save folder.' } });
    }
  };

  const handlePlaceInCategory = async (): Promise<void> => {
    if (!canPlaceInCategory) return;
    host.setState({ spoClassifyDialog: { ...dlg, provisioning: true, error: null } });
    try {
      const result = await host._placeAnomalyInDmsCategory(anomaly, documentScope, selectedVessel, selectedMainFolder, selectedFolderPath);
      host._dismissAnomaly(anomaly.id);
      host._loadNormalFolders();
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: false, doneNormal: true, alreadyExisted: result?.already_existed === true, error: null } });
    } catch (e: any) {
      host.setState({ spoClassifyDialog: { ...dlg, provisioning: false, done: false, doneNormal: false, error: e?.message || 'Failed to place folder in the selected category.' } });
    }
  };

  const handleClose = (): void => {
    if (done || doneNormal) {
      host._loadData();
    }
    host.setState({ spoClassifyDialog: null });
  };

  const renderBody = (): React.ReactElement => {
    if (doneNormal) {
      return (
        <div className="vessels-page-i25">
          <div className="vessels-page-i26"><Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i27" /></div>
          <h3 className="vessels-page-i28">
            {alreadyExisted ? 'Folder Already Registered' : 'Folder Added to the DMS'}
          </h3>
          <p className="vessels-page-i29">
            <strong>"{anomaly.name}"</strong> {alreadyExisted
              ? 'was already listed as a Normal Folder in the system.'
              : 'has been saved in the selected DMS location.'}
          </p>
          <div className="vessels-page-i30" style={{ background: clay.accentSoft, border: `1px solid ${clay.accentSoft}`, borderRadius: 10, color: clay.accentDark }}>
            <div className="vessels-page-i31"><Icon iconName="ClipboardList" aria-hidden="true" className="vessels-page-i32" /> Saved to Normal Folders</div>
            <div>• Anomaly warning dismissed</div>
            <div>• Folder linked to the DMS</div>
            <div>• Record stored in database</div>
          </div>
          <div className="vessels-page-i33">
            Auto-closing in {autoClose}s…
          </div>
          <button
            onClick={handleClose}
            style={{ ...dmsBtn('primary'), padding: '12px 32px', fontSize: 14, borderRadius: 10 }}
          >
            Done / View Vessels
          </button>
        </div>
      );
    }

    if (provisioning) {
      return (
        <div className="vessels-page-i34">
          <div className="vessels-page-i35"><Icon iconName="Sync" aria-hidden="true" className="vessels-page-i7" /></div>
          <h3 className="vessels-page-i36" style={{ color: clay.accentDark }}>
            Provisioning DMS Folder Structure…
          </h3>
          <p className="vessels-page-i37">
            Creating standard DMS folder hierarchy for <strong>"{anomaly.name}"</strong> in SharePoint Online. Please wait.
          </p>

          {/* Live Timer badge */}
          <div className="vessels-page-i38" style={{ background: clay.accentSoft, color: clay.accentDark, border: `1px solid ${clay.accentSoft}` }}>
            <Icon iconName="Clock" aria-hidden="true" className="vessels-page-i39" />
            <span>Elapsed Time: {formatTimer(elapsed)}</span>
          </div>

          {/* Animated Progress Bar */}
          <div className="vessels-page-i40" style={{ borderRadius: 10 }}>
            <div className="vessels-page-i41" style={{ background: clay.accentGradient, width: `${Math.min(96, 15 + elapsed * 12)}%`, borderRadius: 10 }} />
          </div>

    {/* Step Progress Checklist */}
          <div className="vessels-page-i42" style={{ borderRadius: 12 }}>
            <div className="vessels-page-i43" style={{ color: clay.pillActiveText }}>
              <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i44" /><span>Vessel record confirmed in database</span>
            </div>
            <div className="vessels-page-i43" style={{ color: clay.accentDark }}>
              <Icon iconName="Sync" aria-hidden="true" className="vessels-page-i44" /><span>Creating SharePoint DMS folder tree (Technical &amp; Crewing, Month End, Certificates)…</span>
            </div>
            <div className="vessels-page-i45">
              <Icon iconName="CircleRing" aria-hidden="true" className="vessels-page-i44" /><span>Linking category subfolders &amp; permissions</span>
            </div>
          </div>

          {/* Live folder-creation feed — one line per folder as Graph confirms it */}
          {!!(host.state.folderCreationResults && host.state.folderCreationResults.length) && (
            <div className="vessels-page-i46" style={{ background: '#0f172a', borderRadius: 10, fontFamily: 'monospace', color: '#cbd5e1' }}>
              {host.state.folderCreationResults.map((r, i) => (
                <div key={`${r.path}-${i}`} className="vessels-page-i47">
                  <span>
                    {r.status === 'failed' ? <Icon iconName="ErrorBadge" aria-hidden="true" className="vessels-page-i11" /> : r.status === 'existed' ? '↩' : <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i11" />}
                  </span>
                  <span className="vessels-page-i48" style={{ color: r.status === 'failed' ? '#f87171' : r.status === 'existed' ? 'var(--vdms-text-faint)' : '#4ade80' }}>
                    {r.path}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

     if (done) {
      const failedCount = (host.state.folderCreationResults || []).filter(r => r.status === 'failed').length;
      return (
        <div className="vessels-page-i25">
          <div className="vessels-page-i26">{failedCount ? <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i27" /> : <Icon iconName="Completed" aria-hidden="true" className="vessels-page-i27" />}</div>
          <h3 className="vessels-page-i49" style={{ color: failedCount ? clay.pillWarnText : clay.pillActiveText }}>
            {failedCount ? 'Vessel Provisioned With Some Issues' : 'Vessel Successfully Provisioned & Classified!'}
          </h3>
          <p className="vessels-page-i29">
            <strong>"{anomaly.name}"</strong> has been registered in the DMS database{failedCount ? ', but ' + failedCount + ' folder' + (failedCount === 1 ? '' : 's') + ' could not be created — see the log above.' : ' and its full SharePoint DMS folder tree has been created.'}
          </p>

          <div className="vessels-page-i30" style={{ background: failedCount ? clay.pillWarnBg : clay.pillActiveBg, border: `1px solid ${failedCount ? clay.pillWarnBg : clay.pillActiveBg}`, borderRadius: 10, color: failedCount ? clay.pillWarnText : clay.pillActiveText }}>
            <div className="vessels-page-i31">{failedCount ? <><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> Provisioning Finished</> : <><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i32" /> Provisioning Complete</>}</div>
            <div>• Registered vessel card added to main grid</div>
            <div>• SharePoint DMS department subfolders created{failedCount ? ` (${failedCount} failed)` : ''}</div>
            <div>• Unrecognised warning dismissed</div>
          </div>

          <div className="vessels-page-i33">
            Auto-closing in {autoClose}s…
          </div>

          <button
            onClick={handleClose}
            className="vessels-page-i50" style={{ background: clay.pillActiveText, color: DMS_ON_ACCENT, borderRadius: 10 }}
          >
            Done / View Vessels
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="vessels-page-i51">
          {anomaly.item_type === 'folder' ? <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i52" /> : <Icon iconName="Page" aria-hidden="true" className="vessels-page-i52" />}
        </div>

        <h3 className="vessels-page-i53">
          Unclassified SharePoint {anomaly.item_type === 'folder' ? 'Folder' : 'File'}
        </h3>
        <p className="vessels-page-i54">
          We found an {anomaly.item_type === 'folder' ? 'folder' : 'file'} in SharePoint that is not currently linked to the DMS. Please choose how you would like to organize it.
        </p>

        {/* Path */}
        <div className="vessels-page-i55" style={{ borderRadius: 8, fontFamily: 'monospace' }}>
          <strong>Current location:</strong><br /><Icon iconName="OpenFolderHorizontal" aria-hidden="true" className="vessels-page-i11" /> {anomaly.spo_path}
        </div>

        {error && (
          <div className="vessels-page-i56" style={{ background: clay.pillDangerBg, border: `1px solid ${clay.pillDangerBg}`, borderRadius: 8, color: clay.pillDangerText }}>
            <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /><span>{error}</span>
          </div>
        )}

        {anomaly.item_type === 'folder' ? (
          <>
            <p className="vessels-page-i57">Choose how to organize this folder</p>
            <div className="vessels-page-i58">
              {/* Vessel option */}
              <button
                onClick={() => handleVessel()}
                className="vessels-page-i59" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, borderRadius: 12, transition: 'opacity 0.2s', boxShadow: clay.shadowButton }}
              >
                <Icon iconName="Ferry" aria-hidden="true" className="vessels-page-i60" />
                <div>
                  <div className="vessels-page-i61">
                    This is a Vessel
                  </div>
                  <div className="vessels-page-i19" style={{ opacity: 0.9 }}>
                    Register this as a vessel and create the required DMS folder structure for it.
                  </div>
                </div>
              </button>

              <div className="vessels-page-i62" style={{ background: clay.surface, borderRadius: 12 }}>
                <div className="vessels-page-i63">
                  <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i60" />
                  <div>
                    <div className="vessels-page-i64">Place Under a DMS Category</div>
                    <div className="vessels-page-i16">Choose the document area and destination where this folder should be placed.</div>
                  </div>
                </div>
                <div className="vessels-page-i65" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                  <select value={documentScope} onChange={e => setDocumentScope(e.target.value as 'vessels' | 'common' | 'kaizen')} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                    <option value="vessels">Vessels</option>
                    <option value="common">Common for all vessels</option>
                    <option value="kaizen">Kaizen - Knowledge Bank</option>
                  </select>
                  {documentScope === 'vessels' ? (
                    <select value={selectedVessel} onChange={e => setSelectedVessel(e.target.value)} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                      <option value="">Select Vessel</option>
                      {host.state.vessels.map(vessel => <option key={vessel.id} value={vessel.name}>{vessel.name}</option>)}
                    </select>
                  ) : <div />}
                  {documentScope !== 'kaizen' && (
                    <select value={selectedMainFolder} onChange={e => setSelectedMainFolder(e.target.value)} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                      <option value="">Select Main Folder</option>
                      {MAIN_FOLDERS.map(main => <option key={main.name} value={main.name}>{main.name}</option>)}
                    </select>
                  )}
                  {folderLevels.map(({ level, options }) => (
                    <select
                      key={level}
                      value={selectedFolderPath[level] || ''}
                      onChange={e => {
                        const nextPath = selectedFolderPath.slice(0, level);
                        if (e.target.value) nextPath.push(e.target.value);
                        setSelectedFolderPath(nextPath);
                      }}
                      className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}
                    >
                      <option value="">Select {level === 0 ? categoryLabel : `Sub-category ${level}`}</option>
                      {options.map(folder => <option key={folder.name} value={folder.name}>{folder.name}</option>)}
                    </select>
                  ))}
                </div>
                <div className="vessels-page-i67" style={{ fontFamily: 'monospace' }}>
                  {(documentScope === 'vessels' ? `${selectedMainFolder || '[Main Folder]'} / ${selectedVessel || '[Vessel]'}` : documentScope === 'common' ? `${selectedMainFolder || '[Main Folder]'} / Common for all ships` : 'Kaizen - Knowledge Bank')}
                  {` / ${selectedFolderPath.join(' / ') || '[Category]'}`} / {anomaly.name}
                </div>
                <button onClick={handlePlaceInCategory} disabled={!canPlaceInCategory} className="vessels-page-i68" style={{ width: isMobile ? '100%' : 'auto', background: canPlaceInCategory ? clay.accentSoft : 'var(--vdms-surface-alt)', color: canPlaceInCategory ? clay.accentDark : 'var(--vdms-text-faint)', border: `1px solid ${clay.accentSoft}`, borderRadius: 8, cursor: canPlaceInCategory ? 'pointer' : 'not-allowed' }}>Place in Category</button>
              </div>

              <button
                onClick={handleNormal}
                className="vessels-page-i69" style={{ borderRadius: 12, transition: 'opacity 0.2s' }}
              >
                <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i60" />
                <div>
                  <div className="vessels-page-i70">
                    Keep Current Folder Location
                  </div>
                  <div className="vessels-page-i16">
                    Keep this folder in its current SharePoint location and add it to the DMS without changing its folder path.
                  </div>
                </div>
              </button>
            </div>
          </>
        ) : (
          /* File item — provide classify + recycle options */
          <div className="vessels-page-i71">
            {/* Place Under DMS Category */}
            <div className="vessels-page-i62" style={{ background: clay.surface, borderRadius: 12 }}>
              <div className="vessels-page-i72">
                <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i60" />
                <div>
                  <div className="vessels-page-i64">Place Under a DMS Category</div>
                  <div className="vessels-page-i16">Move this file to a DMS document folder.</div>
                </div>
              </div>
              <div className="vessels-page-i73" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <select value={documentScope} onChange={e => setDocumentScope(e.target.value as 'vessels' | 'common' | 'kaizen')} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                  <option value="vessels">Vessels</option>
                  <option value="common">Common for all vessels</option>
                  <option value="kaizen">Kaizen - Knowledge Bank</option>
                </select>
                {documentScope === 'vessels' ? (
                  <select value={selectedVessel} onChange={e => setSelectedVessel(e.target.value)} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                    <option value="">Select Vessel</option>
                    {host.state.vessels.map(vessel => <option key={vessel.id} value={vessel.name}>{vessel.name}</option>)}
                  </select>
                ) : <div />}
                {documentScope !== 'kaizen' && (
                  <select value={selectedMainFolder} onChange={e => setSelectedMainFolder(e.target.value)} className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}>
                    <option value="">Select Main Folder</option>
                    {MAIN_FOLDERS.map(main => <option key={main.name} value={main.name}>{main.name}</option>)}
                  </select>
                )}
                {folderLevels.map(({ level, options }) => (
                  <select
                    key={level}
                    value={selectedFolderPath[level] || ''}
                    onChange={e => {
                      const nextPath = selectedFolderPath.slice(0, level);
                      if (e.target.value) nextPath.push(e.target.value);
                      setSelectedFolderPath(nextPath);
                    }}
                    className="vessels-page-i66" style={{ borderRadius: 7, background: clay.surface }}
                  >
                    <option value="">Select {level === 0 ? categoryLabel : `Sub-category ${level}`}</option>
                    {options.map(folder => <option key={folder.name} value={folder.name}>{folder.name}</option>)}
                  </select>
                ))}
              </div>
              <div className="vessels-page-i67" style={{ fontFamily: 'monospace' }}>
                {(documentScope === 'vessels' ? `${selectedMainFolder || '[Main Folder]'} / ${selectedVessel || '[Vessel]'}` : documentScope === 'common' ? `${selectedMainFolder || '[Main Folder]'} / Common for all ships` : 'Kaizen - Knowledge Bank')}
                {` / ${selectedFolderPath.join(' / ') || '[Category]'}`} / {anomaly.name}
              </div>
              <button onClick={handlePlaceInCategory} disabled={!canPlaceInCategory} className="vessels-page-i68" style={{ width: isMobile ? '100%' : 'auto', background: canPlaceInCategory ? clay.accentSoft : 'var(--vdms-surface-alt)', color: canPlaceInCategory ? clay.accentDark : 'var(--vdms-text-faint)', border: `1px solid ${clay.accentSoft}`, borderRadius: 8, cursor: canPlaceInCategory ? 'pointer' : 'not-allowed' }}>Place in Category</button>
            </div>

            {/* Move to Recycle Bin */}
            <button
              onClick={() => host._moveAnomalyToRecycleBin(anomaly)}
              className="vessels-page-i74" style={{ background: clay.pillDangerText, color: DMS_ON_ACCENT, borderRadius: 12 }}
            >
              <Icon iconName="Delete" aria-hidden="true" className="vessels-page-i14" />
              <div>
                <div className="vessels-page-i61">Move to Recycle Bin</div>
                <div className="vessels-page-i19" style={{ opacity: 0.9 }}>Remove this unclassified file and move it to the Recycle Bin.</div>
              </div>
            </button>

            {/* Dismiss only */}
            <button
              onClick={handleNormal}
              className="vessels-page-i75" style={{ borderRadius: 12 }}
            >
              <Icon iconName="Pin" aria-hidden="true" className="vessels-page-i14" />
              <div>
                <div className="vessels-page-i70">Keep in Current Location</div>
                <div className="vessels-page-i16">Dismiss the warning and keep this file in its current SharePoint location.</div>
              </div>
            </button>
          </div>
        )}

      </>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Classify SharePoint Item"
      className="vessels-page-i1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
     onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="vessels-page-i76" style={{ background: clay.surface, padding: isMobile ? '18px 14px' : '32px 36px', width: isMobile ? '95vw' : 480 }}>
        <button
          onClick={handleClose}
          className="vessels-page-i3" style={{ minWidth: 44 }}
          title="Close (provisioning continues in the background)"
        ><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i4" /></button>
        {renderBody()}
      </div>
    </div>
  );
}


// ── Unrecognised Folders Section ─────────────────────────────────────────────


// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderUnrecognisedFolders(host: VesselEmail, items: FolderAnomalyItem[]): React.ReactElement {
  return (
    <div className="vessels-page-i77" style={{ background: clay.pillWarnBg, border: `2px solid ${clay.pillWarnText}` }}>
      {/* Header */}
      <div className="vessels-page-i78">
        <div>
          <h3 className="vessels-page-i79" style={{ color: clay.pillWarnText }}>
            <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i39" /> Folders Created Outside DMS Records
            <span className="vessels-page-i80" style={{ background: clay.pillWarnText, color: DMS_ON_ACCENT }}>{items.length}</span>
          </h3>
          <p className="vessels-page-i81" style={{ color: clay.pillWarnText }}>
            These folders were created directly in SharePoint Online at the vessel management level but are not registered in DMS.
            Please classify each one as a Vessel or a Normal Folder.
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="vessels-page-i12">
        {items.map(item => (
          <div
            key={item.id}
            className="vessels-page-i82" style={{ background: clay.surface, borderRadius: 12, border: `1px solid ${clay.pillWarnBg}` }}
          >
            <div className="vessels-page-i83" style={{ minWidth: 200 }}>
              <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i60" />
              <div>
                <div className="vessels-page-i64">{item.name}</div>
                <div className="vessels-page-i84" style={{ fontFamily: 'monospace' }}>{item.spo_path}</div>
                {item.detected_at && (
                  <div className="vessels-page-i85">
                    Detected: {new Date(item.detected_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <div className="vessels-page-i86">
              {/* Classify button */}
              <button
                onClick={() => host.setState({ spoClassifyDialog: { anomaly: item, provisioning: false, done: false, error: null } })}
                className="vessels-page-i87" style={{ background: clay.pillWarnText, color: DMS_ON_ACCENT, borderRadius: 8 }}
              >
                <Icon iconName="Search" aria-hidden="true" className="vessels-page-i32" /> Classify
              </button>

              {/* Open in SPO */}
              <a
                href={getSpoVesselFolderUrl(
                  (() => {
                    const matchedVessel = item.vessel_name
                      ? host.state.vessels.find(v => v.name.toLowerCase() === item.vessel_name!.toLowerCase())
                      : undefined;
                    return matchedVessel
                      ? getVesselSharePointSiteUrl(host, matchedVessel)
                      : (host.state.documentSites.find(s => s.site_key === host.state.activeDocumentSite)?.web_url || host.props.siteUrl || '');
                  })(),
                  item.name
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="vessels-page-i88" style={{ background: clay.accentSoft, color: clay.accentDark, border: `1px solid ${clay.accentSoft}`, borderRadius: 8 }}
              >
                ↗ Open
              </a>

              {/* Dismiss → opens confirm dialog */}
              <button
                onClick={() => host.setState({ spoAnomalyDismissConfirm: item })}
                className="vessels-page-i89" style={{ borderRadius: 8 }}
                title="Dismiss warning"
              >
                <Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i32" /> Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Normal Folders Section ────────────────────────────────────────────────────
function renderNormalFoldersSection(host: VesselEmail): React.ReactElement | null {
  const folders: NormalFolderRecord[] = host.state.normalFolders || [];
  if (folders.length === 0) return null;

  return (
    <div className="vessels-page-i90">
      {/* Divider */}
      <div className="vessels-page-i91">
        <div className="vessels-page-i92" />
        <span className="vessels-page-i93">
          <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i32" /> Normal Folders ({folders.length})
        </span>
        <div className="vessels-page-i94" />
      </div>

      <div style={{ ...DMS_SECTION_CARD, padding: '16px 20px' }}>
        <p className="vessels-page-i95">
          The following folders were found in SharePoint Online but confirmed as <strong>normal (non-vessel) folders</strong> by a user. They are listed here for reference only.
        </p>

        <div style={dmsGrid(280)}>
          {folders.map((f, idx) => (
            <div
              key={f.id ?? `nf-${idx}`}
              style={{ ...DMS_TILE, cursor: 'default', alignItems: 'flex-start' }}
            >
              <span className="vessels-page-i96">
                {f.item_type === 'folder' ? <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i97" /> : <Icon iconName="Page" aria-hidden="true" className="vessels-page-i97" />}
              </span>
              <div className="vessels-page-i98" style={{ minWidth: 0 }}>
                <div style={DMS_TILE_TITLE}>
                  {f.name}
                </div>
                <div className="vessels-page-i99" style={{ fontFamily: 'monospace' }}>
                  {f.spo_path}
                </div>
                {f.detected_at && (
                  <div className="vessels-page-i100">
                    Saved: {new Date(f.detected_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Vessel Card Provision Dialog ──────────────────────────────────────────────
// Shown when user clicks the "Provision" button on a vessel card.

function renderProvisionDialog(host: VesselEmail): React.ReactElement | null {
  if (!host.state.spoProvisionDialog) return null;
  return <ProvisionModalContent host={host} dlg={host.state.spoProvisionDialog} />;
}
/** Vertical auto-scrolling ticker: shows each folder the moment the backend reports it created. */
function FolderCreationTicker({ feed }: { feed: any[] }): React.ReactElement | null {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feed.length]);

  if (!feed.length) return null;

  return (
    <div
      ref={scrollRef}
      className="vessels-page-i101" style={{ background: '#0f172a', borderRadius: 12, fontFamily: 'monospace' }}
    >
      {feed.map((entry, i) => (
        <div
          key={`${entry.path}-${i}`}
          className="vessels-page-i102" style={{ color: entry.status === 'failed' ? '#f87171' : entry.status === 'existed' ? 'var(--vdms-text-faint)' : '#4ade80' }}
        >
          <span>{entry.status === 'failed' ? <Icon iconName="ErrorBadge" aria-hidden="true" className="vessels-page-i103" /> : entry.status === 'existed' ? '↩' : <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i103" />}</span>
          <span className="vessels-page-i104">
            {entry.path.split('/').slice(-1)[0]}
          </span>
        </div>
      ))}
    </div>
  );
}
function ProvisionModalContent({ host, dlg }: { host: VesselEmail; dlg: any }): React.ReactElement {
  const { vessel, provisioning, done, error } = dlg;
  const [elapsed, setElapsed] = React.useState(0);
  const [autoClose, setAutoClose] = React.useState(10);
  const [retrying, setRetrying] = React.useState(false);
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  const isProvisioned = (
    host.state.provisionedVesselIds?.has(vessel.id) ||
    (host.state.rows && host.state.rows.some(r => r.vesselName && r.vesselName.toLowerCase() === vessel.name.toLowerCase())) ||
    vessel.is_provisioned === true
  );

  const isBusy = (provisioning || host.state.folderProvisioningVesselId === vessel.id || host.state.folderCreationBusy) && !done;
  const isDone = done || (!isBusy && ((host.state.folderCreationResults?.length ?? 0) > 0));

  React.useEffect(() => {
    if (!isBusy) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, [isBusy]);

  React.useEffect(() => {
    if (!isDone) { setAutoClose(10); return; }
    const timer = setInterval(() => setAutoClose(s => {
      if (s <= 1) { clearInterval(timer); handleClose(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [isDone]);

  const formatTimer = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  /** Re-run provisioning for this vessel. Folder creation is now a single,
   * all-or-nothing call to the backend's flat-root /provision-sites endpoint
   * (see VesselEmail.tsx's _provisionVesselFolders) rather than the old
   * client-side multi-folder Graph builder — there's no such thing as
   * "retry just the failed folders" anymore, so retry and full re-provision
   * are the same action. */
  const handleRetryInPlace = async (): Promise<void> => {
    setRetrying(true);
    try {
      const { success } = await host._provisionVesselFolders(vessel.name, vessel.id);
      host.setState({
        spoProvisionDialog: {
          ...dlg,
          provisioning: false,
          done: true,
          error: success ? null : 'Folder provisioning failed — see error below.',
        },
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleProvision = async (): Promise<void> => {
    host.setState({ spoProvisionDialog: { ...dlg, provisioning: true, done: false, error: null } });
    try {
      const { success, results } = await host._provisionVesselFolders(vessel.name, vessel.id);
      const failedCount = results.filter(r => r.status === 'failed').length;
      host.setState({
        spoProvisionDialog: {
          ...dlg,
          provisioning: false,
          done: true,
          error: success ? null : `${failedCount} folder${failedCount === 1 ? '' : 's'} could not be created — see details below.`,
        },
      });
    } catch (e: any) {
      host.setState({ spoProvisionDialog: { ...dlg, provisioning: false, done: false, error: e?.message || 'Failed to provision vessel folders.' } });
    }
  };

  const handleClose = (): void => {
    host.setState({ spoProvisionDialog: null, folderCreationResults: null });
  };

  const renderBody = (): React.ReactElement => {
    if (isBusy) {
      return (
        <div className="vessels-page-i34">
          <div className="vessels-page-i35"><Icon iconName="Sync" aria-hidden="true" className="vessels-page-i7" /></div>
          <h3 className="vessels-page-i36" style={{ color: clay.accentDark }}>
            Provisioning DMS Folder Structure…
          </h3>
          <p className="vessels-page-i37">
            Creating standard DMS folder hierarchy for <strong>&quot;{ vessel.name }&quot;</strong> in SharePoint Online. Please wait.
          </p>

          {/* Live Timer badge */}
          <div className="vessels-page-i38" style={{ background: clay.accentSoft, color: clay.accentDark, border: `1px solid ${clay.accentSoft}` }}>
            <Icon iconName="Clock" aria-hidden="true" className="vessels-page-i39" />
            <span>Elapsed Time: {formatTimer(elapsed)}</span>
          </div>

          {/* Animated Progress Bar */}
          <div className="vessels-page-i40" style={{ borderRadius: 10 }}>
            <div className="vessels-page-i41" style={{ background: clay.accentGradient, width: `${Math.min(96, 15 + elapsed * 12)}%`, borderRadius: 10 }} />
          </div>

          {/* Step Progress Checklist */}
          <div className="vessels-page-i42" style={{ borderRadius: 12 }}>
            <div className="vessels-page-i43" style={{ color: clay.pillActiveText }}>
              <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i44" /><span>Vessel record confirmed in database</span>
            </div>
            <div className="vessels-page-i43" style={{ color: clay.accentDark }}>
              <Icon iconName="Sync" aria-hidden="true" className="vessels-page-i44" /><span>Creating SharePoint DMS folder tree (Technical &amp; Crewing, Month End, Certificates)…</span>
            </div>
         <div className="vessels-page-i45">
              <Icon iconName="CircleRing" aria-hidden="true" className="vessels-page-i44" /><span>Linking category subfolders &amp; permissions</span>
            </div>
          </div>

                  {/* Live Vertical News Ticker */}
          <FolderCreationTicker feed={host.state.folderCreationResults || []} />
        </div>
      );
    }

   if (isDone) {
      const spoUrl = getSpoVesselFolderUrl(host, vessel);
      const failedFolders = (host.state.folderCreationResults || []).filter(r => r.status === 'failed');
      const hasFailures = failedFolders.length > 0;
      return (
        <div className="vessels-page-i25">
          <div className="vessels-page-i26">{hasFailures ? <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i27" /> : <Icon iconName="Completed" aria-hidden="true" className="vessels-page-i27" />}</div>
          <h3 className="vessels-page-i49" style={{ color: hasFailures ? clay.pillWarnText : clay.pillActiveText }}>
            {hasFailures ? 'Vessel Folders Provisioned (with some issues)' : 'Vessel Folders Successfully Provisioned!'}
          </h3>
          <p className="vessels-page-i29">
            {hasFailures ? (
              <><strong>&quot;{vessel.name}&quot;</strong> has been provisioned, but {failedFolders.length} folder{failedFolders.length === 1 ? '' : 's'} could not be created.</>
            ) : (
              <><strong>&quot;{vessel.name}&quot;</strong> has been fully provisioned — all SharePoint DMS folder structures have been created.</>
            )}
          </p>
          {hasFailures ? (
            <div className="vessels-page-i105" style={{ background: clay.pillWarnBg, border: `1px solid ${clay.pillWarnBg}`, borderRadius: 10, color: clay.pillWarnText }}>
              <div className="vessels-page-i106"><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> Folders that failed:</div>
              <div className="vessels-page-i107">
                {failedFolders.map((r, i) => (
                  <div key={`${r.path}-${i}`} title={r.error}>• {r.path.split('/').pop()}</div>
                ))}
              </div>
              {/* Live retry status badge */}
              {retrying ? (
                <div className="vessels-page-i108" style={{ background: clay.accentSoft, color: clay.accentDark, border: `1px solid ${clay.accentSoft}`, borderRadius: 8 }}>
                  <Icon iconName="Sync" aria-hidden="true" className="vessels-page-i109" />
                  <span className="vessels-page-i110">
                    Retrying provisioning…
                  </span>
                </div>
              ) : (
                <div className="vessels-page-i111">
                  <button
                    id="btn-retry-failed-folders"
                    onClick={handleRetryInPlace}
                    className="vessels-page-i112" style={{ background: `linear-gradient(135deg,${clay.pillWarnText},${clay.pillWarnText})`, color: DMS_ON_ACCENT, borderRadius: 8 }}
                  >
                    <Icon iconName="Refresh" aria-hidden="true" className="vessels-page-i32" /> Retry Provisioning
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="vessels-page-i105" style={{ background: clay.pillActiveBg, border: `1px solid ${clay.pillActiveBg}`, borderRadius: 10, color: clay.pillActiveText }}>
              <div className="vessels-page-i31"><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i32" /> Provisioning Complete</div>
              <div>• SharePoint DMS department subfolders created</div>
              <div>• IMO: {vessel.imo || '—'}</div>
              <div>• Vessel is ready for document uploads</div>
            </div>
          )}
          {/* Auto-close countdown */}
          <div className="vessels-page-i113">
            Auto-closing in {autoClose}s…
          </div>
          <div className="vessels-page-i114" style={{ borderRadius: 10 }}>
            <div className="vessels-page-i115" style={{ background: clay.pillActiveText, borderRadius: 10, width: `${(autoClose / 10) * 100}%` }} />
          </div>
          <div className="vessels-page-i116">
            <button
              onClick={handleClose}
              className="vessels-page-i117" style={{ borderRadius: 10 }}
            >
              Close
            </button>
            {spoUrl && spoUrl !== '#' && (
              <a
                href={spoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="vessels-page-i118" style={{ background: clay.pillActiveText, color: DMS_ON_ACCENT, borderRadius: 10 }}
              >
                <Icon iconName="OpenFolderHorizontal" aria-hidden="true" className="vessels-page-i119" /> Open Folder in SharePoint ↗
              </a>
            )}
          </div>
        </div>
      );
    }

    if (!provisioning && !done && isProvisioned) {
      return (
        <div className="vessels-page-i34">
          <div className="vessels-page-i120"><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i121" /></div>
          <h3 className="vessels-page-i122" style={{ color: clay.pillActiveText }}>
            Folders Already Provisioned
          </h3>
          <p className="vessels-page-i37">
            The standard SharePoint DMS folder tree for <strong>&quot;{vessel.name}&quot;</strong> is already provisioned and registered.
          </p>

          <div className="vessels-page-i123" style={{ background: clay.pillActiveBg, border: `1px solid ${clay.pillActiveBg}`, borderRadius: 10, color: clay.pillActiveText }}>
            <div className="vessels-page-i31"><Icon iconName="ClipboardList" aria-hidden="true" className="vessels-page-i32" /> Provisioned Folder Structure:</div>
            <div>• Technical &amp; Crewing — Active</div>
            <div>• Commercial &amp; Chartering — Active</div>
            <div>• Insurance — Active</div>
          </div>

          {error && (
            <div className="vessels-page-i56" style={{ background: clay.pillDangerBg, border: `1px solid ${clay.pillDangerBg}`, borderRadius: 8, color: clay.pillDangerText }}>
              <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /><span>{error}</span>
            </div>
          )}

          <div className="vessels-page-i116">
            <button
              onClick={handleClose}
              className="vessels-page-i124" style={{ borderRadius: 8 }}
            >
              Close
            </button>
            {host.props.siteUrl && (
              <a
                href={getSpoVesselFolderUrl(host, vessel)}
                target="_blank"
                rel="noopener noreferrer"
                className="vessels-page-i125" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, borderRadius: 8 }}
              >
                Open in SharePoint ↗
              </a>
            )}
            <button
              onClick={handleProvision}
              className="vessels-page-i126" style={{ color: clay.accentDark, border: `1px solid ${clay.accentDark}`, borderRadius: 8 }}
            >
              <Icon iconName="Refresh" aria-hidden="true" className="vessels-page-i119" /> Re-Provision Folders
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="vessels-page-i127">
          <div className="vessels-page-i6"><Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i7" /></div>
          <h3 className="vessels-page-i128">
            Provision SharePoint Folders
          </h3>
          <p className="vessels-page-i129">
            This will create the full DMS folder hierarchy for <strong>&quot;{ vessel.name }&quot;</strong> in SharePoint Online across all departments.
          </p>
        </div>

        <div className="vessels-page-i123" style={{ background: clay.accentSoft, border: `1px solid ${clay.accentSoft}`, borderRadius: 10, color: clay.accentDark }}>
          <div className="vessels-page-i31"><Icon iconName="ClipboardList" aria-hidden="true" className="vessels-page-i32" /> What will be created:</div>
          <div>• Technical &amp; Crewing — monthly sub-folders + categories</div>
          <div>• Commercial — contract and invoice folders</div>
          <div>• Insurance — certificate and policy folders</div>
        </div>

        {error && (
          <div className="vessels-page-i56" style={{ background: clay.pillDangerBg, border: `1px solid ${clay.pillDangerBg}`, borderRadius: 8, color: clay.pillDangerText }}>
            <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /><span>{error}</span>
          </div>
        )}

        <div className="vessels-page-i130">
          <button
            onClick={handleClose}
            className="vessels-page-i117" style={{ borderRadius: 8 }}
          >
            Cancel
          </button>
          <button
            onClick={handleProvision}
            className="vessels-page-i131" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, borderRadius: 8, boxShadow: clay.shadowButton }}
          >
  <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i119" /> Start Provisioning
          </button>
        </div>
      </>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Provision Vessel Folders"
      className="vessels-page-i132" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="vessels-page-i133" style={{ background: clay.surface, padding: isMobile ? 16 : 32, width: '100%' }}>
        <button
          onClick={handleClose}
          className="vessels-page-i3" style={{ minWidth: 44 }}
          title="Close (provisioning continues in the background)"
        ><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i4" /></button>
        {renderBody()}
      </div>
    </div>
  );
}


// ── File Alert Dialog ────────────────────────────────────────────────────────
// Shown when a file is uploaded directly to SPO under the Vessels tree.
export function renderFileAlertDialog(host: VesselEmail): React.ReactElement | null {
  const dlg = host.state.spoFileAlertDialog;
  if (!dlg) return null;
  return <FileAlertDialogContent host={host} dlg={dlg} />;
}

function FileAlertDialogContent({ host, dlg }: { host: VesselEmail; dlg: import('../types/ui').SpoFileAlertDialog }): React.ReactElement {
  const { fileName, spoPath, moving, moved, error } = dlg;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  // ── Cascading selection state ──
  const [selVessel, setSelVessel] = React.useState(dlg.vesselName || '');
  const [selMainFolder, setSelMainFolder] = React.useState('');
  const [selGroupKey, setSelGroupKey] = React.useState('');

  const vessels = host.state.vessels;
  const rows = host.state.rows;

  // All unique main-folder (group) names for the selected vessel
  const mainFolders = React.useMemo(() => {
    if (!selVessel) return [];
    const norm = selVessel.trim().toLowerCase();
    return Array.from(new Set(
      rows.filter(r => r.vesselName.trim().toLowerCase() === norm && r.canUpload)
           .map(r => r.group)
    )).sort();
  }, [selVessel, rows]);

  // Sub-folder options for the selected vessel + main folder
  const subFolderOptions = React.useMemo(() => {
    if (!selVessel || !selMainFolder) return [];
    const norm = selVessel.trim().toLowerCase();
    return Array.from(
      new Map(
        rows
          .filter(r => r.vesselName.trim().toLowerCase() === norm && r.group === selMainFolder && r.canUpload)
          .map(r => [r.groupKey, { label: r.subFolderPath, groupKey: r.groupKey, uploadFolderId: r.uploadFolderId, subFolderPath: r.subFolderPath }])
      ).values()
    );
  }, [selVessel, selMainFolder, rows]);

  // Reset downstream selections when parent changes
  const onVesselChange = (v: string): void => { setSelVessel(v); setSelMainFolder(''); setSelGroupKey(''); };
  const onMainFolderChange = (v: string): void => { setSelMainFolder(v); setSelGroupKey(''); };

  const canMove = !!(selVessel && selMainFolder && selGroupKey && !moving);

  const handleMove = async (): Promise<void> => {
    if (!canMove) return;
    const target = subFolderOptions.find(o => o.groupKey === selGroupKey);
    if (!target) return;
    host.setState({ spoFileAlertDialog: { ...dlg, moving: true, error: null } });
    try {
      const { graphClient, siteId, driveId } = host.props;
      if (!graphClient || !siteId || !driveId) throw new Error('SharePoint context not available.');

      // Resolve the live SPO folder ID for the target subfolder
      const liveFolderId = host._getLiveSharePointFolderId(target.subFolderPath);
      let targetId = liveFolderId || target.uploadFolderId;

      // If targetId is a path (contains '/'), resolve it via Graph
      if (!targetId || targetId.includes('/')) {
        const parts = target.subFolderPath.split('>').map((p: string) => p.trim()).filter(Boolean);
        const vName = parts[0] || selVessel;
        const rest = parts.slice(1).join('/');
        const MAIN_FOLDER_LIST = ['Technical & Crewing', 'Commercial & Chartering', 'Insurance'];
        const candidatePaths = [
          ...MAIN_FOLDER_LIST.map(mf => `${mf}/${vName}${rest ? `/${rest}` : ''}`),
          `Vessels/Specific Vessels/${vName}/${rest}`,
          `Vessels/${vName}/${rest}`,
        ].filter(Boolean);
        for (const tryPath of candidatePaths) {
          try {
            const enc = tryPath.split('/').map((s: string) => encodeURIComponent(s)).join('/');
            const item: any = await graphClient.api(`/sites/${siteId}/drives/${driveId}/root:/${enc}?$select=id,folder`).get();
            if (item?.id && item?.folder) { targetId = item.id; break; }
          } catch { /* try next */ }
        }
      }

      if (!targetId || targetId.includes('/')) throw new Error('Could not resolve target folder in SharePoint.');

      // Verify the source file still exists at its current location
      try {
        const srcItem: any = await graphClient.api(`/sites/${siteId}/drives/${driveId}/items/${dlg.fileId}?$select=id,name,parentReference`).get();
        console.log('[VesselDMS] Move source file:', srcItem?.name, 'parentId:', srcItem?.parentReference?.id, '→ targetId:', targetId);
      } catch (verifyErr: any) {
        throw new Error(`Source file not found in SharePoint (${verifyErr?.code || verifyErr?.message}). It may have already been moved.`);
      }

      // Move the file via Graph PATCH
      let moveResult: any;
      try {
        moveResult = await graphClient.api(`/sites/${siteId}/drives/${driveId}/items/${dlg.fileId}`)
          .patch({ parentReference: { id: targetId } });
      } catch (patchErr: any) {
        const msg = patchErr?.message || patchErr?.code || String(patchErr);
        throw new Error(`Graph move failed: ${msg}`);
      }
      if (!moveResult?.id) {
        throw new Error('Graph did not confirm the file move (no item ID returned).');
      }

      // Optimistically add the file to the target folder in UI state
      host.setState(prev => {
        const newFile = { name: fileName, size: '—', date: 'Just now', pending: false, id: dlg.fileId };
        const updated = { ...prev.uploadedFilesByFolder };
        const keys = [targetId, target.groupKey, target.uploadFolderId, target.subFolderPath.trim().toLowerCase()].filter(Boolean) as string[];
        keys.forEach(k => {
          updated[k] = [...(updated[k] || []).filter((f: any) => f.name !== fileName), newFile];
        });
        return { spoFileAlertDialog: { ...dlg, moving: false, moved: true, error: null }, uploadedFilesByFolder: updated };
      });

      // Refresh the target folder from SPO using the confirmed live folder ID
      // Pass isConfirmedGraphFolderId=true so _refreshFolderFiles uses ID lookup, not path lookup
      void host._refreshFolderFiles(targetId, target.groupKey, true, true).catch(() => undefined);
      void host._syncScheduler?.triggerNow().catch(() => undefined);
    } catch (e: any) {
      host.setState({ spoFileAlertDialog: { ...dlg, moving: false, error: e?.message || 'Move failed.' } });
    }
  };

  const handleClose = (): void => { host.setState({ spoFileAlertDialog: null }); };

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${clay.accentSoft}`, fontSize: 12, background: clay.surface,
    outline: 'none', marginBottom: 10, boxSizing: 'border-box',
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="File Uploaded Outside DMS Structure"
      className="vessels-page-i1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
      onClick={e => { if (e.target === e.currentTarget && !moving) handleClose(); }}
    >
      <div className="vessels-page-i134" style={{ background: clay.surface, padding: isMobile ? 16 : 32, width: '100%' }}>
        {!moving && (
          <button onClick={handleClose} className="vessels-page-i3" style={{ minWidth: 44 }} title="Close"><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i4" /></button>
        )}

        {moved ? (
          <div className="vessels-page-i25">
            <div className="vessels-page-i26"><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i27" /></div>
            <h3 className="vessels-page-i49" style={{ color: clay.pillActiveText }}>File Moved Successfully!</h3>
            <p className="vessels-page-i135">
              <strong>&quot;{fileName}&quot;</strong> has been moved to the selected DMS folder.
            </p>
            {selGroupKey && (() => {
              const t = subFolderOptions.find(o => o.groupKey === selGroupKey);
              return t ? <p className="vessels-page-i136" style={{ fontFamily: 'monospace' }}><Icon iconName="OpenFolderHorizontal" aria-hidden="true" className="vessels-page-i32" /> {t.subFolderPath}</p> : null;
            })()}
            <button onClick={handleClose} className="vessels-page-i137" style={{ background: `linear-gradient(135deg,${clay.pillActiveText},${clay.pillActiveText})`, color: DMS_ON_ACCENT, borderRadius: 10 }}>Done</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="vessels-page-i138">
              <div className="vessels-page-i139" style={{ borderRadius: 12, background: clay.pillWarnBg }}><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i97" /></div>
              <div>
                <h3 className="vessels-page-i140">File Uploaded Outside DMS Structure</h3>
                <p className="vessels-page-i141">Detected in SharePoint but not inside a standard DMS folder.</p>
              </div>
            </div>

            {/* File info */}
            <div className="vessels-page-i142" style={{ borderRadius: 10 }}>
              <div className="vessels-page-i143">
                <Icon iconName="Page" aria-hidden="true" className="vessels-page-i4" />
                <span className="vessels-page-i144">{fileName}</span>
              </div>
              <div className="vessels-page-i145" style={{ fontFamily: 'monospace' }}><Icon iconName="OpenFolderHorizontal" aria-hidden="true" className="vessels-page-i11" /> {spoPath}</div>
            </div>

            {error && (
              <div className="vessels-page-i146" style={{ background: clay.pillDangerBg, border: `1px solid ${clay.pillDangerBg}`, borderRadius: 8, color: clay.pillDangerText }}><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> {error}</div>
            )}

            <p className="vessels-page-i147">What would you like to do?</p>

            <div className="vessels-page-i12">
              {/* Keep as is */}
              <button
                onClick={handleClose}
                className="vessels-page-i148" style={{ borderRadius: 10 }}
              >
                <Icon iconName="Pin" aria-hidden="true" className="vessels-page-i97" />
                <div>
                  <div className="vessels-page-i149">Keep as is</div>
                  <div className="vessels-page-i16">Leave the file where it is. The alert stays in the bell for reference.</div>
                </div>
              </button>

              {/* Move to DMS subfolder — cascading selects */}
              <div className="vessels-page-i150" style={{ background: `linear-gradient(135deg,${clay.accentSoft},${clay.accentSoft})`, border: `2px solid ${clay.accentSoft}`, borderRadius: 10 }}>
                <div className="vessels-page-i151">
                  <Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i97" />
                  <div className="vessels-page-i152" style={{ color: clay.accentDark }}>Move to DMS Subfolder</div>
                </div>

                {/* Step 1: Vessel */}
                <label className="vessels-page-i153" style={{ color: clay.accentDark }}>1. Vessel</label>
                <select value={selVessel} onChange={e => onVesselChange(e.target.value)} style={selectStyle}>
                  <option value="">— Select vessel —</option>
                  {vessels.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>

                {/* Step 2: Main Folder / Category */}
                <label className="vessels-page-i153" style={{ color: clay.accentDark }}>2. Main Folder</label>
                <select value={selMainFolder} onChange={e => onMainFolderChange(e.target.value)} disabled={!selVessel || mainFolders.length === 0} style={{ ...selectStyle, opacity: !selVessel ? 0.5 : 1 }}>
                  <option value="">— Select main folder —</option>
                  {mainFolders.map(mf => <option key={mf} value={mf}>{mf}</option>)}
                </select>

                {/* Step 3: Sub-folder */}
                <label className="vessels-page-i153" style={{ color: clay.accentDark }}>3. Sub-folder</label>
                <select value={selGroupKey} onChange={e => setSelGroupKey(e.target.value)} disabled={!selMainFolder || subFolderOptions.length === 0} style={{ ...selectStyle, opacity: !selMainFolder ? 0.5 : 1 }}>
                  <option value="">— Select sub-folder —</option>
                  {subFolderOptions.map(o => <option key={o.groupKey} value={o.groupKey}>{o.label}</option>)}
                </select>

                <button
                  onClick={() => void handleMove()}
                  disabled={!canMove}
                  className="vessels-page-i154" style={{ width: '100%', background: canMove ? clay.accentGradient : clay.accentSoft, color: DMS_ON_ACCENT, borderRadius: 8, cursor: canMove ? 'pointer' : 'not-allowed' }}
                >
                  {moving ? <><Icon iconName="Sync" aria-hidden="true" className="vessels-page-i119" /> Moving…</> : <><Icon iconName="FabricFolder" aria-hidden="true" className="vessels-page-i119" /> Move File</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page Render ─────────────────────────────────────────────────────────

function renderVesselActionPicker(host: VesselEmail): React.ReactElement {
  const action = host.state.vesselActionPicker;
  const isEdit = action === 'edit';
  const isNarrow = host.state.windowWidth < 980;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const selectedDeleteIds = host.state.deleteVesselIds || new Set<string>();
  const selectedDeleteVessels = host.state.vessels.filter(v => selectedDeleteIds.has(v.id));
  const selectedDeleteCount = selectedDeleteVessels.length;
  const allDeleteSelected = host.state.vessels.length > 0 && host.state.vessels.every(v => selectedDeleteIds.has(v.id));

  const toggleDeleteSelection = (vesselId: string): void => {
    host.setState(prev => {
      const next = new Set(prev.deleteVesselIds);
      if (next.has(vesselId)) next.delete(vesselId);
      else next.add(vesselId);
      return { deleteVesselIds: next, modalError: null };
    });
  };

  const selectAllForDelete = (selectAll: boolean): void => {
    host.setState({
      deleteVesselIds: selectAll ? new Set(host.state.vessels.map(v => v.id)) : new Set<string>(),
      modalError: null,
    });
  };

  const proceedToDeleteModal = (): void => {
    if (selectedDeleteVessels.length === 0) {
      host.setState({ modalError: 'Select at least one vessel to delete.' });
      return;
    }
    host.setState({
      modal: 'delete',
      vesselActionPicker: null,
      selectedVessel: selectedDeleteVessels[0],
      deleteVesselIds: new Set(selectedDeleteVessels.map(v => v.id)),
      modalMsg: null,
      modalError: null,
    });
  };

  const openSingleDeleteModal = (vessel: VesselRecord): void => {
    host.setState({
      modal: 'delete',
      vesselActionPicker: null,
      selectedVessel: vessel,
      deleteVesselIds: new Set([vessel.id]),
      modalMsg: null,
      modalError: null,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Select vessel to edit' : 'Select vessel to delete'}
      className="vessels-page-i1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(15,23,42,0.6)', padding: isMobile ? 10 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) host.setState({ vesselActionPicker: null }); }}
    >
      <div className="vessels-page-i155" style={{ background: clay.surface, width: '100%', maxWidth: isEdit ? 560 : 1020 }}>
        <div className="vessels-page-i156">
          <div>
            <h3 className="vessels-page-i157">{isEdit ? 'Select Vessel to Edit' : 'Select Vessel to Delete'}</h3>
            <p className="vessels-page-i158">
              {isEdit ? 'Choose a vessel to update its details.' : 'Choose one or more vessels to move their folders and contents to the Recycle Bin.'}
            </p>
          </div>
          <button onClick={() => host.setState({ vesselActionPicker: null })} className="vessels-page-i159" style={{ minWidth: 44 }} title="Close"><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i160" /></button>
        </div>
        {isEdit ? (
          <div className="vessels-page-i161">
            {host.state.vessels.length === 0 ? (
              <div className="vessels-page-i162">No vessels are available.</div>
            ) : host.state.vessels.map(vessel => (
              <button
                key={vessel.id}
                onClick={() => host._openEditVessel(vessel)}
                className="vessels-page-i163" style={{ width: '100%', borderRadius: 10, background: clay.surface }}
              >
                <span className="vessels-page-i164" style={{ borderRadius: 8, background: clay.accentSoft }}><Icon iconName="Edit" aria-hidden="true" className="vessels-page-i4" /></span>
                <span className="vessels-page-i98" style={{ minWidth: 0 }}>
                  <span className="vessels-page-i165">{vessel.name}</span>
                  <span className="vessels-page-i166">{vessel.vessel_type || 'Vessel'}{vessel.imo ? ` | IMO ${vessel.imo}` : ''}</span>
                </span>
                <span className="vessels-page-i167" style={{ color: clay.accentDark }}>Edit →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="vessels-page-i168">
            <div className="vessels-page-i169" style={{ gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 0.95fr)', height: isNarrow ? 'calc(84vh - 132px)' : 'calc(84vh - 132px)', minHeight: isNarrow ? 'min(360px, 50vh)' : 'min(420px, 50vh)' }}>
              <div className="vessels-page-i170" style={{ borderRadius: 12, background: clay.surface }}>
                <div className="vessels-page-i171" style={{ background: 'linear-gradient(180deg,var(--vdms-surface),var(--vdms-surface-alt))' }}>
                  <span className="vessels-page-i172">Vessel List</span>
                  <div className="vessels-page-i173">
                    <span className="vessels-page-i174">{selectedDeleteCount} selected</span>
                    <button
                      onClick={() => selectAllForDelete(!allDeleteSelected)}
                      className="vessels-page-i175" style={{ background: clay.surface, borderRadius: 8 }}
                    >
                      {allDeleteSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                </div>

                <div className="vessels-page-i176">
                  {host.state.vessels.length === 0 ? (
                    <div className="vessels-page-i162">No vessels are available.</div>
                  ) : host.state.vessels.map(vessel => {
                    const checked = selectedDeleteIds.has(vessel.id);
                    return (
                      <div
                        key={vessel.id}
                        onClick={() => toggleDeleteSelection(vessel.id)}
                        className="vessels-page-i177" style={{ border: checked ? `1px solid ${clay.pillDangerBg}` : '1px solid var(--vdms-line)', borderRadius: 10, background: checked ? clay.pillDangerBg : 'var(--vdms-surface)' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDeleteSelection(vessel.id)}
                          onClick={e => e.stopPropagation()}
                          aria-label={`Select ${vessel.name} for deletion`}
                          className="vessels-page-i178" style={{ width: 16, accentColor: clay.pillDangerText }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span className="vessels-page-i165">{vessel.name}</span>
                          <span className="vessels-page-i179">{vessel.vessel_type || 'Vessel'}{vessel.imo ? ` | IMO ${vessel.imo}` : ''}</span>
                        </span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            openSingleDeleteModal(vessel);
                          }}
                          className="vessels-page-i180" style={{ border: `1px solid ${clay.pillDangerBg}`, background: clay.surface, color: clay.pillDangerText, borderRadius: 8 }}
                          title="Delete this vessel only"
                        >
                          Delete only
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="vessels-page-i181" style={{ border: `1px solid ${clay.pillDangerBg}`, borderRadius: 12, background: `linear-gradient(180deg,${clay.pillDangerBg},var(--vdms-surface))` }}>
                <div className="vessels-page-i182" style={{ borderBottom: `1px solid ${clay.pillDangerBg}` }}>
                  <span className="vessels-page-i167" style={{ color: clay.pillDangerText }}>Selected For Deletion</span>
                  <button
                    onClick={proceedToDeleteModal}
                    disabled={selectedDeleteCount === 0}
                    className="vessels-page-i183" style={{ background: selectedDeleteCount > 0 ? clay.pillDangerText : clay.pillDangerBg, color: DMS_ON_ACCENT, borderRadius: 8, cursor: selectedDeleteCount > 0 ? 'pointer' : 'not-allowed' }}
                  >
                    Delete Selected ({selectedDeleteCount})
                  </button>
                </div>

                <div className="vessels-page-i184">
                  {selectedDeleteCount === 0 ? (
                    <div className="vessels-page-i185" style={{ background: clay.surface, border: `1px dashed ${clay.pillDangerBg}`, borderRadius: 10, color: clay.pillDangerText }}>
                      Select one or more vessels from the left list to enable bulk delete.
                    </div>
                  ) : (
                    selectedDeleteVessels.map(vessel => (
                      <div key={vessel.id} className="vessels-page-i186" style={{ border: `1px solid ${clay.pillDangerBg}`, background: clay.surface }}>
                        <span style={{ minWidth: 0 }}>
                          <span className="vessels-page-i187" style={{ color: clay.pillDangerText }}>{vessel.name}</span>
                          <span className="vessels-page-i188" style={{ color: clay.pillDangerText }}>{vessel.vessel_type || 'Vessel'}{vessel.imo ? ` | IMO ${vessel.imo}` : ''}</span>
                        </span>
                        <button
                          onClick={() => toggleDeleteSelection(vessel.id)}
                          className="vessels-page-i189" style={{ color: clay.pillDangerText }}
                          title="Remove from selected"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {!!host.state.modalError && (
                  <div className="vessels-page-i190" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 6 }}>{host.state.modalError}</div>
                )}

                <div className="vessels-page-i191">
                  <button
                    onClick={() => host.setState({ vesselActionPicker: null, modalError: null })}
                    className="vessels-page-i192" style={{ borderRadius: 8 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VesselCardsGridWrapper({
  children,
  fill = false,
}: {
  children: (rowHeight?: number) => React.ReactNode;
  /** List view: lay children out in a flex column so the table fills the area and scrolls inside. */
  fill?: boolean;
}): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = (): void => {
      const h = el.clientHeight;
      const isMobile = isMobileWidth(typeof window !== 'undefined' ? window.innerWidth : 1200);
      if (h > 300 && !isMobile) {
        const gap = COMPACT_VESSEL_CARD ? 12 : 16;
        // Formula: Exactly 2 rows fit in the visible height without row 3 peeking in
        const computed = Math.ceil((h - 2 * gap) / 2);
        setRowHeight(Math.max(computed, 195));
      } else {
        setRowHeight(undefined);
      }
    };

    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);

  return (
    <div
      ref={containerRef}
      className="vdms-scroll-clean"
      style={{
        flex: '1 1 auto',
        overflowY: 'auto',
        minHeight: 0,
        paddingRight: 0, // the grid carries its own 4px side padding (hover lift / selected ring room), so the gutters stay equal
        paddingBottom: COMPACT_VESSEL_CARD ? 14 : 18,
        ...(fill ? { display: 'flex', flexDirection: 'column' as const } : null),
      }}
    >
      {children(rowHeight)}
    </div>
  );
}

export function renderVesselsPage(host: VesselEmail): React.ReactElement {
    const {
      vessels, vesselsSearch, vesselStatusFilter,
      modal, selectedVessel, folderProvisioningVesselId, folderCreationError,
      folderCreationResults, panelLoading, loading,
    } = host.state;

    const normalizeSiteId = (value: string | null | undefined): string => {
      return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    };

    // Resolve a raw site value to the real, CONFIGURED site_key it identifies
    // — using only host.state.documentSites (populated from GET /api/sites,
    // i.e. the backend's own env/config-driven site registry), never a
    // hardcoded list of site-name synonyms. Mirrors the backend's
    // _resolve_configured_site_key in config.py so both sides agree on what
    // counts as "the same site". Returns null if it doesn't match any
    // currently configured site.
    const resolveConfiguredSiteKey = (normalized: string): string | null => {
      if (!normalized) return null;
      const sites = host.state.documentSites || [];
      // 1. Exact match on a configured site_key.
      for (const site of sites) {
        const key = normalizeSiteId(site.site_key);
        if (key && key === normalized) return key;
      }
      // 2. The site_key appears as a whole word (handles values like
      // "Vessel DMS (dev)" -> normalized "vessel dms dev", which contains
      // the configured site_key "dev" as a token).
      const tokens = normalized.split(' ');
      for (const site of sites) {
        const key = normalizeSiteId(site.site_key);
        if (key && tokens.indexOf(key) >= 0) return key;
      }
      // 3. Match against that site's own configured display name / URL
      // (handles a value recorded under its human label rather than its
      // site_key, e.g. sp_site_name "Communication Site" or "OzellarDMS").
      for (const site of sites) {
        const key = normalizeSiteId(site.site_key);
        const candidates = [normalizeSiteId(site.sp_site_name), normalizeSiteId(site.web_url)];
        for (const candidate of candidates) {
          if (candidate && (candidate === normalized || candidate.indexOf(normalized) >= 0 || normalized.indexOf(candidate) >= 0)) {
            return key;
          }
        }
      }
      return null;
    };

    // Treat two site references as the same site only when they resolve to
    // the same CONFIGURED site (see resolveConfiguredSiteKey) — driven
    // entirely by the live /api/sites registry, never by a hardcoded list of
    // site-name synonyms. A value that happens to be "local" is only the
    // same site as "ozellardms" if the site registry itself says so;
    // otherwise they are two distinct configured sites and must not be
    // merged, however similar their names look (this is what previously
    // made every legacy "local"-tagged DMS vessel show up under OzellarDMS).
    const siteAliasMatches = (left: string | null | undefined, right: string | null | undefined): boolean => {
      const a = normalizeSiteId(left);
      const b = normalizeSiteId(right);
      if (!a || !b) return false;
      if (a === b) return true;
      const aKey = resolveConfiguredSiteKey(a);
      const bKey = resolveConfiguredSiteKey(b);
      return !!(aKey && bKey && aKey === bKey);
    };

    const filtered = vessels.filter(v => {
      if (vesselStatusFilter !== 'all' && (v.status || 'Active') !== vesselStatusFilter) return false;
      if (host.state.vesselSiteFilter && host.state.vesselSiteFilter !== 'all') {
        const selectedSiteKey = host.state.vesselSiteFilter;
        // Rows fetched with /api/vessels?site_key=<site> were already scoped
        // by the backend against the full configured site registry (e.g. a
        // vessel recorded under another site key that shares the same
        // document library) — trust that instead of re-matching them against
        // the client's partial site list. See _filterDeletedVessels.
        const fetchedForSite = (v as any)._fetched_for_site as string | undefined;
        if (fetchedForSite && fetchedForSite !== 'all') {
          if (normalizeSiteId(fetchedForSite) !== normalizeSiteId(selectedSiteKey)) return false;
        } else {
          // Optimistic / not-yet-refetched rows: match by site metadata.
          const siteMatches = (v.provisioned_site_ids || []).some(id => siteAliasMatches(String(id), selectedSiteKey)) ||
            !!(v.provisioned_site_key && siteAliasMatches(String(v.provisioned_site_key), selectedSiteKey));
          if (!siteMatches) {
            const hasNoSiteMetadata = !(v.provisioned_site_ids || []).length && !(v.provisioned_site_key || '').trim();
            if (!hasNoSiteMetadata) return false;
          }
        }
      }
      if (vesselsSearch) {
        const q = vesselsSearch.toLowerCase();
        return v.name.toLowerCase().includes(q) ||
          (v.imo || '').includes(vesselsSearch) ||
          (v.vessel_type || '').toLowerCase().includes(q) ||
          (v.shipyard || '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => (a.name || '').trim().localeCompare((b.name || '').trim(), undefined, { sensitivity: 'base', numeric: true })); // A–Z by vessel name

    const filteredDocumentSites = (host.state.documentSites || []).filter(site => {
      const siteKey = String(site.site_key || site.site_id || site.sp_site_name || '').toLowerCase();
      const siteName = String(site.sp_site_name || site.site_key || site.site_id || '').toLowerCase();
      if (siteKey.includes('nks') || siteName.includes('nks') || siteKey.includes('docman')) return false;
      return true;
    });

    const siteOptions = Array.from(new Map(
      filteredDocumentSites.map(site => [String(site.site_key || site.site_id || site.sp_site_name || '').toLowerCase(), site])
    ).values()).map(site => ({
      key: String(site.site_key || site.site_id || site.sp_site_name || ''),
      label: site.sp_site_name || site.site_key || site.site_id || 'SharePoint Site',
    }));

    // All unique vessel types for filter dropdown

    // Opens a vessel's folder in the Documents page (shared by the card and list views).
    const openVesselDocuments = async (vessel: typeof vessels[number]): Promise<void> => {
      const isSharePointOnly = vessel.source === 'sharepoint';
              // "Found in SharePoint" rows are view-only: their
              // vessel_folder_path is the real "root/child" path
              // when the site's vessel folders are chosen (else
              // just the name, found at the root or one level down
              // by the folder walk below).
              // No recorded folder path (e.g. a vessel discovered
              // from SharePoint): ask the backend to find its folder
              // by name in its own site and save it, so navigation
              // opens the real folder instead of guessing that it
              // sits at the library root.
              if (!isSharePointOnly && !vessel.vessel_folder_path && vessel.id) {
                try {
                  const r = await fetch(`${host._base()}/api/vessel-folder-template/locate/${encodeURIComponent(String(vessel.id))}`, { headers: host._headers() });
                  const loc = r.ok ? await r.json() : null;
                  if (loc?.found && loc.folder_path) {
                    Object.assign(vessel, {
                      vessel_folder_path: loc.folder_path,
                      provisioned_site_key: vessel.provisioned_site_key || loc.site_key,
                    });
                    host.setState({ vessels: [...host.state.vessels] });
                  }
                } catch {
                  // Fall back to the old best-effort navigation below.
                }
              }
              const nav = resolveVesselDocumentNavigation(host, vessel);
              const navSite = nav.folderPathStack.length >= 2
                ? (host.state.documentSites || []).find(site =>
                    `site:${site.site_id || site.site_key}` === nav.folderPathStack[1].id ||
                    site.site_key === vessel.provisioned_site_key ||
                    (vessel.provisioned_site_ids || []).some(id => String(id).toLowerCase() === String(site.site_key || '').toLowerCase())
                  )
                : null;
              let folderPathStack = nav.folderPathStack;
              let resolvedDriveId: string | null = navSite?.drive_id || null;
              if (navSite?.site_id && nav.folderPathStack[0]?.id === 'sites_root') {
                try {
                  const liveDrives = await host._loadSiteDrives(navSite.site_id);
                  const preferredDrive = liveDrives.find(d => /^(documents|shared documents)$/i.test(d.name.trim()));
                  const liveDrive = preferredDrive || liveDrives.find(d => d.id === navSite.drive_id) || liveDrives[0];
                  if (liveDrive) {
                    resolvedDriveId = liveDrive.id;
                    folderPathStack = nav.folderPathStack.map((node, index) => index === 2
                      ? { id: `drive:${liveDrive.id}`, name: liveDrive.name || node.name }
                      : node);
                    host.setState({
                      documentSites: host.state.documentSites.map(site => site.site_key === navSite.site_key
                        ? { ...site, drive_id: liveDrive.id, default_library_name: liveDrive.name || site.default_library_name }
                        : site),
                    });
                  }
                } catch {
                  // Keep the configured drive as a fallback if live resolution is unavailable.
                }
              }
              // folderPathStack[3+] were built from vessel.vessel_folder_path
              // segments with placeholder ids (a DB vessel id or a
              // "<segment>-<n>" string) — neither is a real Graph
              // drive-item id. Folder view's live children fetch is
              // keyed by real id, so walk the actual site/drive tree
              // from root, matching each segment by name (vessel-
              // prefix-insensitive), and swap in the real ids we find.
              // Without this, "View Documents" lands on a folder id
              // Graph has never heard of and the listing (and every
              // breadcrumb slice of it) renders empty.
              if (navSite?.site_id && resolvedDriveId && folderPathStack[0]?.id === 'sites_root' && folderPathStack.length > 3) {
                const resolveSiteId = navSite.site_id;
                const resolveDriveId = resolvedDriveId;
                try {
                  const stripPrefix = (s: string) => s.replace(/^(mv|m\/v|m\.v\.|mt|m\/t|m\.t\.)\s+/i, '');
                  // Compare with runs of spaces collapsed: SharePoint folders such as
                  // "Technical and Crewing  New" (two spaces) must match the cleaned
                  // segment names built by resolveVesselDocumentNavigation.
                  const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                  const resolvedPath = folderPathStack.slice(0, 3);
                  let parentId = 'root';
                  for (let i = 3; i < folderPathStack.length; i++) {
                    const segName = norm(folderPathStack[i].name);
                    // eslint-disable-next-line no-await-in-loop
                    const children = await host._loadAndCacheSiteFolderChildren(resolveSiteId, resolveDriveId, parentId);
                    const match = (children || []).find((item: any) => !!item.folder && (
                      norm(item.name) === segName ||
                      stripPrefix(norm(item.name)) === stripPrefix(segName)
                    ));
                    if (!match?.id) {
                      // A vessel with no recorded folder path sits under its
                      // main folder (e.g. Technical & Crewing > <vessel>), not at
                      // the drive root: look one level down, main folder first.
                      if (i === 3 && folderPathStack.length === 4) {
                        const mainLow = (nav.docMainFolder || '').toString().trim().toLowerCase();
                        const mains = (children || []).filter((item: any) => !!item.folder && !!item.id)
                          .sort((a: any, b: any) => Number((b.name || '').trim().toLowerCase() === mainLow) - Number((a.name || '').trim().toLowerCase() === mainLow));
                        for (const mainFolder of mains) {
                          // eslint-disable-next-line no-await-in-loop
                          const kids = await host._loadAndCacheSiteFolderChildren(resolveSiteId, resolveDriveId, mainFolder.id);
                          const hit = (kids || []).find((item: any) => !!item.folder && !!item.id && (
                            norm(item.name) === segName ||
                            stripPrefix(norm(item.name)) === stripPrefix(segName)
                          ));
                          if (hit) {
                            resolvedPath.push({ id: mainFolder.id, name: mainFolder.name }, { id: hit.id, name: hit.name || folderPathStack[i].name });
                            break;
                          }
                        }
                      }
                      break;
                    }
                    resolvedPath.push({ id: match.id, name: match.name || folderPathStack[i].name });
                    parentId = match.id;
                  }
                  if (resolvedPath.length > 3) {
                    folderPathStack = [...resolvedPath, ...folderPathStack.slice(resolvedPath.length)];
                  }
                } catch {
                  // Keep placeholder ids; Folder view will show an empty state for the unresolved tail.
                }
              }
              host._pushFolderNav(folderPathStack, nav.docMainFolder);
              host.setState({
                view: 'list',
                docViewMode: 'folder',
                vesselFilter: nav.vesselFilter,
                docScopeType: folderPathStack[0]?.id === 'sites_root' ? 'sites' : 'vessels',
                activeDocumentSite: navSite?.site_key || host.state.activeDocumentSite,
                docMainFolder: nav.docMainFolder,
                folderPathStack,
                docGroupFilter: 'all',
                docCategoryFilter: 'all',
                docGroupLevelFilter: 'all',
                docLeafCategoryFilter: 'all',
                docSubCategoryFilter: 'all',
                catFilter: 'all',
                docListPage: 0,
              });
              if (folderPathStack[0]?.id !== 'sites_root') {
                void host._loadFilesForVessel(vessel.name).catch(() => undefined);
              }
    };

    // Cards / List toggle (remembered in this browser).
    const vesselsViewMode: 'cards' | 'list' = (host.state as any).vesselsViewMode
      || ((): 'cards' | 'list' => { try { return window.localStorage.getItem('vdms.vesselsViewMode') === 'list' ? 'list' : 'cards'; } catch { return 'cards'; } })();
    const setVesselsViewMode = (mode: 'cards' | 'list'): void => {
      try { window.localStorage.setItem('vdms.vesselsViewMode', mode); } catch { /* ignore */ }
      host.setState({ vesselsViewMode: mode } as any);
    };
    // The fixed columns alone take about 740px; below this width the table scrolls sideways instead of squeezing Vessel / Type to nothing.
    const LIST_MIN_WIDTH = 1060;
    const LIST_COLS = 'minmax(0, 2.2fr) minmax(0, 1.1fr) 84px 76px 70px 84px 88px minmax(110px, 1.2fr) minmax(0, 1.7fr) 104px';

    const isLoading = panelLoading || (loading && vessels.length === 0);

    // Segregated anomalies
    const allAnomalies = host.state.folderAnomalies || [];
    const vesselLevelFolders = allAnomalies.filter(a => a.anomaly_type === 'vessel_level_unmatched' && a.item_type === 'folder');
    const vesselLevelFiles   = allAnomalies.filter(a => a.anomaly_type === 'vessel_level_unmatched' && a.item_type === 'file');

    return (
      <div
        className="vdms-vessels-page"
      >
        {/* ── Stationary Controls Header & Filters ── */}
        <div className="vdms-vessels-controls">
          {/* ── Header ── */}
          <div className="vdms-vessels-header">
          <DmsPageHeader
            title={(
              <span className="vessels-page-i193">
                Vessels
                {vessels.length > 0 && (
                  <span className="vessels-page-i194" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, boxShadow: clay.shadowIcon }}>
                    {vessels.length}
                  </span>
                )}
                {(vesselLevelFolders.length + vesselLevelFiles.length) > 0 && (
                  <span
                    onClick={() => host._toggleAlertBell()}
                    className="vessels-page-i195" style={{ background: dmsTone('warning').bg, color: dmsTone('warning').fg, border: `1px solid ${dmsTone('warning').bg}` }}
                    title="SPO items detected outside DMS structure — click to view in Alerts"
                  >
                    <Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> {vesselLevelFolders.length + vesselLevelFiles.length} SPO item{vesselLevelFolders.length + vesselLevelFiles.length !== 1 ? 's' : ''} — view in Alerts →
                  </span>
                )}
              </span>
            )}
            subtitle="Each vessel's documents at a glance — how many, where they are, and what still needs sorting."
          >
            <button
              onClick={() => { clearVesselSummaryCache(); host._goToView('vessels').catch(() => undefined); }}
              title="Reload vessels and their document figures"
              aria-label="Refresh vessel list"
              onMouseEnter={e => { e.currentTarget.style.background = clay.surfaceHover; e.currentTarget.style.boxShadow = clay.shadowRaisedHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = clay.surface; e.currentTarget.style.boxShadow = clay.shadowRaised; }}
              className="vdms-icon-btn" style={{ background: clay.surface, color: clay.textMuted, boxShadow: clay.shadowRaised }}
            >
              <Icon iconName="Refresh" />
            </button>
            <button
              onClick={() => host._openVesselActionPicker('edit')}
              title="Edit vessel"
              aria-label="Edit vessel"
              onMouseEnter={e => { e.currentTarget.style.background = clay.surfaceHover; e.currentTarget.style.boxShadow = clay.shadowRaisedHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = clay.surface; e.currentTarget.style.boxShadow = clay.shadowRaised; }}
              className="vdms-icon-btn" style={{ background: clay.surface, color: clay.accentDark, boxShadow: clay.shadowRaised }}
            >
              <Icon iconName="Edit" />
            </button>
            <button
              onClick={() => host._openVesselActionPicker('delete')}
              title="Delete vessel"
              aria-label="Delete vessel"
              onMouseEnter={e => { e.currentTarget.style.background = dmsTone('danger').bg; e.currentTarget.style.boxShadow = clay.shadowRaisedHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = clay.surface; e.currentTarget.style.boxShadow = clay.shadowRaised; }}
              className="vdms-icon-btn" style={{ background: clay.surface, color: dmsTone('danger').fg, boxShadow: clay.shadowRaised }}
            >
              <Icon iconName="Delete" />
            </button>
            {/* Manual "Sync Vessels from SharePoint" button removed — the
                backend already runs this reconciliation automatically in
                the background on every vessel-list fetch, throttled per
                site (see _maybeAutoSyncVesselsFromSharePoint). */}
            <button
              onClick={() => host._openCreate()}
              title="Create new vessel"
              aria-label="Create new vessel"
              onMouseEnter={e => { e.currentTarget.style.background = clay.accentGradientHover; e.currentTarget.style.boxShadow = clay.shadowButton; }}
              onMouseLeave={e => { e.currentTarget.style.background = clay.accentGradient; e.currentTarget.style.boxShadow = clay.shadowButton; }}
              className="vdms-icon-btn vdms-icon-btn--primary" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, boxShadow: clay.shadowButton }}
            >
              <Icon iconName="Add" />
            </button>
          </DmsPageHeader>
        </div>

        {/* ── Search & Filter Bar ── */}
        <div className="vdms-vessels-toolbar">
          <div className="vdms-vessels-search">
            <Icon iconName="Search" aria-hidden="true" className="vdms-vessels-search__icon" />
            <input
              type="text"
              placeholder="Search vessels…"
              value={vesselsSearch}
              onChange={e => host.setState({ vesselsSearch: e.target.value })}
              style={{ ...dmsControlStyle(), width: '100%', padding: '10px 14px 10px 38px', boxSizing: 'border-box' }}
            />
          </div>
          <SiteSelector
            ariaLabel="Filter by status"
            minWidth={150}
            searchable={false}
            showIcons={false}
            value={vesselStatusFilter}
            onChange={key => host.setState({ vesselStatusFilter: key })}
            options={[
              { key: 'all', label: 'All Status' },
              { key: 'Active', label: 'Active' },
              { key: 'In Maintenance', label: 'In Maintenance' },
              { key: 'Inactive', label: 'Inactive' },
            ]}
          />
          <SiteSelector
            ariaLabel="Filter by SharePoint site"
            minWidth={200}
            value={host.state.vesselSiteFilter || 'all'}
            options={[{ key: 'all', label: 'All SharePoint Sites' }, ...siteOptions.map(site => ({ key: site.key, label: site.label }))]}
            onChange={key => {
              // The vessel list fetched by _loadData is already scoped to a
              // single site_key (see _loadData Step 1) — switching sites here
              // must re-fetch /api/vessels?site_key=<new site>, not just
              // re-filter the previous site's already-loaded vessels
              // client-side (which is what this used to do, and why picking
              // OzellarExternal / OzellarDMS without hitting "Sync" showed
              // nothing and sent no request).
              host.setState({ vesselSiteFilter: key }, () => { void host._loadData(true); });
            }}
          />
          {(vesselsSearch || vesselStatusFilter !== 'all' || (host.state.vesselSiteFilter && host.state.vesselSiteFilter !== 'all')) && (
            <button
              onClick={() => {
                const siteFilterWasScoped = !!host.state.vesselSiteFilter && host.state.vesselSiteFilter !== 'all';
                host.setState(
                  { vesselsSearch: '', vesselStatusFilter: 'all', vesselTypeFilter: 'all', vesselSiteFilter: 'all' },
                  () => { if (siteFilterWasScoped) void host._loadData(true); },
                );
              }}
              style={dmsBtn('ghost')}
              title="Clear filters"
              aria-label="Clear filters"
            >
<Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i119" /> Clear
            </button>
          )}
          <div className="vdms-vessels-viewbar">
          <div role="group" aria-label="Vessel view" className="vdms-vessels-viewtoggle">
            {([['cards', 'GridViewMedium', 'Cards'], ['list', 'List', 'List']] as const).map(([mode, icon, text]) => {
              const on = vesselsViewMode === mode;
              return (
                <button key={mode} type="button" onClick={() => setVesselsViewMode(mode)} aria-pressed={on} title={`${text} view`}
                  className="vdms-vessels-viewtoggle__btn" style={{ background: on ? clay.accent : 'transparent', color: on ? DMS_ON_ACCENT : clay.textMuted }}>
                  <Icon iconName={icon} aria-hidden="true" className="vessels-page-i119" /> {text}
                </button>
              );
            })}
          </div>
          <span className="vdms-vessels-count" style={{ color: clay.textMuted }}>
            {filtered.length} vessel{filtered.length !== 1 ? 's' : ''}
          </span>
          </div>
        </div>

        {/* Where this site's vessel folders are — the same setting as Sites →
            Site Management, here so a wrong "Found in SharePoint" suggestion
            can be fixed on the spot. Saving re-scans the site, then the list
            reloads. */}
        {host.state.vesselSiteFilter && host.state.vesselSiteFilter !== 'all' && (
          <div className="vessels-page-i196">
            <VesselRootsControl
              key={host.state.vesselSiteFilter}
              host={host}
              siteKey={host.state.vesselSiteFilter}
              onSaved={() => {
                clearVesselSummaryCache();
                // The list reads the chosen folders live — reload right away.
                host._goToView('vessels').catch(() => undefined);
              }}
            />
          </div>
        )}

        {/* ── Folder creation status banners ── */}
        {folderCreationError && (
          <div className="vessels-page-i197" style={{ background: dmsTone('danger').bg, border: `1px solid ${dmsTone('danger').bg}`, borderRadius: 8, color: dmsTone('danger').fg }}>
            <span><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> {folderCreationError}</span>
            <button onClick={() => host.setState({ folderCreationError: null })} className="vessels-page-i198" style={{ color: dmsTone('danger').fg }}><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i32" /></button>
          </div>
        )}
        {folderCreationResults && folderCreationResults.length > 0 && !folderCreationError && (() => {
          const createdCount = folderCreationResults.filter(r => r.status === 'created').length;
          const existedCount = folderCreationResults.filter(r => r.status === 'existed').length;
          if (createdCount === 0 && existedCount === 0) return null;

          // Determine the vessel that was just provisioned for correct link generation
          const provisionedVessel = selectedVessel ||
            vessels.find(v => v.id === host.state.folderProvisioningVesselId) ||
            vessels.find(v => (v.provisioned_site_ids || []).includes(host.state.activeDocumentSite || ''));
          const bannerSiteUrl = provisionedVessel
            ? getVesselSharePointSiteUrl(host, provisionedVessel)
            : (host.state.activeDocumentSite
                ? (host.state.documentSites.find(s => s.site_key === host.state.activeDocumentSite)?.web_url || host.props.siteUrl)
                : host.props.siteUrl);
          const bannerHref = getSpoVesselFolderUrl(host, provisionedVessel, bannerSiteUrl);
          return (
            <div className="vessels-page-i197" style={{ background: dmsTone('success').bg, border: `1px solid ${dmsTone('success').bg}`, borderRadius: 8, color: dmsTone('success').fg }}>
              <div className="vessels-page-i199">
                <span><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i32" /> SharePoint folders provisioned — {createdCount} created, {existedCount} already existed.</span>
                {bannerHref && bannerHref !== '#' && (
                  <a
                    href={bannerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vessels-page-i200" style={{ color: clay.accentDark }}
                  >
                    Open SharePoint Folder ↗
                  </a>
                )}
              </div>
              <button onClick={() => host.setState({ folderCreationResults: null })} className="vessels-page-i198" style={{ color: dmsTone('success').fg }}><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i32" /></button>
            </div>
          );
        })()}

        {/* ── Vessel sync (SharePoint auto-discovery) status banners ── */}
        {host.state.vesselSyncError && (
          <div className="vessels-page-i197" style={{ background: dmsTone('danger').bg, border: `1px solid ${dmsTone('danger').bg}`, borderRadius: 8, color: dmsTone('danger').fg }}>
            <span><Icon iconName="Warning" aria-hidden="true" className="vessels-page-i32" /> {host.state.vesselSyncError}</span>
            <button onClick={() => host.setState({ vesselSyncError: null })} className="vessels-page-i198" style={{ color: dmsTone('danger').fg }}><Icon iconName="Cancel" aria-hidden="true" className="vessels-page-i32" /></button>
          </div>
        )}
        {/* Success/summary banner for the manual sync removed along with the
            button above — it only ever surfaced host.state.vesselSyncSummary,
            which nothing else sets. The error banner above still applies to
            _confirmDiscoveredVessel's own failures. */}
        </div>

        {/* ── Scrollable Vessel Cards & Folders Body ── */}
        <VesselCardsGridWrapper fill={vesselsViewMode === 'list' && !isLoading && filtered.length > 0}>
          {(rowHeight) => (
            <>
              {/* ── Loading State ── */}
              {isLoading ? (
                <div className="vessels-page-i201" style={{ background: clay.surface, borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}>
                  <DmsLoadingState label="Loading vessels from database…" hint="Fetching vessel records and folder structure" />
                </div>
              ) : filtered.length === 0 ? (
                /* ── Empty State ── */
                <DmsEmptyState
                  icon="Ferry"
                  title={vessels.length === 0 ? 'No vessels yet' : 'No vessels match your filter'}
                  action={vessels.length === 0 && (
                    <button
                      onClick={() => host._openCreate()}
                      style={{ ...dmsBtn('primary'), marginTop: 6 }}
                    >
                      + Create First Vessel
                    </button>
                  )}
                >
                  {vessels.length === 0
                    ? 'Create your first vessel to provision its SharePoint folder structure.'
                    : 'Try clearing the search or filters.'}
                </DmsEmptyState>
              ) : vesselsViewMode === 'list' ? (
                /* ── Vessel List (table) ── */
                <div className="vessels-page-i202">
                  <div className="vdms-scroll-clean" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
                  <div>
                    <div className="vessels-page-i203" style={{ gridTemplateColumns: LIST_COLS, minWidth: LIST_MIN_WIDTH }}>
                      <span>Vessel</span><span>Type</span><span>Status</span><span>Drawings</span><span>Manuals</span><span>Certificates</span><span>To classify</span><span className="vessels-page-i204">Mix</span><span>Last update</span><span className="vessels-page-i204">Actions</span>
                    </div>
                    {filtered.map(vessel => {
                      const isSelected = selectedVessel?.id === vessel.id;
                      const status = vessel.status || 'Active';
                      const isSharePointOnly = vessel.source === 'sharepoint';
                      const warn = status === 'In Maintenance' || isSharePointOnly;
                      const statusText = status === 'Active' ? clay.pillActiveText : warn ? clay.pillWarnText : clay.pillDangerText;
                      const statusBg = status === 'Active' ? clay.pillActiveBg : warn ? clay.pillWarnBg : clay.pillDangerBg;
                      const initial = (vessel.name || '').replace(/^(mv|m\/v|m\.v\.|mt|m\/t|m\.t\.)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 1).map(w => w[0]).join('').toUpperCase() || '?';
                      return (
                        <div
                          key={vessel.id}
                          onClick={() => host.setState({ selectedVessel: isSelected ? null : vessel })}
                          className="vessels-page-i205" style={{ gridTemplateColumns: LIST_COLS, minWidth: LIST_MIN_WIDTH, background: isSelected ? 'var(--vdms-field, rgba(14,116,144,0.08))' : 'transparent', boxShadow: isSelected ? `inset 3px 0 0 ${clay.accent}` : undefined }}
                        >
                          <div className="vessels-page-i206" style={{ minWidth: 0 }}>
                            <span aria-hidden="true" className="vessels-page-i207" style={{ background: isSelected ? clay.accent : (clay.accentSoft || 'var(--clay-accent-soft, #dceef2)'), color: isSelected ? DMS_ON_ACCENT : clay.accent, fontFamily: vdmsFont.display }}>
                              {isSelected ? <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i32" /> : initial}
                            </span>
                            <span className="vessels-page-i208" style={{ fontFamily: vdmsFont.display, color: clay.text }} title={vessel.name}>{vessel.name}</span>
                          </div>
                          <span className="vessels-page-i209" title={vessel.vessel_type || undefined}>{vessel.vessel_type || '—'}</span>
                          <span className="vessels-page-i210" style={{ background: statusBg, color: statusText }}>{status}</span>
                          <VesselDocStatsCells
                            host={host}
                            vesselName={vessel.name}
                            siteKey={String(host.state.vesselSiteFilter || 'all')}
                          />
                          <div className="vessels-page-i211">
                            <button
                              onClick={e => { e.stopPropagation(); void openVesselDocuments(vessel); }}
                              title={`Open ${vessel.name}'s folder in Documents`}
                              style={{ ...dmsBtn('primary'), height: 30, padding: '0 10px', fontSize: 12, fontWeight: 700, borderRadius: 9 }}
                            >
                              <Icon iconName="Page" aria-hidden="true" className="vessels-page-i32" /> Open
                            </button>
                            <a
                              href={getSpoVesselFolderUrl(host, vessel)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Open in SharePoint"
                              style={{ ...dmsBtn('secondary'), width: 30, height: 30, padding: 0, borderRadius: 9, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
                            >
                              ↗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              ) : (
                /* ── Vessel Cards Grid ── */
                <div className="vdms-vessels-grid" style={{ gridAutoRows: rowHeight ? `${rowHeight}px` : undefined }}>
            {filtered.map(vessel => {
              const isSelected = selectedVessel?.id === vessel.id;
              const status = vessel.status || 'Active';
              // "Found in SharePoint" = a real vessel folder discovered via the
              // site's Term Store (see GET /api/vessels), not yet added as a
              // DMS vessel record — styled like "In Maintenance" (amber, needs
              // attention) rather than the red "danger" pill everything else
              // falls into.
              const isSharePointOnly = vessel.source === 'sharepoint';
              const statusText  = status === 'Active' ? clay.pillActiveText : (status === 'In Maintenance' || isSharePointOnly) ? clay.pillWarnText : clay.pillDangerText;
              const statusBg    = status === 'Active' ? clay.pillActiveBg : (status === 'In Maintenance' || isSharePointOnly) ? clay.pillWarnBg : clay.pillDangerBg;
              const statusShadow = status === 'Active' ? clay.pillActiveShadow : (status === 'In Maintenance' || isSharePointOnly) ? clay.pillWarnShadow : clay.pillDangerShadow;
              const isProvisioning = folderProvisioningVesselId === vessel.id;
              const imgSrc = getVesselImageForId(vessel.id);

              return (
                <div
                  key={vessel.id}
                  className="vessel-card"
                  onClick={() => host.setState({ selectedVessel: isSelected ? null : vessel })}
                  style={{
                    boxShadow: isSelected
                      ? `0 0 0 3px ${clay.accent}, var(--vdms-shadow, ${clay.shadowRaisedHover})`
                      : 'var(--vdms-shadow, 0 24px 60px rgba(20,80,130,0.18))',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {!VESSEL_CARD_SHOW_IMAGE ? (
                    /* No ship image: initials tile + name / IMO on the left, status on the right.
                       Same overall height as the image banner it replaces. */
                    <div className="vdms-vcard__head">
                      <div className="vdms-vcard__id">
                        <span aria-hidden="true" className="vdms-vcard__avatar" style={{
                          background: isSelected ? clay.accent : (clay.accentSoft || 'var(--clay-accent-soft, #dceef2)'), color: isSelected ? DMS_ON_ACCENT : clay.accent,
                        }}>
                          {isSelected
                            ? <Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i44" />
                            : (vessel.name || '').replace(/^(mv|m\/v|m\.v\.|mt|m\/t|m\.t\.)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 1).map(w => w[0]).join('').toUpperCase() || '?'}
                        </span>
                        <div className="vdms-vcard__text">
                          <p className="vdms-vcard__name" style={{ color: clay.text }} title={vessel.name}>
                            {vessel.name}
                          </p>
                          {vessel.vessel_type && (
                            <p className="vdms-vcard__type">
                              {vessel.vessel_type}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="vdms-vcard__status" style={{ background: statusBg, color: statusText, boxShadow: statusShadow }}>
                        {status}
                      </span>
                    </div>
                  ) : (
                  <>
                  {/* Card image header — professional tone-on-tone banner
                      generated in vesselImagePool.ts (deep gradient + faint
                      engraved texture + a minimal type glyph watermark), no
                      cartoon illustration overlay. */}
                  <div className="vessels-page-i212" style={{ height: COMPACT_VESSEL_CARD ? 60 : 96, background: '#101826' }}>
                    <img
                      className="vessel-card-image"
                      src={resolveImgUrl(imgSrc)}
                      alt={vessel.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div className="vessels-page-i213" />
                    {/* Status badge */}
                    <span className="vessels-page-i214" style={{ top: COMPACT_VESSEL_CARD ? 8 : 12, right: COMPACT_VESSEL_CARD ? 8 : 12, background: statusBg, color: statusText, padding: COMPACT_VESSEL_CARD ? '1px 9px' : '3px 12px', fontSize: COMPACT_VESSEL_CARD ? 11 : 12, boxShadow: statusShadow }}>
                      {status}
                    </span>
                    {/* Selection check */}
                    {isSelected && (
                      <span className="vessels-page-i215" style={{ background: clay.accentGradient, color: DMS_ON_ACCENT, width: 26, boxShadow: clay.shadowIcon }}><Icon iconName="CheckMark" aria-hidden="true" className="vessels-page-i44" /></span>
                    )}
                    {/* Vessel name + type, set on a legibility scrim */}
                    <div className="vessels-page-i216" style={{ padding: COMPACT_VESSEL_CARD ? '10px 12px 8px' : '20px 16px 12px' }}>
                      <p className="vessels-page-i217" style={{ fontFamily: vdmsFont.display, color: DMS_ON_ACCENT }}>
                        {vessel.name}
                      </p>
                      {vessel.vessel_type && (
                        <p className="vessels-page-i218" style={{ fontFamily: vdmsFont.mono }}>
                          {vessel.vessel_type}
                        </p>
                      )}
                    </div>
                  </div>

                  </>
                  )}

                  {/* Card body */}
                  <div className="vdms-vcard__body">
                    {/* The Vessels page is for viewing documents: every card —
                        registered or "Found in SharePoint" — shows the vessel's
                        documents (Drawings / Manuals / To Be Classified, last
                        update) instead of ship particulars, which stay
                        editable in the Edit Vessel form. */}
                    <VesselDocumentPanel
                      host={host}
                      vesselName={vessel.name}
                      siteKey={String(host.state.vesselSiteFilter || 'all')}
                      compact={COMPACT_VESSEL_CARD}
                    />


                    {/* Action buttons */}
                    <div className="vdms-vcard__actions">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void openVesselDocuments(vessel);
                        }}
                        title={`Open ${vessel.name}'s folder in Documents`}
                        style={{ ...dmsBtn('primary'), flex: 1, borderRadius: COMPACT_VESSEL_CARD ? 10 : 14, ...(COMPACT_VESSEL_CARD ? { height: 34, fontSize: 13, fontWeight: 700 } : null) }}
                      >
<Icon iconName="Page" aria-hidden="true" className="vessels-page-i119" /> View Documents
                      </button>
                      <a
                        href={getSpoVesselFolderUrl(host, vessel)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="Open in SharePoint"
                        style={{ ...dmsBtn('secondary'), width: COMPACT_VESSEL_CARD ? 34 : 36, padding: 0, borderRadius: COMPACT_VESSEL_CARD ? 10 : 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(COMPACT_VESSEL_CARD ? { height: 34, fontSize: 14 } : null) }}
                      >
                        ↗
                      </a>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Normal Folders Section ── */}
        {renderNormalFoldersSection(host)}
            </>
          )}
        </VesselCardsGridWrapper>

        {/* ── Dismiss Confirm Dialog ── */}
        {renderDismissConfirmDialog(host)}

        {/* ── Provision Dialog ── */}
        {renderProvisionDialog(host)}

        {/* ── Vessel Field Save Confirm Dialog ── */}
        {renderVesselFieldConfirmDialog(host)}

        {/* Modals */}
        {modal === 'create' && host._renderVesselForm('create')}
        {modal === 'edit' && host._renderVesselForm('edit')}
        {host.state.vesselActionPicker && renderVesselActionPicker(host)}
        {modal === 'delete' && host._renderDeleteModal()}
      </div>
    );
}
