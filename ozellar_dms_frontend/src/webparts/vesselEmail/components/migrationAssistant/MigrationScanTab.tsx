// The scan -> subfolders -> vessel -> preview -> confirm workflow. Ported
// from the standalone SharePoint AI Migration Assistant's
// frontend/src/components/MigrationAssistant.tsx, restyled with inline
// styles (no Tailwind here) to sit natively inside the SPFx web part.
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { MigrationApi, errDetail } from './api';
import { fileIconName, formatSize } from './fileUtils';
import { pill, primaryBtn, secondaryBtn, tokens, error as errColor, success as successColor, warning as warnColor } from './styles';
import type { ConfirmSummary, MigrationItem, MigrationScanJob, S2SDrive, S2SSite, SourceFile, SourceFolder } from './types';

type Step = 'source' | 'subfolders' | 'vessel' | 'scanning' | 'preview' | 'summary';

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: 'source', label: '1. Source folder' },
  { key: 'subfolders', label: '2. Subfolders' },
  { key: 'vessel', label: '3. Destination vessel' },
  { key: 'preview', label: '4. Review & confirm' },
];

function confidenceLabel(item: MigrationItem): { text: string; color: string } {
  if (item.overridden) return { text: 'Manually set', color: '#6366f1' };
  if (item.confidence == null) return { text: '—', color: '#94a3b8' };
  const pct = Math.round(item.confidence * 100);
  const color = pct >= 75 ? successColor : pct >= 40 ? warnColor : errColor;
  return { text: `${pct}%`, color };
}

export function MigrationScanTab({ api, isNight, actingEmail }: { api: MigrationApi; isNight: boolean; actingEmail: string }): React.ReactElement {
  const t = tokens(isNight);
  const [step, setStep] = React.useState<Step>('source');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Source site + library, picked from the same list as Site-to-Site (the
  // DMS's Site Management sites). Nothing picked = the configured default.
  const [sites, setSites] = React.useState<S2SSite[]>([]);
  const [sourceSite, setSourceSite] = React.useState<S2SSite | null>(null);
  const [sourceDrives, setSourceDrives] = React.useState<S2SDrive[]>([]);
  const [sourceDrive, setSourceDrive] = React.useState<S2SDrive | null>(null);
  const [drivesLoading, setDrivesLoading] = React.useState(false);
  const source = sourceSite && sourceDrive ? { siteKey: sourceSite.key, driveId: sourceDrive.id } : null;

  const [browsePath, setBrowsePath] = React.useState('');
  const [browseFolders, setBrowseFolders] = React.useState<SourceFolder[]>([]);
  const [browseFiles, setBrowseFiles] = React.useState<SourceFile[]>([]);
  const [browseLoading, setBrowseLoading] = React.useState(true);
  const [sourceFolder, setSourceFolder] = React.useState<SourceFolder | null>(null);

  const [subfolderOptions, setSubfolderOptions] = React.useState<SourceFolder[]>([]);
  const [subfolderFiles, setSubfolderFiles] = React.useState<SourceFile[]>([]);
  const [subfolderLoading, setSubfolderLoading] = React.useState(false);
  const [checkedSubfolders, setCheckedSubfolders] = React.useState<Set<string>>(new Set());
  const [checkedFiles, setCheckedFiles] = React.useState<Set<string>>(new Set());

  const [vessels, setVessels] = React.useState<SourceFolder[]>([]);
  const [destinationRoot, setDestinationRoot] = React.useState('');
  const [vesselLoading, setVesselLoading] = React.useState(false);

  const [job, setJob] = React.useState<MigrationScanJob | null>(null);
  const [items, setItems] = React.useState<MigrationItem[]>([]);
  const [hierarchyPaths, setHierarchyPaths] = React.useState<string[]>([]);
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null);
  const [previewItem, setPreviewItem] = React.useState<MigrationItem | null>(null);

  const [summary, setSummary] = React.useState<ConfirmSummary | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const [recentOpen, setRecentOpen] = React.useState(false);
  const [recentJobs, setRecentJobs] = React.useState<MigrationScanJob[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  const loadBrowse = React.useCallback(
    async (path: string) => {
      setBrowseLoading(true);
      setErrorMsg(null);
      try {
        const data = await api.listSourceFolders(path || undefined, source);
        setBrowsePath(data.path);
        setBrowseFolders(data.folders);
        setBrowseFiles(data.files);
      } catch (e) {
        setErrorMsg(errDetail(e, 'Could not load folders.'));
      } finally {
        setBrowseLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, sourceSite, sourceDrive]
  );

  React.useEffect(() => {
    api.listS2SSites().then(setSites).catch(() => setSites([]));
  }, [api]);

  React.useEffect(() => {
    // A site picked without a library yet: wait for the library choice.
    if (step === 'source' && (!sourceSite || sourceDrive)) void loadBrowse(browsePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, browsePath, sourceSite, sourceDrive]);

  const pickSourceSite = async (site: S2SSite | null): Promise<void> => {
    setSourceSite(site);
    setSourceDrive(null);
    setSourceDrives([]);
    setBrowsePath('');
    setBrowseFolders([]);
    setBrowseFiles([]);
    if (!site) return;
    setDrivesLoading(true);
    setErrorMsg(null);
    try {
      const drives = await api.listS2SSiteDrives(site.key);
      setSourceDrives(drives);
      if (drives.length === 1) setSourceDrive(drives[0]);
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load the libraries of this site.'));
    } finally {
      setDrivesLoading(false);
    }
  };

  const crumbs = browsePath.split('/').filter(Boolean);

  const chooseSourceFolder = async (folder: SourceFolder): Promise<void> => {
    setSourceFolder(folder);
    setCheckedSubfolders(new Set());
    setCheckedFiles(new Set());
    setSubfolderLoading(true);
    setErrorMsg(null);
    setStep('subfolders');
    try {
      const data = await api.listSourceFolders(folder.path, source);
      setSubfolderOptions(data.folders);
      setSubfolderFiles(data.files);
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load subfolders.'));
    } finally {
      setSubfolderLoading(false);
    }
  };

  const toggleSubfolder = (name: string): void =>
    setCheckedSubfolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const toggleFile = (name: string): void =>
    setCheckedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const goToVesselStep = async (): Promise<void> => {
    setStep('vessel');
    setVesselLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.listVessels();
      setVessels(data.vessels);
      setDestinationRoot(data.destination_root);
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load vessel folders.'));
    } finally {
      setVesselLoading(false);
    }
  };

  const pollJob = React.useCallback(
    (jobId: string) => {
      let failures = 0;
      const interval = window.setInterval(async () => {
        try {
          const polled = await api.getMigrationScanJob(jobId);
          failures = 0;
          setJob(polled);
          if (polled.status !== 'running') {
            window.clearInterval(interval);
            if (polled.status === 'failed') {
              setErrorMsg(polled.error || 'Scan failed.');
              setStep('vessel');
            } else {
              try {
                const [itemsData, hierarchyData] = await Promise.all([api.getJobItems(jobId), api.getJobHierarchy(jobId)]);
                setJob(itemsData.job);
                setItems(itemsData.items);
                setHierarchyPaths(hierarchyData.paths);
                setStep('preview');
              } catch (e) {
                setErrorMsg(errDetail(e, 'Could not load the scan results.'));
              }
            }
          }
        } catch (e) {
          failures += 1;
          if (failures >= 5) {
            window.clearInterval(interval);
            setErrorMsg(`${errDetail(e, 'Could not reach the scan service.')} The scan may still be running — reopen it from Recent scans.`);
          }
        }
      }, 2000);
    },
    [api]
  );

  const startScan = async (vessel: SourceFolder): Promise<void> => {
    if (!sourceFolder) return;
    setStep('scanning');
    setErrorMsg(null);
    try {
      const newJob = await api.startMigrationScan(sourceFolder.path, Array.from(checkedSubfolders), vessel.path, Array.from(checkedFiles), source);
      setJob(newJob);
      pollJob(newJob.id);
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not start the scan.'));
      setStep('vessel');
    }
  };

  const handleOverride = async (item: MigrationItem, targetPath: string): Promise<void> => {
    if (!job || !targetPath) return;
    setBusyItemId(item.id);
    try {
      const updated = await api.overrideJobItem(job.id, item.id, targetPath);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setErrorMsg(errDetail(e, "Could not update this item's category."));
    } finally {
      setBusyItemId(null);
    }
  };

  const handleReclassify = async (item: MigrationItem): Promise<void> => {
    if (!job) return;
    setBusyItemId(item.id);
    try {
      const updated = await api.reclassifyJobItem(job.id, item.id);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not re-run classification.'));
    } finally {
      setBusyItemId(null);
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!job) return;
    const destinationLabel = job.auto_detect_vessel ? `their detected vessels under "${job.vessel_name}"` : `"${job.vessel_name}"`;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Move ${items.length} file(s) into ${destinationLabel} now? Every file must have a valid Category tag. This cannot be undone from here.`)) return;
    setConfirming(true);
    setErrorMsg(null);
    try {
      const result = await api.confirmJob(job.id);
      setSummary(result);
      setStep('summary');
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not confirm the move.'));
    } finally {
      setConfirming(false);
    }
  };

  const startOver = (): void => {
    setStep('source');
    setSourceFolder(null);
    setCheckedSubfolders(new Set());
    setCheckedFiles(new Set());
    setJob(null);
    setItems([]);
    setSummary(null);
    setErrorMsg(null);
    setBrowsePath('');
  };

  const openRecentJobs = async (): Promise<void> => {
    setRecentOpen(true);
    setRecentLoading(true);
    setErrorMsg(null);
    try {
      setRecentJobs(await api.listMigrationJobs());
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load recent scans.'));
    } finally {
      setRecentLoading(false);
    }
  };

  const viewJob = async (target: MigrationScanJob): Promise<void> => {
    setRecentOpen(false);
    setErrorMsg(null);
    if (target.status === 'running') {
      setJob(target);
      setStep('scanning');
      pollJob(target.id);
      return;
    }
    try {
      const [itemsData, hierarchyData] = await Promise.all([api.getJobItems(target.id), api.getJobHierarchy(target.id)]);
      setJob(itemsData.job);
      setItems(itemsData.items);
      setHierarchyPaths(hierarchyData.paths);
      setStep('preview');
    } catch (e) {
      setErrorMsg(errDetail(e, "Could not load that scan's results."));
    }
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${t.border}` };

  return (
    <div className="migration-scan-tab-i1">
      <div className="migration-scan-tab-i2">
        <div>
          <div className="migration-scan-tab-i3" style={{ color: t.text }}>Pick a source folder, then subfolders, then a vessel</div>
          <div className="migration-scan-tab-i4" style={{ color: t.textMuted }}>Nothing moves in SharePoint until you click "Confirm Move" on the review table.</div>
        </div>
        <div className="migration-scan-tab-i5">
          <button style={secondaryBtn(isNight)} onClick={openRecentJobs}><Icon iconName="History" className="migration-scan-tab-i6" />Recent scans</button>
          {step !== 'source' && step !== 'summary' && (
            <button style={secondaryBtn(isNight)} onClick={startOver}><Icon iconName="NavigateBack" className="migration-scan-tab-i6" />Start over</button>
          )}
        </div>
      </div>

      {step !== 'summary' && (
        <div className="migration-scan-tab-i7">
          {STEP_LABELS.map((s, i) => {
            const order = STEP_LABELS.map((x) => x.key);
            const currentIdx = order.indexOf(step === 'scanning' ? 'preview' : step);
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <span key={s.key} className="migration-scan-tab-i8">
                {i > 0 && <Icon iconName="ChevronRight" className="migration-scan-tab-i9" style={{ color: t.textSubtle }} />}
                <span className="migration-scan-tab-i10" style={{ background: isCurrent ? 'var(--clay-accent-soft)' : 'transparent', color: isCurrent ? 'var(--clay-accent)' : isDone ? successColor : t.textSubtle }}>{s.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {errorMsg && (
        <div className="migration-scan-tab-i11" style={{ borderRadius: 10, border: `1px solid ${errColor}55`, background: `${errColor}15`, color: errColor }}>
          {errorMsg}
        </div>
      )}

      <div className="migration-scan-tab-i12">
        {step === 'source' && (
          <SourcePicker sites={sites} site={sourceSite} drives={sourceDrives} drive={sourceDrive} loading={drivesLoading} isNight={isNight}
            onPickSite={(s) => void pickSourceSite(s)} onPickDrive={(d) => { setSourceDrive(d); setBrowsePath(''); }} />
        )}
        {step === 'source' && (!sourceSite || sourceDrive) && (
          <div className="migration-scan-tab-i13" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
            <div className="migration-scan-tab-i14" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="migration-scan-tab-i15">
                <div className="migration-scan-tab-i16" style={{ color: t.text }}>Select a source folder</div>
                {crumbs.length > 0 && (
                  <button style={primaryBtn()} onClick={() => chooseSourceFolder({ id: '', name: crumbs[crumbs.length - 1], path: browsePath })}>
                    Use current folder ({crumbs[crumbs.length - 1]})
                  </button>
                )}
              </div>
              <div className="migration-scan-tab-i17" style={{ color: t.textSubtle }}>
                <a onClick={() => setBrowsePath('')} className="migration-scan-tab-i18" style={{ color: t.textMuted }}>
                  {sourceSite && sourceDrive ? `${sourceSite.label} / ${sourceDrive.name}` : 'Default source / Documents'}
                </a>
                {crumbs.map((c, i) => (
                  <span key={i} className="migration-scan-tab-i19">
                    <Icon iconName="ChevronRight" className="migration-scan-tab-i20" />
                    <a onClick={() => setBrowsePath(crumbs.slice(0, i + 1).join('/'))} className="migration-scan-tab-i18">{c}</a>
                  </span>
                ))}
              </div>
            </div>
            {browseLoading ? (
              <div className="migration-scan-tab-i21" style={{ color: t.textMuted }}>Loading…</div>
            ) : browseFolders.length === 0 && browseFiles.length === 0 ? (
              <div className="migration-scan-tab-i21" style={{ color: t.textMuted }}>This folder is empty.</div>
            ) : (
              <>
                {browseFolders.map((f) => (
                  <div key={f.id} style={rowStyle}>
                    <Icon iconName="FabricFolder" style={{ color: t.textSubtle }} />
                    <span className="migration-scan-tab-i22" style={{ color: t.text }} onClick={() => setBrowsePath(f.path)}>{f.name}</span>
                    <button style={primaryBtn()} onClick={() => chooseSourceFolder(f)}>Use this folder</button>
                  </div>
                ))}
                {browseFiles.map((f) => <FileRow key={f.id} file={f} isNight={isNight} />)}
              </>
            )}
          </div>
        )}

        {step === 'subfolders' && sourceFolder && (
          <div className="migration-scan-tab-i13" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
            <div className="migration-scan-tab-i14" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="migration-scan-tab-i16" style={{ color: t.text }}>Select subfolders and/or files to process</div>
              <div className="migration-scan-tab-i23" style={{ color: t.textSubtle }}>
                Only what's checked below is scanned — everything else in {sourceFolder.name} is left alone. Checked subfolders are scanned fully (including everything nested).
              </div>
            </div>
            {subfolderLoading ? (
              <div className="migration-scan-tab-i21" style={{ color: t.textMuted }}>Loading…</div>
            ) : (
              <>
                {subfolderOptions.length === 0 && subfolderFiles.length === 0 && (
                  <div className="migration-scan-tab-i24" style={{ color: t.textSubtle }}>This folder is empty.</div>
                )}
                {subfolderOptions.map((f) => (
                  <label key={f.id} style={{ ...rowStyle, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checkedSubfolders.has(f.name)} onChange={() => toggleSubfolder(f.name)} />
                    <Icon iconName="FabricFolder" style={{ color: t.textSubtle }} />
                    <span className="migration-scan-tab-i25" style={{ color: t.text }}>{f.name}</span>
                  </label>
                ))}
                {subfolderFiles.map((f) => (
                  <label key={f.id} style={{ ...rowStyle, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checkedFiles.has(f.name)} onChange={() => toggleFile(f.name)} />
                    <Icon iconName={fileIconName(f.name.split('.').pop()).iconName} style={{ color: fileIconName(f.name.split('.').pop()).color }} />
                    <span className="migration-scan-tab-i26" style={{ color: t.text }}>{f.name}</span>
                    <span className="migration-scan-tab-i27" style={{ color: t.textSubtle }}>{formatSize(f.size)}</span>
                  </label>
                ))}
              </>
            )}
            <div className="migration-scan-tab-i28" style={{ borderTop: `1px solid ${t.border}` }}>
              <button style={secondaryBtn(isNight)} onClick={() => setStep('source')}>Back</button>
              <button
                style={primaryBtn(subfolderOptions.length > 0 && checkedSubfolders.size === 0 && checkedFiles.size === 0)}
                disabled={subfolderOptions.length > 0 && checkedSubfolders.size === 0 && checkedFiles.size === 0}
                onClick={goToVesselStep}
              >
                {checkedSubfolders.size === 0 && checkedFiles.size === 0 ? 'Next: pick destination vessel (scan this folder directly)' : `Next: pick destination vessel (${checkedSubfolders.size + checkedFiles.size} selected)`}
              </button>
            </div>
          </div>
        )}

        {step === 'vessel' && (
          <div className="migration-scan-tab-i13" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
            <div className="migration-scan-tab-i14" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="migration-scan-tab-i16" style={{ color: t.text }}>Select the destination vessel</div>
              <div className="migration-scan-tab-i23" style={{ color: t.textSubtle }}>Documents will be filed into this vessel's existing folders.</div>
            </div>
            {!vesselLoading && destinationRoot && (
              <div style={{ ...rowStyle, background: 'var(--clay-accent-soft)' }}>
                <Icon iconName="Sparkle" className="migration-scan-tab-i29" />
                <div className="migration-scan-tab-i30">
                  <div className="migration-scan-tab-i31" style={{ color: t.text }}>Auto-detect vessel</div>
                  <div className="migration-scan-tab-i27" style={{ color: t.textSubtle }}>Each file is routed to the vessel it actually belongs to.</div>
                </div>
                <button style={primaryBtn()} onClick={() => startScan({ id: '', name: destinationRoot, path: destinationRoot })}>Scan into {destinationRoot}</button>
              </div>
            )}
            {vesselLoading ? (
              <div className="migration-scan-tab-i21" style={{ color: t.textMuted }}>Loading vessels…</div>
            ) : vessels.length === 0 ? (
              <div className="migration-scan-tab-i21" style={{ color: t.textMuted }}>No vessel folders found.</div>
            ) : (
              vessels.map((v) => (
                <div key={v.id} style={rowStyle}>
                  <Icon iconName="FabricFolder" style={{ color: t.textSubtle }} />
                  <span className="migration-scan-tab-i26" style={{ color: t.text }}>{v.name}</span>
                  <button style={primaryBtn()} onClick={() => startScan(v)}>Scan into this vessel</button>
                </div>
              ))
            )}
            <div className="migration-scan-tab-i14" style={{ borderTop: `1px solid ${t.border}` }}>
              <button style={secondaryBtn(isNight)} onClick={() => setStep('subfolders')}>Back</button>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div className="migration-scan-tab-i32" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
            <Icon iconName="Sync" className="migration-scan-tab-i33" />
            <div className="migration-scan-tab-i25" style={{ color: t.textMuted }}>
              {job && job.total_found > 0 ? `Classifying documents (${job.processed} of ${job.total_found})…` : 'Scanning for documents…'}
            </div>
          </div>
        )}

        {step === 'preview' && job && (
          <div className="migration-scan-tab-i34">
            <div className="migration-scan-tab-i35" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
              <div className="migration-scan-tab-i16" style={{ color: t.text }}>
                {items.length} document(s) found in {[...job.subfolders, ...job.files].join(', ') || job.source_folder} — destination:{' '}
                <span className="migration-scan-tab-i29">{job.auto_detect_vessel ? `auto-detect (${job.vessel_name})` : job.vessel_name}</span>
              </div>
              <div className="migration-scan-tab-i36" style={{ color: t.textSubtle }}>Review each row's category below. Nothing moves until "Confirm Move."</div>
            </div>

            <div className="migration-scan-tab-i37" style={{ border: `1px solid ${t.border}` }}>
              <table className="migration-scan-tab-i38" style={{ width: '100%' }}>
                <thead style={{ background: t.surfaceAlt }}>
                  <tr>
                    <th className="migration-scan-tab-i39" style={{ color: t.textMuted }}>File</th>
                    {job.auto_detect_vessel && <th className="migration-scan-tab-i39" style={{ color: t.textMuted }}>Vessel</th>}
                    <th className="migration-scan-tab-i39" style={{ color: t.textMuted }}>AI Category</th>
                    <th className="migration-scan-tab-i39" style={{ color: t.textMuted }}>Destination</th>
                    <th className="migration-scan-tab-i39" style={{ color: t.textMuted }}>Confidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const meta = fileIconName(item.filename.split('.').pop());
                    const conf = confidenceLabel(item);
                    const vesselLabel = job.auto_detect_vessel ? item.detected_vessel_name ?? job.vessel_name : job.vessel_name;
                    const destination = item.suggested_path ? `${vesselLabel}/${item.suggested_path}` : 'Category tag required';
                    return (
                      <tr key={item.id} style={{ borderTop: `1px solid ${t.border}` }}>
                        <td className="migration-scan-tab-i40" style={{ maxWidth: 220 }}>
                          <span className="migration-scan-tab-i41" onClick={() => setPreviewItem(item)}>
                            <Icon iconName={meta.iconName} className="migration-scan-tab-i42" style={{ color: meta.color }} />
                            <span className="migration-scan-tab-i43" style={{ color: t.text }}>{item.filename}</span>
                          </span>
                        </td>
                        {job.auto_detect_vessel && (
                          <td className="migration-scan-tab-i40" style={{ fontSize: 12, color: t.text }}>
                            {item.detected_vessel_name || <span style={{ color: t.textMuted }}>unknown</span>}
                            {item.vessel_exists === false && <span style={{ ...pill('primary'), marginLeft: 6 }}>new</span>}
                          </td>
                        )}
                        <td className="migration-scan-tab-i40">
                          {item.category ? (
                            <span style={pill('primary')}>{item.category}{item.subcategory ? ` / ${item.subcategory}` : ''}</span>
                          ) : item.status === 'failed' ? (
                            <span style={pill('error')} title={item.error ?? 'Classification failed'}>Failed</span>
                          ) : (
                            <span style={pill('warning')}>Needs review</span>
                          )}
                        </td>
                        <td className="migration-scan-tab-i40">
                          <select
                            value={item.suggested_path ?? ''}
                            disabled={busyItemId === item.id}
                            onChange={(e) => handleOverride(item, e.target.value)}
                            className="migration-scan-tab-i44" style={{ maxWidth: 200, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text }}
                          >
                            <option value="" disabled>{item.suggested_path ? destination : 'Category tag required'}</option>
                            {hierarchyPaths.map((p) => <option key={p} value={p}>{vesselLabel}/{p}</option>)}
                          </select>
                        </td>
                        <td className="migration-scan-tab-i45" style={{ color: conf.color }}>{conf.text}</td>
                        <td className="migration-scan-tab-i46">
                          <button
                            disabled={busyItemId === item.id}
                            onClick={() => handleReclassify(item)}
                            title="Re-run AI classification"
                            className="migration-scan-tab-i47" style={{ color: t.textMuted }}
                          >
                            <Icon iconName="Sync" className="migration-scan-tab-i6" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="migration-scan-tab-i48">
              <button style={secondaryBtn(isNight)} onClick={() => setStep('vessel')}>Back</button>
              <button style={{ ...primaryBtn(confirming || items.length === 0), background: confirming || items.length === 0 ? undefined : `linear-gradient(150deg, #34d399, #16a34a)` }} disabled={confirming || items.length === 0} onClick={handleConfirm}>
                <Icon iconName="CheckMark" className="migration-scan-tab-i6" />Confirm Move
              </button>
            </div>
          </div>
        )}

        {step === 'summary' && summary && job && (
          <div className="migration-scan-tab-i49">
            <div className="migration-scan-tab-i50" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
              <div className="migration-scan-tab-i51" style={{ color: t.text }}>Move complete</div>
              <div className="migration-scan-tab-i4" style={{ color: t.textMuted }}>Destination vessel: {job.vessel_name}</div>
              <div className="migration-scan-tab-i52" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <SummaryStat label="Total scanned" value={summary.total} isNight={isNight} />
                <SummaryStat label="Categorized" value={summary.categorized} isNight={isNight} />
                <SummaryStat label="Moved" value={summary.moved} color={successColor} isNight={isNight} />
                <SummaryStat label="Failed" value={summary.failed} color={errColor} isNight={isNight} />
              </div>
            </div>
            {summary.failed_items.length > 0 && (
              <div className="migration-scan-tab-i35" style={{ border: `1px solid ${errColor}55`, background: `${errColor}10` }}>
                <div className="migration-scan-tab-i16" style={{ color: errColor }}>Failed files</div>
                {summary.failed_items.map((f, i) => (
                  <div key={i} className="migration-scan-tab-i53" style={{ color: errColor }}><b>{f.filename}</b> — {f.error}</div>
                ))}
              </div>
            )}
            <button style={primaryBtn()} onClick={startOver}>Start another migration</button>
          </div>
        )}
      </div>

      {previewItem && job && <FilePreviewDrawer api={api} item={previewItem} jobId={job.id} isNight={isNight} actingEmail={actingEmail} onClose={() => setPreviewItem(null)} />}
      {recentOpen && <RecentJobsPicker jobs={recentJobs} loading={recentLoading} isNight={isNight} onClose={() => setRecentOpen(false)} onPick={viewJob} />}
    </div>
  );
}

function SummaryStat({ label, value, color, isNight }: { label: string; value: number; color?: string; isNight: boolean }): React.ReactElement {
  const t = tokens(isNight);
  return (
    <div className="migration-scan-tab-i54" style={{ borderRadius: 10, border: `1px solid ${t.border}`, background: t.surfaceAlt }}>
      <div className="migration-scan-tab-i55" style={{ color: color || t.text }}>{value}</div>
      <div className="migration-scan-tab-i23" style={{ color: t.textMuted }}>{label}</div>
    </div>
  );
}

function FileRow({ file, isNight }: { file: SourceFile; isNight: boolean }): React.ReactElement {
  const t = tokens(isNight);
  const meta = fileIconName(file.name.split('.').pop());
  return (
    <div className="migration-scan-tab-i56" style={{ opacity: 0.8, borderBottom: `1px solid ${t.border}` }}>
      <Icon iconName={meta.iconName} style={{ color: meta.color }} />
      <span className="migration-scan-tab-i26" style={{ color: t.text }}>{file.name}</span>
      <span className="migration-scan-tab-i27" style={{ color: t.textSubtle }}>{formatSize(file.size)}</span>
    </div>
  );
}

function RecentJobsPicker({ jobs, loading, isNight, onClose, onPick }: {
  jobs: MigrationScanJob[]; loading: boolean; isNight: boolean; onClose: () => void; onPick: (j: MigrationScanJob) => void;
}): React.ReactElement {
  const t = tokens(isNight);
  return (
    <div className="migration-scan-tab-i57" style={{ position: 'fixed', zIndex: 1000, background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="migration-scan-tab-i58" style={{ width: '100%', background: t.surface }} onClick={(e) => e.stopPropagation()}>
        <div className="migration-scan-tab-i59" style={{ borderBottom: `1px solid ${t.border}` }}>
          <span className="migration-scan-tab-i16" style={{ color: t.text }}>Recent scans</span>
          <button onClick={onClose} className="migration-scan-tab-i47" style={{ color: t.textMuted }}><Icon iconName="Cancel" /></button>
        </div>
        <div className="migration-scan-tab-i60">
          {loading ? <div className="migration-scan-tab-i61" style={{ color: t.textMuted }}>Loading…</div> : jobs.length === 0 ? (
            <div className="migration-scan-tab-i62" style={{ color: t.textMuted }}>No scans yet.</div>
          ) : jobs.map((j) => (
            <div key={j.id} onClick={() => onPick(j)} className="migration-scan-tab-i63" style={{ borderRadius: 10 }}>
              <div className="migration-scan-tab-i30" style={{ minWidth: 0 }}>
                <div className="migration-scan-tab-i64" style={{ color: t.text }}>
                  {[...j.subfolders, ...j.files].length > 0 ? `${j.source_folder}/{${[...j.subfolders, ...j.files].join(', ')}}` : j.source_folder}
                </div>
                <div className="migration-scan-tab-i27" style={{ color: t.textSubtle }}>→ {j.vessel_name} · {j.total_found} document(s){j.confirmed_at ? ' · confirmed' : ''}</div>
              </div>
              <span style={pill(j.status === 'running' ? 'warning' : j.status === 'failed' ? 'error' : 'success')}>{j.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilePreviewDrawer({ api, item, jobId, isNight, actingEmail, onClose }: {
  api: MigrationApi; item: MigrationItem; jobId: string; isNight: boolean; actingEmail: string; onClose: () => void;
}): React.ReactElement {
  const t = tokens(isNight);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const meta = fileIconName(item.filename.split('.').pop());

  React.useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    setBlobUrl(null);
    setLoadError(false);
    fetch(api.jobItemPreviewUrl(jobId, item.id), { headers: api.authHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fail'))))
      .then((blob) => {
        if (!active) return;
        objUrl = URL.createObjectURL(blob);
        setBlobUrl(objUrl);
      })
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [api, jobId, item.id, actingEmail]);

  return (
    <div className="migration-scan-tab-i65" style={{ position: 'fixed', zIndex: 1000, background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="migration-scan-tab-i66" style={{ width: '100%', background: t.surface }} onClick={(e) => e.stopPropagation()}>
        <div className="migration-scan-tab-i67" style={{ borderBottom: `1px solid ${t.border}` }}>
          <Icon iconName={meta.iconName} style={{ color: meta.color }} />
          <div className="migration-scan-tab-i30" style={{ minWidth: 0 }}>
            <div className="migration-scan-tab-i68" style={{ color: t.text }}>{item.filename}</div>
            <div className="migration-scan-tab-i27" style={{ color: t.textSubtle }}>{[meta.label, formatSize(item.size)].filter(Boolean).join(' · ')}</div>
          </div>
          <button onClick={onClose} className="migration-scan-tab-i47" style={{ color: t.textMuted }}><Icon iconName="Cancel" /></button>
        </div>
        {item.reason && (
          <div className="migration-scan-tab-i69" style={{ borderBottom: `1px solid ${t.border}` }}>
            <span className="migration-scan-tab-i70" style={{ color: t.text }}>AI reasoning: </span><span style={{ color: t.textMuted }}>{item.reason}</span>
            {item.keywords.length > 0 && (
              <div className="migration-scan-tab-i71">
                {item.keywords.map((k) => <span key={k} style={{ ...pill('primary') }}>{k}</span>)}
              </div>
            )}
          </div>
        )}
        <div className="migration-scan-tab-i72" style={{ background: t.surfaceAlt }}>
          {loadError ? (
            <div className="migration-scan-tab-i73" style={{ color: t.textMuted }}>Couldn't load a preview for this document.</div>
          ) : !blobUrl ? (
            <div className="migration-scan-tab-i74"><Icon iconName="Sync" className="migration-scan-tab-i75" style={{ color: t.textSubtle }} /></div>
          ) : meta.previewable ? (
            item.filename.toLowerCase().endsWith('.pdf') ? (
              <iframe title={item.filename} src={blobUrl} className="migration-scan-tab-i76" style={{ width: '100%' }} />
            ) : (
              <div className="migration-scan-tab-i77">
                <img src={blobUrl} alt={item.filename} className="migration-scan-tab-i78" style={{ maxWidth: '100%', borderRadius: 6 }} />
              </div>
            )
          ) : (
            <div className="migration-scan-tab-i79">
              <Icon iconName={meta.iconName} className="migration-scan-tab-i80" style={{ color: meta.color }} />
              <div className="migration-scan-tab-i81" style={{ color: t.textMuted }}>Preview isn't available for {meta.label} files.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Step 1, first: which site and library to take documents from. Sites are
 *  the DMS's Site Management sites (same list as Site-to-Site). */
function SourcePicker({ sites, site, drives, drive, loading, isNight, onPickSite, onPickDrive }: {
  sites: S2SSite[]; site: S2SSite | null; drives: S2SDrive[]; drive: S2SDrive | null; loading: boolean; isNight: boolean;
  onPickSite: (s: S2SSite | null) => void; onPickDrive: (d: S2SDrive) => void;
}): React.ReactElement {
  const t = tokens(isNight);
  const chip = (active: boolean): React.CSSProperties => ({
    borderRadius: 8, border: `1px solid ${active ? 'var(--clay-accent)' : t.border}`, background: active ? 'var(--clay-accent-soft)' : 'transparent',
    color: active ? 'var(--clay-accent)' : t.text, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  });
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase' };
  return (
    <div className="migration-scan-tab-i82" style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <div style={label}>Source site</div>
      <div className="migration-scan-tab-i83">
        <button style={chip(site === null)} onClick={() => onPickSite(null)}>Default source</button>
        {sites.map((s) => <button key={s.key} style={chip(site?.key === s.key)} onClick={() => onPickSite(s)}>{s.label}</button>)}
      </div>
      <div className="migration-scan-tab-i36" style={{ color: t.textSubtle }}>
        Sites come from Sites → Site Management; add a site there to take documents from it.
      </div>
      {site && (
        <>
          <div style={{ ...label, marginTop: 12 }}>Library</div>
          {loading ? <div className="migration-scan-tab-i84" style={{ color: t.textMuted }}>Loading…</div> : drives.length === 0 ? (
            <div className="migration-scan-tab-i84" style={{ color: t.textMuted }}>No document library found on this site.</div>
          ) : (
            <div className="migration-scan-tab-i83">
              {drives.map((d) => <button key={d.id} style={chip(drive?.id === d.id)} onClick={() => onPickDrive(d)}>{d.name}</button>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
