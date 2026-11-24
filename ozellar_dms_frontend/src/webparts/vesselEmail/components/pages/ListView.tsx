import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import type { FlatRow, GroupedRow } from '../types/rows';
import type { ApprovalItem } from '../types/ui';
import { Icon } from '@fluentui/react/lib/Icon';
import { isMobileWidth, isTabletWidth } from '../responsive';
import { resolveDetectedVesselForFile } from '../constants';
import { clay } from '../clayTheme';

const PAGE_ROWS = 10;

export function renderListView(
  host: VesselEmail,
  filtered: FlatRow[],
  groupedList: GroupedRow[],
): React.ReactElement {
  const { docListPage, docListSort, docUploadRowKey, docUploadBusy, textFilter, vesselFilter, docGroupFilter, catFilter, listViewSelectedFiles, documentFilesLoading, vesselLoadingName, documentVesselsLoadingMore, archivedFileIds } = host.state;
  const viewportWidth = host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isMobile = isMobileWidth(viewportWidth);
  const isTablet = isTabletWidth(viewportWidth);

  // Archived files (Archive module, point #6) are moved out of the working
  // Documents view — they're only browsable/restorable from the Archive
  // page — without being deleted, so they still exist in the group's file
  // list; just hide the archived ones here rather than in every caller.
  const groupedListVisible: GroupedRow[] = archivedFileIds && archivedFileIds.size > 0
    ? groupedList.map(row => ({ ...row, files: row.files.filter(f => !archivedFileIds.has(f.id)) }))
    : groupedList;

   let sorted = [...groupedListVisible];
  if (docListSort === 'name_az') {
    sorted.sort((a, b) => a.category.localeCompare(b.category));
  } else {
    sorted = sorted
      .map((row, i) => ({
        row, i,
        ts: row.files.reduce((max, f) => Math.max(max, (f as any).uploadedAt || 0), 0),
      }))
      .sort((a, b) => (b.ts - a.ts) || (a.i - b.i))
      .map(x => x.row);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_ROWS));
  const safePage   = Math.min(docListPage, totalPages - 1);
  const pageRows   = sorted.slice(safePage * PAGE_ROWS, (safePage + 1) * PAGE_ROWS);

  return (
    <div className="list-view-i1">
      <div className="list-view-i2" style={{ background: clay.surface, borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised, width: '100%' }}>
        {isMobile ? (
          <div className="list-view-i3">
            {pageRows.map((r, idx) => {
              const globalIdx = safePage * PAGE_ROWS + idx + 1;
              const isUploading = docUploadRowKey === r.groupKey && docUploadBusy;
              const hasFiles = r.files.length > 0;
              const rowSelectedCount = r.files.filter(f => listViewSelectedFiles.has(f.id)).length;
              return (
                <div key={`${r.groupKey}-${idx}`} className="list-view-i4" style={{ borderRadius: clay.radiusTile, background: clay.bg }}>
                  <div className="list-view-i5" style={{ color: '#94a3b8' }}>#{globalIdx}</div>
                  <div className="list-view-i6" style={{ color: '#334155' }}><strong>{r.group}</strong> • {r.category} • {r.subCategory || r.category}</div>
                  <div className="list-view-i7" style={{ color: '#64748b' }}>{r.subFolderPath}</div>
                  <div className="list-view-i8">
                    {hasFiles ? r.files.map(file => (
                      <label key={file.name} className="list-view-i9">
                        <input
                          type="checkbox"
                          checked={listViewSelectedFiles.has(file.id)}
                          onChange={() => {
                            host.setState(prev => {
                              const next = new Set(prev.listViewSelectedFiles);
                              if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                              return { listViewSelectedFiles: next };
                            });
                          }}
                          className="list-view-i10" style={{ width: 16 }}
                        />
                        <span
                          onClick={() => {
                            if ((file as any).uploading) {
                              alert(`File "${file.name}" is still uploading. Please wait a moment.`);
                            } else if (file.id && !file.id.startsWith('file_')) {
                              void host._openDocumentFile(file.id, file.name);
                            } else {
                              alert(`File "${file.name}" is pending — it will be available after approval.`);
                            }
                          }}
                          className="list-view-i11" style={{ color: '#0369a1' }}
                        >
                          {file.name}{(file as any).uploading ? <> <Icon iconName="Sync" aria-hidden="true" className="list-view-i12" /></> : ''}
                        </span>
                      </label>
                    )) : <span className="list-view-i13" style={{ color: '#94a3b8' }}>No files</span>}
                  </div>
                  <div className="list-view-i14">
                    <label className="list-view-i15" style={{ background: isUploading ? '#f1f5f9' : '#fff', border: '1px solid #cbd5e1', borderRadius: 8, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                      <input type="file" multiple className="list-view-i16" disabled={isUploading} onChange={e => {
                        const filesList = Array.from(e.target.files || []);
                        if (filesList.length === 0) return;
                        e.target.value = '';
                        const bulkFiles = filesList.map(f => ({ file: f, relativePath: f.name }));
                        host._openBulkUpload(bulkFiles, r.uploadFolderId, r.subFolderPath, r.vesselName);
                      }} />
                      Upload
                    </label>
                    <button
                      type="button"
                      disabled={rowSelectedCount === 0}
                      onClick={() => {
                        if (rowSelectedCount === 0) return;
                        const filesToArchive = r.files
                          .filter(f => listViewSelectedFiles.has(f.id))
                          .map(f => ({ id: f.id, name: f.name, folderPath: r.subFolderPath, department: r.group, vesselName: r.vesselName }));
                        host.setState({ listViewSelectedFiles: new Set() });
                        void host._archiveSelectedDocuments(filesToArchive);
                      }}
                      title={rowSelectedCount > 0 ? `Archive ${rowSelectedCount} selected file(s)` : 'Select files to archive'}
                      className="list-view-i17" style={{ background: rowSelectedCount > 0 ? '#faf5ff' : '#f8fafc', borderRadius: 8, cursor: rowSelectedCount > 0 ? 'pointer' : 'not-allowed', color: rowSelectedCount > 0 ? '#7e22ce' : '#cbd5e1' }}
                    >
                      <Icon iconName="Package" aria-hidden="true" className="list-view-i12" /> Archive {rowSelectedCount > 0 ? `(${rowSelectedCount})` : ''}
                    </button>
                    <button
                      type="button"
                      disabled={rowSelectedCount === 0}
                      onClick={() => {
                        if (rowSelectedCount === 0) return;
                        const filesToDelete = r.files
                          .filter(f => listViewSelectedFiles.has(f.id))
                          .map(f => ({ id: f.id, name: f.name, folderId: r.uploadFolderId, folderPath: r.subFolderPath }));
                        host.setState({ listViewSelectedFiles: new Set() });
                        host._openFileDeleteDialog(filesToDelete);
                      }}
                      className="list-view-i18" style={{ background: rowSelectedCount > 0 ? '#fff5f5' : '#f8fafc', borderRadius: 8, cursor: rowSelectedCount > 0 ? 'pointer' : 'not-allowed', color: rowSelectedCount > 0 ? '#ef4444' : '#cbd5e1' }}
                    >
                      Delete {rowSelectedCount > 0 ? `(${rowSelectedCount})` : ''}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void host._openSharePointFolder(r)}
                    className="list-view-i19" style={{ width: '100%', background: '#eff6ff', borderRadius: 8, color: '#1d4ed8' }}
                  >
                    Open Folder in SharePoint
                  </button>
                </div>
              );
            })}
            {pageRows.length === 0 && (
              <div className="list-view-i20" style={{ color: '#94a3b8' }}>
                No documents found.
              </div>
            )}
          </div>
        ) : (
        <table className="list-view-i21" style={{ width: '100%', minWidth: isTablet ? 980 : 850 }}>
          <thead>
            <tr className="list-view-i22" style={{ background: clay.bg, borderBottom: `2px solid ${clay.accentSoft}`, color: clay.textMuted }}>
              <th className="list-view-i23">SR.</th>
              <th className="list-view-i24">MAIN FOLDER</th>
              <th className="list-view-i24">DOCUMENT SECTION</th>
              <th className="list-view-i24">CATEGORY</th>
              <th className="list-view-i24">SUB-CATEGORY</th>
              <th className="list-view-i24">FOLDER PATH</th>
              <th className="list-view-i24">FILE NAME</th>
              <th className="list-view-i25">ATTACHMENT</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="list-view-i26">
                  {(host.state.loading || Boolean(vesselLoadingName) || (documentFilesLoading && filtered.length === 0) || documentVesselsLoadingMore) ? (
                    <div className="list-view-i27">
                      <div className="list-view-i28" />
                      <div className="list-view-i29" style={{ color: '#0f172a' }}>
                        {vesselLoadingName
                          ? `Loading documents and attachments for ${vesselLoadingName}...`
                          : (documentVesselsLoadingMore ? 'Loading more vessels...' : 'Loading vessel documents from SharePoint...')}
                      </div>
                      <div className="list-view-i30" style={{ color: '#64748b' }}>
                        Please wait while folder structures and live files are loaded.
                      </div>
                    </div>
                  ) : (
                    <span className="list-view-i31" style={{ color: '#94a3b8' }}>
                      No documents found.{' '}
                      {textFilter || vesselFilter !== 'all' || docGroupFilter !== 'all' || catFilter !== 'all'
                        ? 'Try clearing the filters.' : ''}
                    </span>
                  )}
                </td>
              </tr>
            ) : pageRows.map((r, idx) => {
              const globalIdx  = safePage * PAGE_ROWS + idx + 1;
              const isUploading = docUploadRowKey === r.groupKey && docUploadBusy;
              const hasFiles    = r.files.length > 0;
              const pathParts = (r.subFolderPath || '').split('>').map(s => s.trim()).filter(Boolean);
              const documentSectionLabel = pathParts.length >= 3 ? pathParts[2] : 'Drawings and Manuals';
              const categoryLabel = r.category || (pathParts.length >= 5 ? pathParts[4] : (pathParts[3] || 'To be Classified'));

              return (
                <tr key={`${r.groupKey}-${idx}`}
                  className="list-view-i32" style={{ borderBottom: `1px solid ${clay.accentSoft}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = clay.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="list-view-i33" style={{ color: clay.textMuted, fontSize: 11, fontFamily: 'monospace' }}>{globalIdx}</td>
                  <td className="list-view-i24">
                    <span className="list-view-i34" style={{ borderRadius: 8, background: clay.accentSoft, color: clay.accentDark }}>
                      {r.group}
                    </span>
                  </td>
                  <td className="list-view-i35" style={{ color: '#334155' }}>{documentSectionLabel}</td>
                  <td className="list-view-i36" style={{ color: '#1e293b' }}>{categoryLabel}</td>
                  <td className="list-view-i35" style={{ color: '#1e293b' }}>{r.subCategory || r.category}</td>
                  <td className="list-view-i24" style={{ color: '#64748b', fontSize: 11 }} title={r.subFolderPath}>{r.subFolderPath}</td>
                  <td className="list-view-i24">
                    {hasFiles ? (
                      <div className="list-view-i37">
                        {r.files.map(file => (
                          <div key={file.name} className="list-view-i38">
                            <input
                              type="checkbox"
                              checked={listViewSelectedFiles.has(file.id)}
                              onChange={() => {
                                host.setState(prev => {
                                  const next = new Set(prev.listViewSelectedFiles);
                                  if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                                  return { listViewSelectedFiles: next };
                                });
                              }}
                              className="list-view-i39" style={{ width: 14 }}
                            />
                            <span className="list-view-i40">{(file as any).uploading ? <Icon iconName="Sync" aria-hidden="true" className="list-view-i41" /> : <Icon iconName="Page" aria-hidden="true" className="list-view-i41" />}</span>
                            <span
                              onClick={() => {
                                if ((file as any).uploading) {
                                  alert(`File "${file.name}" is still uploading. Please wait a moment.`);
                                } else if (file.id && !file.id.startsWith('file_')) {
                                  void host._openDocumentFile(file.id, file.name);
                                } else {
                                  alert(`File "${file.name}" is pending — it will be available after approval.`);
                                }
                              }}
                              className="list-view-i42" style={{ color: '#0284c7' }}
                              title={(file as any).uploading
                                ? `${file.name} (uploading)`
                                : (file.id && /^\d+$/.test(file.id) ? `${file.name} (pending approval)` : `Click to open ${file.name}`)}
                            >
                              {file.name}{(file as any).uploading ? <> <Icon iconName="Sync" aria-hidden="true" className="list-view-i12" /></> : (file.id && /^\d+$/.test(file.id) ? <> <Icon iconName="Sync" aria-hidden="true" className="list-view-i12" /></> : '')}
                            </span>
                            {(() => {
                              const detectedVessel = resolveDetectedVesselForFile(file, host, r.vesselName);
                              const isUnidentified = (host?.state?.ocrUnidentifiedFiles || []).some(
                                n => (n || '').trim().toLowerCase() === file.name.trim().toLowerCase()
                              );

                              if (detectedVessel && !isUnidentified) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      host._openVesselSuggestions([new File([], file.name)], detectedVessel);
                                    }}
                                    title={`View OCR Vessel Suggestion: ${detectedVessel}`}
                                    className="list-view-i43" style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 6, color: '#0284c7' }}
                                  >
                                    <Icon iconName="Robot" aria-hidden="true" className="list-view-i44" /> {detectedVessel}
                                  </button>
                                );
                              } else {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      host._openVesselSuggestions([new File([], file.name)], r.vesselName || '');
                                    }}
                                    title="Vessel name not detected by OCR — click to assign vessel"
                                    className="list-view-i45" style={{ background: '#fff7ed', borderRadius: 6, color: '#c2410c' }}
                                  >
                                    <Icon iconName="Warning" aria-hidden="true" className="list-view-i44" /> Vessel: Not detected
                                  </button>
                                );
                              }
                            })()}
                            {/* OCR Re-classify button for existing files */}
                            {!((file as any).uploading) && file.id && !file.id.startsWith('file_') && !/^\d+$/.test(file.id) && (
                              <button
                                type="button"
                                title={`Run OCR & Re-classify "${file.name}" into correct folder`}
                                onClick={() => {
                                  host._goToView('templates');
                                  // Store pending OCR item in state so TemplatesPage picks it up
                                  setTimeout(() => {
                                    host.setState({ ocrPendingItemId: file.id, ocrPendingFilename: file.name });
                                  }, 100);
                                }}
                                className="list-view-i46" style={{ background: '#f0fdf4', borderRadius: 6, color: '#15803d' }}
                              >
                                <Icon iconName="Search" aria-hidden="true" className="list-view-i44" /> OCR
                              </button>
                            )}
                            {!((file as any).uploading) && file.id && !file.id.startsWith('file_') && !/^\d+$/.test(file.id) && (
                              <button
                                type="button"
                                title={`Archive "${file.name}"`}
                                onClick={() => void host._archiveDocumentFile(file.id, file.name, r.subFolderPath, r.group, r.vesselName)}
                                className="list-view-i47" style={{ background: '#f5f3ff', borderRadius: 6, color: '#6d28d9' }}
                              >
                                <Icon iconName="Package" aria-hidden="true" className="list-view-i44" /> Archive
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="list-view-i13" style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td className="list-view-i25">
                    <div className="list-view-i48">
                      <div className="list-view-i49">
                      <span
                        title={hasFiles ? 'Attachment Available' : 'Attachment Required'}
                        className="list-view-i50" style={{ color: hasFiles ? '#15803d' : '#64748b' }}
                      >
                        {hasFiles ? <><Icon iconName="CheckMark" aria-hidden="true" className="list-view-i51" /> Attached</> : <><Icon iconName="StatusCircleRing" aria-hidden="true" className="list-view-i51" /> Not Attached</>}
                      </span>
                      {/* Row-level upload */}
                      <label className="list-view-i52" style={{ background: isUploading ? '#f1f5f9' : '#fff', border: '1px solid #cbd5e1', borderRadius: 6, color: isUploading ? '#94a3b8' : '#334155', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                        <input
                          type="file"
                          multiple
                          className="list-view-i16"
                          disabled={isUploading}
                          onChange={e => {
                            const filesList = Array.from(e.target.files || []);
                            if (filesList.length === 0) return;
                            e.target.value = '';
                            const bulkFiles = filesList.map(f => ({ file: f, relativePath: f.name }));
                            host._openBulkUpload(bulkFiles, r.uploadFolderId, r.subFolderPath, r.vesselName);
                          }}
                        />
                        {isUploading ? <><Icon iconName="Sync" aria-hidden="true" className="list-view-i51" />...</> : '↑ Upload'}
                      </label>
                      {(() => {
                        const rowSelectedCount = r.files.filter(f => listViewSelectedFiles.has(f.id)).length;
                        return (
                          <>
                            <button
                              type="button"
                              disabled={rowSelectedCount === 0}
                              onClick={() => {
                                if (rowSelectedCount === 0) return;
                                const filesToArchive = r.files
                                  .filter(f => listViewSelectedFiles.has(f.id))
                                  .map(f => ({ id: f.id, name: f.name, folderPath: r.subFolderPath, department: r.group, vesselName: r.vesselName }));
                                host.setState({ listViewSelectedFiles: new Set() });
                                void host._archiveSelectedDocuments(filesToArchive);
                              }}
                              className="list-view-i52" style={{ border: `1px solid ${rowSelectedCount > 0 ? '#d8b4fe' : '#e2e8f0'}`, background: rowSelectedCount > 0 ? '#faf5ff' : '#f8fafc', borderRadius: 6, cursor: rowSelectedCount > 0 ? 'pointer' : 'not-allowed', color: rowSelectedCount > 0 ? '#7e22ce' : '#cbd5e1' }}
                              title={rowSelectedCount > 0 ? `Archive ${rowSelectedCount} selected file(s)` : 'Select files to archive'}
                            >
                              <Icon iconName="Package" aria-hidden="true" className="list-view-i51" />{rowSelectedCount > 0 ? ` Archive (${rowSelectedCount})` : ' Archive'}
                            </button>
                            <button
                              type="button"
                              disabled={rowSelectedCount === 0}
                              onClick={() => {
                                if (rowSelectedCount === 0) return;
                                const filesToDelete = r.files
                                  .filter(f => listViewSelectedFiles.has(f.id))
                                  .map(f => ({ id: f.id, name: f.name, folderId: r.uploadFolderId, folderPath: r.subFolderPath }));
                                host.setState({ listViewSelectedFiles: new Set() });
                                host._openFileDeleteDialog(filesToDelete);
                              }}
                              className="list-view-i52" style={{ border: `1px solid ${rowSelectedCount > 0 ? '#fca5a5' : '#e2e8f0'}`, background: rowSelectedCount > 0 ? '#fff5f5' : '#f8fafc', borderRadius: 6, cursor: rowSelectedCount > 0 ? 'pointer' : 'not-allowed', color: rowSelectedCount > 0 ? '#ef4444' : '#cbd5e1' }}
                              title={rowSelectedCount > 0 ? `Delete ${rowSelectedCount} selected file(s)` : 'Select files to delete'}
                            >
                              <Icon iconName="Delete" aria-hidden="true" className="list-view-i51" />{rowSelectedCount > 0 ? ` Delete (${rowSelectedCount})` : ' Delete'}
                            </button>
                          </>
                        );
                      })()}
                      </div>
                      {/* Open in SharePoint */}
                      <button
                        type="button"
                        onClick={() => void host._openSharePointFolder(r)}
                        title="Open this folder in SharePoint"
                        aria-label={`Open ${r.subFolderPath} in SharePoint`}
                        className="list-view-i53" style={{ width: 28, borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}
                      >↗</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}

        {/* Pagination footer */}
        <div className="list-view-i54" style={{ color: clay.textMuted, background: clay.bg, borderTop: `1px solid ${clay.accentSoft}` }}>
          <span>
            Showing {filtered.length === 0 ? 0 : safePage * PAGE_ROWS + 1}–{Math.min((safePage + 1) * PAGE_ROWS, filtered.length)} of {filtered.length} rows
          </span>
          <div className="list-view-i55">
            <button
              onClick={() => host.setState({ docListPage: Math.max(0, safePage - 1) })}
              disabled={safePage === 0}
              className="list-view-i56" style={{ background: clay.surface, borderRadius: 6, cursor: safePage === 0 ? 'not-allowed' : 'pointer', opacity: safePage === 0 ? 0.4 : 1, boxShadow: clay.shadowRaised }}
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => host.setState({ docListPage: i })}
                className="list-view-i57" style={{ background: i === safePage ? clay.accentGradient : clay.surface, color: i === safePage ? '#fff' : clay.text, borderRadius: 6, fontWeight: i === safePage ? 700 : 400, minWidth: 26, boxShadow: i === safePage ? clay.shadowIcon : clay.shadowRaised }}
              >{i + 1}</button>
            ))}
            <button
              onClick={() => host.setState({ docListPage: Math.min(totalPages - 1, safePage + 1) })}
              disabled={safePage >= totalPages - 1}
              className="list-view-i56" style={{ background: clay.surface, borderRadius: 6, cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages - 1 ? 0.4 : 1, boxShadow: clay.shadowRaised }}
            >›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
