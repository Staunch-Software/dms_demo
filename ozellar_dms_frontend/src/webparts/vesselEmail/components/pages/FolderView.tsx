import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { renderClassifyDialog } from './VesselsPage';
import { MAIN_FOLDERS, folderNamesByMainFolder, subfolderNamesByFolder } from '../vesselFolderTemplate';
import { extractFilesFromDataTransfer } from '../BulkUploadModal';
import { resolveDetectedVesselForFile } from '../constants';
import { clay } from '../clayTheme';
import { Icon } from '@fluentui/react/lib/Icon';

export type MainFolderKey =
  | 'Technical & Crewing'
  | 'Commercial & Chartering'
  | 'Insurance'
  | 'Kaizen - Knowledge Bank'
  | 'Knowledge Bank';

export const VESSEL_MAIN_FOLDERS: Array<{ key: MainFolderKey; emoji: React.ReactNode; color: string; bg: string }> = [
  { key: 'Technical & Crewing',      emoji: <Icon iconName="Settings" aria-hidden="true" className="folder-view-i1" />, color: '#dc2626', bg: '#fee2e2' },
  { key: 'Commercial & Chartering',  emoji: <Icon iconName="Suitcase" aria-hidden="true" className="folder-view-i1" />, color: '#16a34a', bg: '#dcfce7' },
  { key: 'Insurance',                emoji: <Icon iconName="Shield" aria-hidden="true" className="folder-view-i1" />, color: '#d97706', bg: '#fef3c7' },
];

export const DEFAULT_VESSEL_MAINS = folderNamesByMainFolder();
export const SUBFOLDERS_MAP = subfolderNamesByFolder();

// ── File table used in both subfolder and leaf views ──────────────────────────
function FileTable({ files, onDelete, selectedIds, onToggleSelect, host, vesselName, sharePointPath }: {
  files: Array<{ name: string; size: string; date: string; pending?: boolean; uploading?: boolean; id?: string }>;
  onDelete?: (file: { id: string; name: string }) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  host?: VesselEmail;
  vesselName?: string | null;
  sharePointPath?: string;
}): React.ReactElement {
  return (
    <div className="folder-view-i2" style={{ background: clay.surface, borderRadius: clay.radiusCard, border: `1px solid ${clay.accentSoft}` }}>
      <table className="folder-view-i3" style={{ width: '100%' }}>
        <thead>
          <tr className="folder-view-i4" style={{ background: clay.surfaceRaised, borderBottom: `1px solid ${clay.accentSoft}`, color: clay.textMuted }}>
            {onToggleSelect && <th className="folder-view-i5"></th>}
            <th className="folder-view-i6">FILE NAME</th>
            <th className="folder-view-i6">SIZE</th>
            <th className="folder-view-i6">DATE UPLOADED</th>
            <th className="folder-view-i7">ACTION</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, idx) => {
            const fileId = (file as any).id || file.name;
            const isSelected = selectedIds?.has(fileId) ?? false;
            return (
              <tr key={file.name + idx} style={{ borderBottom: `1px solid ${clay.accentSoft}` }}>
                {onToggleSelect && (
                  <td className="folder-view-i8">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(fileId)}
                      className="folder-view-i9" style={{ width: 16 }}
                    />
                  </td>
                )}
                <td className="folder-view-i10" style={{ color: clay.text }}>
                  <span className="folder-view-i11">{file.uploading ? <Icon iconName="Sync" aria-hidden="true" /> : (file.pending ? <Icon iconName="Clock" aria-hidden="true" /> : <Icon iconName="Page" aria-hidden="true" />)}</span>
                  <span>{file.name}</span>
                  {file.uploading && <span className="folder-view-i12" style={{ color: '#0369a1', background: '#e0f2fe' }}>Uploading...</span>}
                  {file.pending && <span className="folder-view-i12" style={{ color: '#d97706', background: '#fef3c7' }}>Pending Approval</span>}
                  {(() => {
                    const detectedVessel = resolveDetectedVesselForFile(file, host, vesselName);
                    const isUnidentified = (host?.state?.ocrUnidentifiedFiles || []).some(
                      n => (n || '').trim().toLowerCase() === file.name.trim().toLowerCase()
                    );

                    if (!host) return null;

                    if (detectedVessel && !isUnidentified) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            host._openVesselSuggestions([new File([], file.name)], detectedVessel);
                          }}
                          title={`View OCR Vessel Suggestion: ${detectedVessel}`}
                          className="folder-view-i13" style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 6, color: '#0284c7' }}
                        >
                          <Icon iconName="Robot" aria-hidden="true" className="folder-view-i14" /> {detectedVessel}
                        </button>
                      );
                    } else {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            host._openVesselSuggestions([new File([], file.name)], vesselName || '');
                          }}
                          title="Vessel name not detected by OCR — click to assign vessel"
                          className="folder-view-i15" style={{ background: '#fff7ed', borderRadius: 6, color: '#c2410c' }}
                        >
                          <Icon iconName="Warning" aria-hidden="true" className="folder-view-i14" /> Vessel: Not detected
                        </button>
                      );
                    }
                  })()}
                </td>
                <td className="folder-view-i16" style={{ color: clay.textMuted }}>{file.size}</td>
                <td className="folder-view-i16" style={{ color: clay.textMuted }}>{file.date}</td>
                <td className="folder-view-i17">
                  <div className="folder-view-i18">
                    <button className="folder-view-i19" style={{ background: 'var(--vdms-surface)', borderRadius: 6, color: '#0078d4' }}>
                      View / Download
                    </button>
                    {/* OCR Re-classify button for real (non-pending) files */}
                    {host && !file.pending && !file.uploading && fileId && !fileId.startsWith('file_') && !/^\d+$/.test(fileId) && (
                      <button
                        type="button"
                        title={`Run OCR & Re-classify "${file.name}" into correct folder`}
                        onClick={() => {
                          host._goToView('templates');
                          setTimeout(() => {
                            host.setState({ ocrPendingItemId: fileId, ocrPendingFilename: file.name });
                          }, 100);
                        }}
                        className="folder-view-i20" style={{ background: '#f0fdf4', borderRadius: 6, color: '#15803d' }}
                      >
                        <Icon iconName="Search" aria-hidden="true" className="folder-view-i21" /> OCR
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete({ id: fileId, name: file.name })}
                        className="folder-view-i22" style={{ background: '#fff5f5', borderRadius: 6, color: '#ef4444' }}
                        title="Delete file"
                      >
                        <Icon iconName="Delete" aria-hidden="true" className="folder-view-i21" /> Delete
                      </button>
                    )}
                    {host && sharePointPath && (
                      <button
                        type="button"
                        onClick={() => void host._openSharePointFolder({ subFolderPath: sharePointPath } as any)}
                        title="Open this folder in SharePoint"
                        aria-label={`Open ${sharePointPath} in SharePoint`}
                        className="folder-view-i23" style={{ width: 28, borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}
                      >↗</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Folder card used at every level ──────────────────────────────────────────
function FolderCard({ name, sub, emoji, bg, onClick }: {
  name: string; sub: string; emoji: React.ReactNode; bg: string; onClick: () => void;
}): React.ReactElement {
  // Phase 6 "Ocean Clay" — puffy card: soft dual-tone shadow + generous
  // radius on the teal-tinted surface, while keeping each category's own
  // icon color (passed in as `bg`) so departments stay visually distinct.
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="folder-view-i24" style={{ background: clay.surface, borderRadius: clay.radiusTile, boxShadow: hovered ? clay.shadowRaisedHover : clay.shadowRaised }}
    >
      <div className="folder-view-i25" style={{ borderRadius: clay.radiusIcon, background: bg, boxShadow: clay.shadowIcon }}>{emoji}</div>
      <div className="folder-view-i26" style={{ minWidth: 0 }}>
        <div className="folder-view-i27" style={{ color: clay.text }}>{name}</div>
        <div className="folder-view-i28" style={{ color: clay.textMuted }}>{sub}</div>
      </div>
      <span className="folder-view-i29" style={{ color: clay.accent }}>›</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function renderFolderView(
  host: VesselEmail,
  ctx: {
    stackLevel: number;
    atVesselsRoot: boolean;
    atSpecificVessels: boolean;
    atVesselMainFolderSelect: boolean;
    vesselNodeInStack: { id: string; name: string } | null;
    currentVesselNameFromStack: string | null;
    currentFolderNode: { id: string; name: string } | null;
    currentFolderName: string | null;
    vesselStackIdx: number;
    subfolderNames: string[];
    allCurrentFolderFiles: Array<{ name: string; size: string; date: string; pending?: boolean; id?: string }>;
    displayVessels: Array<{ id: string; name: string }>;
  }
): React.ReactElement {
  const {
    stackLevel, atVesselsRoot, atSpecificVessels, atVesselMainFolderSelect,
    vesselNodeInStack, currentVesselNameFromStack, currentFolderNode, currentFolderName,
    vesselStackIdx, subfolderNames, displayVessels,
  } = ctx;

  // Archived files (Archive module, point #6) stay out of the working
  // Documents/Folder view — they're only browsable/restorable from the
  // Archive page — without being deleted or removed from ctx upstream.
  const archivedFileIds = host.state.archivedFileIds;
  const allCurrentFolderFiles = archivedFileIds && archivedFileIds.size > 0
    ? ctx.allCurrentFolderFiles.filter(f => !f.id || !archivedFileIds.has(f.id))
    : ctx.allCurrentFolderFiles;

  const handleFileDelete = (file: { id: string; name: string }): void => {
    host._openFileDeleteDialog([{
      id: file.id,
      name: file.name,
      folderId: currentFolderNode?.id || '',
      folderPath: currentFolderNode?.name || '',
    }]);
  };

  const handleToggleSelect = (id: string): void => {
    host.setState(prev => {
      const next = new Set(prev.folderViewSelectedFiles);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { folderViewSelectedFiles: next };
    });
  };

  const { folderPathStack, docMainFolder, vessels, folderViewSelectedFiles, textFilter, vesselFilter, docGroupFilter, catFilter } = host.state;

  const resolveTargetUploadInfo = (): {
    currentVessel: string;
    subFolderPath: string;
    resolvedFolderId: string;
    targetSiteId?: string;
    targetDriveId?: string;
  } => {
    const atSitesRoot = stackLevel >= 1 && (
      folderPathStack[0]?.id === 'sites_root' ||
      folderPathStack[0]?.name === 'SharePoint Sites' ||
      folderPathStack[0]?.name === 'Sites Documents'
    );
    const atKaizenRoot = stackLevel >= 1 && (folderPathStack[0]?.id === 'kaizen_root' || folderPathStack[0]?.name === 'Kaizen - Knowledge Bank');
    const atCommonShips = folderPathStack[1]?.id === 'common' || folderPathStack[1]?.name === 'Common for all ships' || folderPathStack[1]?.name === 'Common for all vessels';
    const topFolderId = currentFolderNode && !/^(sf_|category_|common|vessels_root|specific_vessels|kaizen_root|sites_root|site:|drive:)/.test(currentFolderNode.id) ? currentFolderNode.id : '';
    let currentVessel: string;
    let subFolderPath: string;
    let fallbackPath: string;
    let targetSiteId: string | undefined = undefined;
    let targetDriveId: string | undefined = undefined;

    if (atSitesRoot) {
      const siteNode = folderPathStack[1];
      const matchedSite = (host.state.documentSites || []).find(s =>
        (siteNode?.id && s.site_id === siteNode.id.replace(/^site:/, '')) ||
        (siteNode?.name && s.sp_site_name?.toLowerCase() === siteNode.name.toLowerCase()) ||
        (siteNode?.name && s.site_key?.toLowerCase() === siteNode.name.toLowerCase())
      );
      targetSiteId = matchedSite?.site_id || (siteNode?.id || '').replace(/^site:/, '') || host.props.siteId;
      const driveNode = folderPathStack[2];
      targetDriveId = (driveNode?.id || '').replace(/^drive:/, '') || matchedSite?.drive_id || host.props.driveId;

      const driveSegments = folderPathStack.slice(3).map(n => n.name);
      subFolderPath = driveSegments.join(' > ');
      fallbackPath = driveSegments.join('/');

      const matchedV = (vessels || []).find(v =>
        driveSegments.some(seg => seg.toLowerCase() === v.name.toLowerCase())
      );
      currentVessel = matchedV ? matchedV.name : (driveSegments[1] || driveSegments[0] || '');
      const isDriveRoot = stackLevel <= 3;
      const resolvedFolderId = isDriveRoot ? 'root' : (topFolderId || fallbackPath || 'root');

      return { currentVessel, subFolderPath, resolvedFolderId, targetSiteId, targetDriveId };
    } else if (atKaizenRoot) {
      currentVessel = 'Kaizen - Knowledge Bank';
      const kaizenFolders = folderPathStack.filter(n => n.id !== 'kaizen_root' && n.name !== 'Kaizen - Knowledge Bank').map(n => n.name);
      subFolderPath = ['Kaizen - Knowledge Bank', ...kaizenFolders].join(' > ');
      fallbackPath = ['Kaizen - Knowledge Bank', ...kaizenFolders].join('/');
    } else if (atCommonShips) {
      currentVessel = 'Common for all vessels';
      const commonFolders = folderPathStack.slice(2).map(n => n.name);
      subFolderPath = [docMainFolder || 'Technical & Crewing', 'Common for all ships', ...commonFolders].join(' > ');
      fallbackPath = [docMainFolder || 'Technical & Crewing', 'Common for all ships', ...commonFolders].join('/');
    } else if (vesselStackIdx !== -1) {
      currentVessel = currentVesselNameFromStack || '';
      const afterVesselItems = folderPathStack.slice(vesselStackIdx + 1).map(n => n.name);
      subFolderPath = [docMainFolder || 'Technical & Crewing', currentVessel, ...afterVesselItems].filter(Boolean).join(' > ');
      fallbackPath = [docMainFolder || 'Technical & Crewing', currentVessel, ...afterVesselItems].filter(Boolean).join('/');
    } else {
      currentVessel = (vesselFilter !== 'all' ? vesselFilter : '') || currentVesselNameFromStack || '';
      subFolderPath = currentFolderNode && currentFolderNode.name !== docMainFolder && currentFolderNode.name !== 'Documents'
        ? `${docMainFolder || ''}${currentVessel ? ` > ${currentVessel}` : ''} > ${currentFolderNode.name}`
        : `${docMainFolder || ''}${currentVessel ? ` > ${currentVessel}` : ''}`;
      fallbackPath = [docMainFolder || 'Technical & Crewing', ...(currentVessel ? [currentVessel] : []), ...(currentFolderNode && currentFolderNode.name !== docMainFolder && currentFolderNode.name !== 'Documents' ? [currentFolderNode.name] : [])].join('/');
    }

    const liveId = host._getLiveSharePointFolderId(subFolderPath);
    const matchingRow = host.state.rows.find(r =>
      r.vesselName === currentVessel &&
      r.uploadFolderId &&
      !r.uploadFolderId.includes('/') &&
      (docMainFolder ? r.group.toLowerCase().includes(docMainFolder.toLowerCase().split(' ')[0]) : true)
    );
    const resolvedFolderId = topFolderId || liveId || (matchingRow?.uploadFolderId) || fallbackPath;
    return { currentVessel, subFolderPath, resolvedFolderId, targetSiteId, targetDriveId };
  };

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) return;
    const extracted = await extractFilesFromDataTransfer(e.dataTransfer);
    if (!extracted.length) return;
    const { currentVessel, subFolderPath, resolvedFolderId, targetSiteId, targetDriveId } = resolveTargetUploadInfo();
    host._openBulkUpload(extracted, resolvedFolderId, subFolderPath, currentVessel, currentFolderNode, targetSiteId, targetDriveId);
  };
  const currentSharePointPath = resolveTargetUploadInfo().subFolderPath;
  const templateSubfolderSet = new Set((subfolderNames || []).map(name => (name || '').trim().toLowerCase()));

  const dynamicSubfolderSet = new Set<string>();
  const pathLower = (folderPathStack || []).map(n => (n.name || '').trim().toLowerCase()).filter(Boolean);
  const vesselInPathLower = pathLower.find(n => n !== 'vessels' && n !== 'specific vessels' && n !== 'common for all ships' && n !== 'kaizen - knowledge bank');
  const mainNorm = (docMainFolder || '').trim().toLowerCase();
  const currentNorm = (currentFolderName || currentFolderNode?.name || '').trim().toLowerCase();

  const forbiddenContainers = new Set([
    'vessels', 'specific vessels', 'documents', 'shared documents', 'root',
    'common for all ships', 'common for all vessels', 'common',
    'common (not ship specific)', 'common agreements (not ship specific)',
    'kaizen', 'kaizen - knowledge bank', 'knowledge bank', 'technical & crewing',
    'commercial & chartering', 'insurance', 'empty list'
  ]);

  (host.state.rows || []).forEach(r => {
    const candidate = (r.subCategory || r.category || '').trim();
    if (!candidate) return;
    if (candidate.includes('||')) return;
    if (/^01[A-Za-z0-9]{15,}$/.test(candidate) || /^[A-Fa-f0-9]{24,}$/.test(candidate)) return;
    if (forbiddenContainers.has(candidate.toLowerCase())) return;
    if (vessels.some(v => (v.name || '').trim().toLowerCase() === candidate.toLowerCase())) return;

    if (!r.uploadFolderId) return;
    if (r.uploadFolderId.includes('/')) return;
    if (host._appDeletedItemIds.has(r.uploadFolderId)) return;
    if (mainNorm && (r.group || '').trim().toLowerCase() !== mainNorm) return;

    const vesselNorm = (r.vesselName || '').trim().toLowerCase();
    const rowCatNorm = (r.category || '').trim().toLowerCase();
    if (vesselInPathLower && vesselNorm && vesselNorm !== vesselInPathLower) return;
    if (currentNorm && rowCatNorm && rowCatNorm !== currentNorm) return;

    dynamicSubfolderSet.add(candidate);
  });

  const uploadedOnlySubfolderNames = Array.from(dynamicSubfolderSet)
    .filter(name => !templateSubfolderSet.has((name || '').trim().toLowerCase()));

  // ── Level 0: Root — Main Departments + Kaizen ────────────────────────────
  if (stackLevel === 0) {
    const mainAnomalies = (host.state.folderAnomalies || []).filter(a => a.anomaly_type === 'main_folder_unmatched');
    const mainFolderAnomalies = mainAnomalies.filter(a => a.item_type === 'folder');

    const allMainFolders = [
      ...VESSEL_MAIN_FOLDERS,
      { key: 'Kaizen - Knowledge Bank' as MainFolderKey, emoji: <Icon iconName="Library" aria-hidden="true" className="folder-view-i1" />, color: '#7c3aed', bg: '#ede9fe' },
    ];

    const visibleMainFolders = allMainFolders.filter(item => {
      if (docGroupFilter && docGroupFilter !== 'all') {
        const itemNorm = item.key.toLowerCase();
        const filterNorm = docGroupFilter.toLowerCase();
        if (!itemNorm.includes(filterNorm) && !filterNorm.includes(itemNorm)) return false;
      }
      if (textFilter) {
        const q = textFilter.toLowerCase();
        if (!item.key.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="folder-view-i30"
      >
        <div className="folder-view-i31">
          {visibleMainFolders.map(item => (
            <FolderCard
              key={item.key}
              name={item.key}
              sub={item.key === 'Kaizen - Knowledge Bank' ? 'Knowledge base' : `${vessels.length} vessels`}
              emoji={item.emoji}
              bg={item.bg}
              onClick={() => {
                if (item.key === 'Kaizen - Knowledge Bank') {
                  host._pushFolderNav([{ id: 'kaizen_root', name: 'Kaizen - Knowledge Bank' }], 'Kaizen - Knowledge Bank');
                  host.setState({ vesselFilter: 'all', docScopeType: 'kaizen' });
                } else {
                  host._pushFolderNav([{ id: item.key, name: item.key }], item.key);
                  host.setState({ vesselFilter: 'all', docScopeType: 'vessels' });
                }
              }}
            />
          ))}
        </div>

        {/* Uploaded Documents Table at Root Level */}
        {allCurrentFolderFiles && allCurrentFolderFiles.length > 0 && (
          <div className="folder-view-i32">
            <div className="folder-view-i33">
              <div className="folder-view-i34" style={{ color: clay.text }}>
                <Icon iconName="Page" aria-hidden="true" className="folder-view-i35" /> Uploaded Documents ({allCurrentFolderFiles.length})
              </div>
            </div>
            <FileTable
              files={allCurrentFolderFiles}
              onDelete={handleFileDelete}
              selectedIds={folderViewSelectedFiles}
              onToggleSelect={handleToggleSelect}
              host={host}
              vesselName={currentVesselNameFromStack}
              sharePointPath={currentSharePointPath}
            />
          </div>
        )}

        {/* Anomaly panels */}
        {mainAnomalies.length > 0 && (
          <div className="folder-view-i36">
            {mainFolderAnomalies.length > 0 && (
              <div className="folder-view-i37">
                <h4 className="folder-view-i38">
                  <Icon iconName="Warning" aria-hidden="true" className="folder-view-i39" /> Folders Created Outside Standard Main Folders ({mainFolderAnomalies.length})
                </h4>
                <p className="folder-view-i40">
                  These folders were created directly in SharePoint Online at the main folder root level outside standard category structures.
                </p>
                <div className="folder-view-i41">
                  {mainFolderAnomalies.map(item => (
                    <div key={item.id} className="folder-view-i42" style={{ background: 'var(--vdms-surface)', borderRadius: 10 }}>
                      <div className="folder-view-i43" style={{ minWidth: 200 }}>
                        <Icon iconName="FabricFolder" aria-hidden="true" className="folder-view-i44" />
                        <div>
                          <div className="folder-view-i45">{item.name}</div>
                          <div className="folder-view-i46" style={{ fontFamily: 'monospace' }}>{item.spo_path}</div>
                        </div>
                      </div>
                      <div className="folder-view-i47">
                        <button onClick={() => host.setState({ spoClassifyDialog: { anomaly: item, provisioning: false, done: false, error: null } })}
                          className="folder-view-i48" style={{ borderRadius: 6 }}>
                          <Icon iconName="Search" aria-hidden="true" className="folder-view-i49" /> Classify
                        </button>
                        <button onClick={() => host._dismissAnomaly(item.id)}
                          className="folder-view-i50" style={{ background: 'var(--vdms-surface)', color: '#78716c', borderRadius: 6 }}>
                          <Icon iconName="Cancel" aria-hidden="true" className="folder-view-i21" /> Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    );
  }

  // ── Level 1: Inside Main Department — Vessels list + Common folder ──────
  const isInsideMainDepartment = stackLevel === 1 && folderPathStack[0]?.id !== 'kaizen_root';
  if (isInsideMainDepartment) {
    // Derive the correct common folder name for this department from the template
    const activeMfTemplate = MAIN_FOLDERS.find(mf => mf.name === docMainFolder);
    const commonFolderDisplayName = (activeMfTemplate as any)?.commonFolderName ?? 'Common for all ships';
    const filteredDisplayVessels = displayVessels.filter(v => {
      if (vesselFilter && vesselFilter !== 'all') {
        if (v.name.trim().toLowerCase() !== vesselFilter.trim().toLowerCase()) return false;
      }
      if (textFilter) {
        if (!v.name.toLowerCase().includes(textFilter.trim().toLowerCase())) return false;
      }
      return true;
    });

    return (
      <div className="folder-view-i31">
        {(!vesselFilter || vesselFilter === 'all') && (
          <FolderCard
            name={commonFolderDisplayName}
            sub={`Shared ${docMainFolder || ''} documents`}
            emoji={<Icon iconName="FabricFolder" aria-hidden="true" className="folder-view-i1" />}
            bg="#fef3c7"
            onClick={() => {
              host._pushFolderNav([...folderPathStack, { id: 'common', name: commonFolderDisplayName }], docMainFolder);
              host.setState({ vesselFilter: 'all', docScopeType: 'common' });
            }}
          />
        )}
        {filteredDisplayVessels.map(v => (
          <FolderCard
            key={v.id}
            name={v.name}
            sub="Vessel"
            emoji={<Icon iconName="Ferry" aria-hidden="true" className="folder-view-i1" />}
            bg="#e0f2fe"
            onClick={() => {
              host._pushFolderNav([...folderPathStack, { id: v.id, name: v.name }], docMainFolder);
              host.setState({ vesselFilter: v.name, docScopeType: 'vessels' });
              host._loadFilesForVessel(v.name).catch(() => undefined);
            }}
          />
        ))}
        {host.state.documentVesselCount < host.state.vessels.length && (
          <div
            onClick={() => {
              if (!host.state.documentVesselsLoadingMore) {
                void host._loadMoreDocumentVessels();
              }
            }}
            className="folder-view-i51" style={{ background: host.state.documentVesselsLoadingMore ? clay.surfaceRaised : clay.surface, borderRadius: clay.radiusTile, border: `2px dashed ${clay.accent}`, cursor: host.state.documentVesselsLoadingMore ? 'wait' : 'pointer', boxShadow: clay.shadowRaised }}
          >
            <div className="folder-view-i52" style={{ borderRadius: clay.radiusIcon, background: clay.accentGradient, boxShadow: clay.shadowIcon }}>
              {host.state.documentVesselsLoadingMore ? <Icon iconName="Sync" aria-hidden="true" /> : '+'}
            </div>
            <div className="folder-view-i26" style={{ minWidth: 0 }}>
              <div className="folder-view-i27" style={{ color: clay.accentDark }}>
                {host.state.documentVesselsLoadingMore ? 'Loading vessels...' : `More vessels (+${Math.min(8, host.state.vessels.length - host.state.documentVesselCount)})`}
              </div>
              <div className="folder-view-i28" style={{ color: clay.textMuted }}>
                {host.state.documentVesselsLoadingMore ? 'Please wait...' : `Load next batch (${host.state.documentVesselCount} of ${host.state.vessels.length} shown)`}
              </div>
            </div>
            <span className="folder-view-i53" style={{ color: clay.accentDark }}>›</span>
          </div>
        )}
      </div>
    );
  }

  // ── Subfolders level ───────────────────────────────────────────────────────
  if (subfolderNames.length > 0) {
    const isAtCategoryLevel =
      (folderPathStack[0]?.id === 'kaizen_root' && stackLevel === 1) ||
      (folderPathStack[1]?.id === 'common' && stackLevel === 2) ||
      (vesselNodeInStack && stackLevel === 2);

    const subAnomalies = (host.state.folderAnomalies || []).filter(a =>
      a.anomaly_type === 'subfolder_unmatched' &&
      (!currentVesselNameFromStack || a.vessel_name === currentVesselNameFromStack)
    );

    const activeSectionFilter = (host.state.docCategoryFilter && host.state.docCategoryFilter !== 'all')
      ? host.state.docCategoryFilter
      : (catFilter && catFilter !== 'all' ? catFilter : null);

    const visibleSubfolderNames = subfolderNames.filter(sf => {
      const sfNorm = sf.trim().toLowerCase();
      if (isAtCategoryLevel && activeSectionFilter) {
        if (sfNorm !== activeSectionFilter.trim().toLowerCase()) return false;
      }
      if (stackLevel === 3 && host.state.docGroupLevelFilter && host.state.docGroupLevelFilter !== 'all') {
        if (sfNorm !== host.state.docGroupLevelFilter.trim().toLowerCase()) return false;
      }
      if (stackLevel === 4 && host.state.docLeafCategoryFilter && host.state.docLeafCategoryFilter !== 'all') {
        if (sfNorm !== host.state.docLeafCategoryFilter.trim().toLowerCase()) return false;
      }
      if (stackLevel >= 5 && host.state.docSubCategoryFilter && host.state.docSubCategoryFilter !== 'all') {
        if (sfNorm !== host.state.docSubCategoryFilter.trim().toLowerCase()) return false;
      }
      if (textFilter) {
        if (!sf.toLowerCase().includes(textFilter.trim().toLowerCase())) return false;
      }
      return true;
    });

    return (
      <div className="folder-view-i36">
        <div className="folder-view-i54">
          {visibleSubfolderNames.map((sfName, idx) => (
            <FolderCard
              key={sfName + idx}
              name={sfName}
              sub={isAtCategoryLevel ? 'Document Section' : (stackLevel === 3 ? 'Category' : 'Sub-Category')}
              emoji={<Icon iconName="FabricFolder" aria-hidden="true" className="folder-view-i1" />}
              bg="#e0f2fe"
              onClick={() => {
                const vesselName = currentVesselNameFromStack || (folderPathStack.length > 0 ? folderPathStack[0].name : null);
                const stackNames = folderPathStack.map(n => n.name).filter(n => n !== 'Vessels' && n !== 'Specific Vessels');
                const fullBreadcrumbWithSf = [...stackNames, sfName].join(' > ');
                const candidateSubPath = vesselName ? `${vesselName} > ${docMainFolder || ''} > ${sfName}` : '';
                const liveFolderId = host._getLiveSharePointFolderId(fullBreadcrumbWithSf) ||
                  (candidateSubPath ? host._getLiveSharePointFolderId(candidateSubPath) : null);
                const matchingSubRow = vesselName ? host.state.rows.find(r =>
                  r.vesselName === vesselName &&
                  r.uploadFolderId &&
                  !r.uploadFolderId.includes('/') &&
                  (r.subCategory === sfName || r.category === sfName) &&
                  (docMainFolder ? r.group === docMainFolder : true) &&
                  (currentFolderNode && currentFolderNode.name !== vesselName
                    ? (r.category === currentFolderNode.name || r.group === currentFolderNode.name)
                    : true)
                ) : null;
                const realFolderId = liveFolderId || matchingSubRow?.uploadFolderId || fullBreadcrumbWithSf;
                host._pushFolderNav([...folderPathStack, { id: realFolderId, name: sfName }], docMainFolder);
                const subGroupKey = matchingSubRow?.groupKey || fullBreadcrumbWithSf;
                void host._refreshFolderFiles(realFolderId, subGroupKey, true).catch(() => undefined);
              }} />
          ))}
        </div>

        {allCurrentFolderFiles.length > 0 && (
        <div className="folder-view-i58">
            <FileTable
              files={allCurrentFolderFiles}
              onDelete={handleFileDelete}
              selectedIds={folderViewSelectedFiles}
              onToggleSelect={handleToggleSelect}
              host={host}
              sharePointPath={currentSharePointPath}
            />
          </div>
        )}

        {subAnomalies.length > 0 && (
          <div className="folder-view-i59" style={{ background: '#fff7ed' }}>
            <h4 className="folder-view-i60">
              <Icon iconName="Warning" aria-hidden="true" className="folder-view-i61" /> Other / Unclassified Items Inside Vessel Tree ({subAnomalies.length})
            </h4>
            <p className="folder-view-i62">
              These items were added inside the vessel folder in SharePoint but are not part of the standard template structure.
            </p>
            <div className="folder-view-i63">
              {subAnomalies.map(item => (
                <div key={item.id} className="folder-view-i64" style={{ background: 'var(--vdms-surface)', borderRadius: 8 }}>
                  <div className="folder-view-i65">
                    <Icon iconName={item.item_type === 'folder' ? 'FabricFolder' : 'Page'} aria-hidden="true" className="folder-view-i35" />
                    <div>
                      <span className="folder-view-i66">{item.name}</span>
                      <span className="folder-view-i67">Path: {item.spo_path}</span>
                    </div>
                  </div>
                  <button onClick={() => host._dismissAnomaly(item.id)}
                    className="folder-view-i68" style={{ background: 'var(--vdms-surface)', color: '#c2410c', borderRadius: 6 }}>
                    <Icon iconName="Cancel" aria-hidden="true" className="folder-view-i21" /> Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Leaf: files only ───────────────────────────────────────────────────────
  if (allCurrentFolderFiles.length > 0) {
    return (
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="folder-view-i32"
      >
        <FileTable
          files={allCurrentFolderFiles}
          onDelete={handleFileDelete}
          selectedIds={folderViewSelectedFiles}
          onToggleSelect={handleToggleSelect}
          host={host}
          vesselName={currentVesselNameFromStack}
          sharePointPath={currentSharePointPath}
        />
      </div>
    );
  }

  // ── Empty folder ───────────────────────────────────────────────────────────
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      className="folder-view-i69"
    >
      <div className="folder-view-i70" style={{ background: clay.surface, border: `2px dashed ${clay.accentSoft}`, borderRadius: clay.radiusCard, width: '100%', boxShadow: clay.shadowRaised }}>
        <div className="folder-view-i71" style={{ borderRadius: clay.radiusIcon, background: clay.iconBgGradient, boxShadow: clay.shadowIcon }}>
          <Icon iconName="Cloud" aria-hidden="true" className="folder-view-i72" />
        </div>
        <div>
          <h3 className="folder-view-i73" style={{ color: clay.text }}>This folder is empty</h3>
          <p className="folder-view-i74" style={{ color: clay.textMuted }}>
            Drag and drop files or entire folders here, or use the buttons below.
          </p>
        </div>

        <div className="folder-view-i75">
          <label className="folder-view-i76" style={{ background: '#0284c7', color: '#fff', borderRadius: 8 }}>
            <input
              type="file"
              multiple
              className="folder-view-i77"
              onChange={e => {
                const filesList = Array.from(e.target.files || []);
                if (filesList.length === 0) return;
                e.target.value = '';
                const { currentVessel, subFolderPath, resolvedFolderId, targetSiteId, targetDriveId } = resolveTargetUploadInfo();
                const bulkFiles = filesList.map(f => ({ file: f, relativePath: f.name }));
                host._openBulkUpload(bulkFiles, resolvedFolderId, subFolderPath, currentVessel, currentFolderNode, targetSiteId, targetDriveId);
              }}
            />
            <Icon iconName="Up" aria-hidden="true" className="folder-view-i57" /> Upload Files
          </label>

          <label className="folder-view-i76" style={{ background: '#0284c7', color: '#fff', borderRadius: 8 }}>
            <input
              type="file"
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                const filesList = Array.from(e.target.files || []);
                if (filesList.length === 0) return;
                e.target.value = '';
                const { currentVessel, subFolderPath, resolvedFolderId, targetSiteId, targetDriveId } = resolveTargetUploadInfo();
                const bulkFiles = filesList.map(f => ({
                  file: f,
                  relativePath: (f as any).webkitRelativePath || f.name,
                }));
                host._openBulkUpload(bulkFiles, resolvedFolderId, subFolderPath, currentVessel, currentFolderNode, targetSiteId, targetDriveId);
              }}
            />
            <Icon iconName="FabricFolder" aria-hidden="true" className="folder-view-i57" /> Upload Folder
          </label>
        </div>
      </div>
    </div>
  );
}
