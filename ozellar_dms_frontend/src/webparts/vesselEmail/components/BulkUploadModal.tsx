import * as React from 'react';
import type VesselEmail from './VesselEmail';
import type { FlatRow } from './types/rows';
import type { VesselSuggestionUploadEntry } from './types/ui';
import { isMobileWidth } from './responsive';
import { Icon } from '@fluentui/react/lib/Icon';
import { SiteSelector } from './SiteSelector';
import type { SiteSelectorOption } from './SiteSelector';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BulkUploadFile {
  file: File;
  /** Relative path inside an uploaded folder, e.g. "Reports/Jan/invoice.pdf" */
  relativePath?: string;
}

export interface BulkUploadProgress {
  id: string;
  name: string;
  relativePath?: string;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  message?: string;
  size: string;
  /** Direct SharePoint link to the uploaded file, once known — lets you verify the real destination. */
  webUrl?: string | null;
}

export interface BulkUploadModalProps {
  host: VesselEmail;
  files: BulkUploadFile[];
  /** SPO drive item ID of the target folder */
  folderId: string;
  subFolderPath: string;
  vesselName: string;
  currentFolderNode: { id: string; name: string } | null;
  targetSiteId?: string;
  targetDriveId?: string;
  onClose: () => void;
}

type TagKey = 'domain' | 'vessel' | 'group' | 'category';
type TagValues = Record<TagKey, string>;
type TagOptions = Record<TagKey, string[]>;

const TAG_FIELDS: Array<{ key: TagKey; label: string }> = [
  { key: 'domain', label: 'Domain' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'group', label: 'Group' },
  { key: 'category', label: 'Category' },
];
const EMPTY_TAGS: TagValues = { domain: '', vessel: '', group: '', category: '' };

/** Group value that turns the dialog into a certificate upload (registered in the Certificates module). */
const CERT_GROUP = 'Certificates';

interface CertMaster {
  id: number;
  name: string;
  category: string | null;
  issuing_authority?: string | null;
}

interface CertDetail {
  number: string;
  authority: string;
  issue: string;
  expiry: string;
  noExpiry: boolean;
  /** 'reading' while the PDF is being read for these values. */
  state: 'idle' | 'reading' | 'ready';
  note?: string;
}

const EMPTY_CERT_DETAIL: CertDetail = { number: '', authority: '', issue: '', expiry: '', noExpiry: false, state: 'idle' };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Loose match key: case-insensitive, '&' == 'and', punctuation ignored. */
function normTag(v: string): string {
  return (v || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
}

/** First option that equals one of the path segments (or the fallback value). */
function pickTag(options: string[], segments: string[], fallback?: string): string {
  for (const seg of segments) {
    const hit = options.find(o => normTag(o) === normTag(seg));
    if (hit) return hit;
  }
  if (fallback) {
    const hit = options.find(o => normTag(o) === normTag(fallback));
    if (hit) return hit;
  }
  return '';
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function BulkUploadModal({
  host, files, folderId, subFolderPath, vesselName, currentFolderNode, targetSiteId, targetDriveId, onClose,
}: BulkUploadModalProps): React.ReactElement {
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  const [progress, setProgress] = React.useState<BulkUploadProgress[]>(() =>
    files.map((f, i) => ({
      id: `bulk_${i}_${f.file.name}`,
      name: f.file.name,
      relativePath: f.relativePath,
      status: 'queued',
      size: fmtSize(f.file.size),
    }))
  );

  const [started, setStarted] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [autoCloseSeconds, setAutoCloseSeconds] = React.useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [lastSuccessWebUrl, setLastSuccessWebUrl] = React.useState<string | null>(null);
  const hasRunRef = React.useRef(false);

  // Tag review step. Pre-fills Domain / Vessel / Group / Category from the
  // destination folder path. Nothing is sent unless the user changes a value;
  // if the vocabulary can't be loaded the dialog starts uploading immediately,
  // exactly as it did before this step existed.
  const [reviewing, setReviewing] = React.useState(true);
  const [tagOptions, setTagOptions] = React.useState<TagOptions | null>(null);
  const [tagError, setTagError] = React.useState('');
  const [tags, setTags] = React.useState<TagValues>(EMPTY_TAGS);
  const autoTagsRef = React.useRef<TagValues>(EMPTY_TAGS);

  // Certificate upload: choosing Group = Certificates registers each file in the Certificates module.
  const [certMasters, setCertMasters] = React.useState<CertMaster[]>([]);
  const [certMasterId, setCertMasterId] = React.useState<number | null>(null);
  const [certDetails, setCertDetails] = React.useState<CertDetail[]>(() => files.map(() => ({ ...EMPTY_CERT_DETAIL })));
  const certReadRef = React.useRef(false);
  const certMasterIdRef = React.useRef<number | null>(null);
  certMasterIdRef.current = certMasterId;
  const [autoDetectedCert, setAutoDetectedCert] = React.useState<{ certName: string; vessel: string } | null>(null);
  const [isAnalyzingCert, setIsAnalyzingCert] = React.useState(false);
  const certMode = normTag(tags.group) === normTag(CERT_GROUP) && certMasters.length > 0;
  const certMaster = certMasters.find(m => m.id === certMasterId) || null;
  const certValid = !certMode || (!!certMaster && certDetails.every(d =>
    d.state !== 'reading' && !!d.authority.trim() && !!d.issue && (d.noExpiry || !d.expiry || d.expiry > d.issue)));

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const base = host._base();
        const headers = host._headers();
        const [activeRes, vesselRes, mastersRes] = await Promise.all([
          fetch(`${base}/api/tag-config/active`, { headers }),
          fetch(`${base}/api/tag-config/vessel-names`, { headers }).catch(() => null),
          fetch(`${base}/api/certificates/masters`, { headers }).catch(() => null),
        ]);
        let masters: CertMaster[] = [];
        if (mastersRes && mastersRes.ok) {
          const mj = await mastersRes.json().catch(() => []) as CertMaster[];
          masters = Array.isArray(mj) ? mj : [];
        }
        if (!activeRes.ok) throw new Error(`HTTP ${activeRes.status}`);
        const active = await activeRes.json() as { tree?: Array<{ level: string; name: string; display_name?: string }>; domain_aliases?: Record<string, string[]> };
        const rows = active.tree || [];
        const namesFor = (lvl: string): string[] =>
          Array.from(new Set(rows.filter(r => r.level === lvl).map(r => r.display_name || r.name))).sort((a, b) => a.localeCompare(b));
        let vessels: string[] = [];
        if (vesselRes && vesselRes.ok) {
          const vj = await vesselRes.json() as { vessel_names?: string[] };
          vessels = (vj.vessel_names || []).slice().sort((a, b) => a.localeCompare(b));
        }
        if (cancelled) return;
        const segments = (subFolderPath || '').split(/[>/]/).map(x => x.trim()).filter(Boolean);
        // Never leave Vessel empty-handed: if the Term Store list is empty or
        // doesn't contain the vessel we're uploading into, offer that vessel.
        if (vesselName && !vessels.some(v => normTag(v) === normTag(vesselName))) vessels = [vesselName, ...vessels];
        const groupNames = namesFor('group');
        if (masters.length > 0 && !groupNames.some(g => normTag(g) === normTag(CERT_GROUP))) groupNames.push(CERT_GROUP);
        const options: TagOptions = { domain: namesFor('domain'), vessel: vessels, group: groupNames, category: namesFor('category') };
        setCertMasters(masters);
        const auto: TagValues = {
          domain: pickTag(options.domain, segments)
            || (options.domain.find(d => segments.some(seg =>
              (active.domain_aliases?.[d] || []).some(a => normTag(a) === normTag(seg)))) || ''),
          vessel: pickTag(options.vessel, segments, vesselName),
          group: pickTag(options.group, segments),
          category: pickTag(options.category, segments),
        };
        autoTagsRef.current = auto;
        console.info('[VesselDMS] BulkUploadModal tag options loaded', { auto, counts: { domain: options.domain.length, vessel: options.vessel.length, group: options.group.length, category: options.category.length } });
        setTagOptions(options);
        setTags(auto);

        // Pre-scan first file to auto-detect if it is a maritime certificate
        const firstFile = files[0];
        const isSupportedDoc = firstFile && /\.(pdf|png|jpe?g|tiff)$/i.test(firstFile.file.name);
        if (isSupportedDoc && masters.length > 0) {
          setIsAnalyzingCert(true);
          try {
            const scanFd = new FormData();
            scanFd.append('file', firstFile.file);
            if (vesselName) scanFd.append('vessel_id', vesselName);
            const scanRes = await fetch(`${base}/api/certificates/extract-metadata`, {
              method: 'POST',
              headers: host._uploadHeaders(),
              body: scanFd,
            });
            if (scanRes.ok && !cancelled) {
              const d = await scanRes.json();
              if (d && d.success && d.certificate_master_id) {
                const m = masters.find(c => Number(c.id) === Number(d.certificate_master_id));
                if (m) {
                  // Resolve domain: match Technical and Crewing
                  const techDomain = options.domain.find(dom => {
                    const nd = normTag(dom);
                    return nd === normTag('Technical and Crewing') || nd === normTag('Technical & Crewing') || nd.includes('technical');
                  }) || (options.domain.length > 0 ? options.domain[0] : 'Technical and Crewing');

                  // Resolve vessel: prefer detected vessel from document text
                  let detectedV = '';
                  if (d.vessel_name) {
                    const hit = options.vessel.find(v => normTag(v) === normTag(d.vessel_name));
                    if (hit) {
                      detectedV = hit;
                    } else {
                      detectedV = String(d.vessel_name).toUpperCase().trim();
                      if (!options.vessel.some(v => normTag(v) === normTag(detectedV))) {
                        options.vessel = [detectedV, ...options.vessel].sort((a, b) => a.localeCompare(b));
                        setTagOptions({ ...options });
                      }
                    }
                  } else if (vesselName) {
                    detectedV = vesselName;
                  } else if (auto.vessel) {
                    detectedV = auto.vessel;
                  }

                  const certTags: TagValues = {
                    domain: techDomain,
                    vessel: detectedV,
                    group: CERT_GROUP,
                    category: m.name,
                  };

                  setTags(certTags);
                  setCertMasterId(m.id);
                  certMasterIdRef.current = m.id;
                  certReadRef.current = true;
                  setAutoDetectedCert({ certName: m.name, vessel: detectedV });

                  // Populate cert details for file 0
                  setCertDetails(prev => prev.map((x, idx) => idx !== 0 ? x : {
                    ...x,
                    number: d.certificate_number || '',
                    authority: d.issuing_authority || m.issuing_authority || '',
                    issue: d.issue_date || '',
                    expiry: d.expiry_date || '',
                    noExpiry: !!d.has_no_expiry,
                    state: 'ready' as const,
                    note: 'Auto-detected from certificate. Please review before uploading.',
                  }));

                  // If multiple files, inspect remaining files in background
                  if (files.length > 1) {
                    files.slice(1).forEach((remF, remIdx) => {
                      const actualIdx = remIdx + 1;
                      const remFd = new FormData();
                      remFd.append('file', remF.file);
                      if (detectedV) remFd.append('vessel_id', detectedV);
                      fetch(`${base}/api/certificates/extract-metadata`, { method: 'POST', headers: host._uploadHeaders(), body: remFd })
                        .then(r => (r.ok ? r.json() : null))
                        .then((remD: any) => {
                          setCertDetails(prev => prev.map((x, idx) => idx !== actualIdx ? x : (remD && remD.success ? {
                            ...x,
                            number: remD.certificate_number || '',
                            authority: remD.issuing_authority || m.issuing_authority || '',
                            issue: remD.issue_date || '',
                            expiry: remD.expiry_date || '',
                            noExpiry: !!remD.has_no_expiry,
                            state: 'ready' as const,
                            note: 'Read from document. Please review before uploading.',
                          } : { ...x, state: 'ready' as const, note: 'Could not read details. Fill the details in.' })));
                        })
                        .catch(() => setCertDetails(prev => prev.map((x, idx) => idx !== actualIdx ? x : { ...x, state: 'ready' as const, note: 'Could not read details. Fill the details in.' })));
                    });
                  }
                }
              }
            }
          } catch (scanErr) {
            console.debug('[VesselDMS] Auto certificate check error:', scanErr);
          } finally {
            if (!cancelled) setIsAnalyzingCert(false);
          }
        }
      } catch (e) {
        console.warn('[VesselDMS] Tag options unavailable.', e);
        if (!cancelled) {
          setTagError((e as Error)?.message || 'Could not load the tag lists.');
          setTagOptions({ domain: [], vessel: vesselName ? [vesselName] : [], group: [], category: [] });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    console.info('[VesselDMS] BulkUploadModal mounted', { files: files.length, subFolderPath, vesselName });
    return () => { console.info('[VesselDMS] BulkUploadModal unmounted'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tagsEdited = TAG_FIELDS.some(f => tags[f.key] !== autoTagsRef.current[f.key]);

  // Read certificate number / authority / dates from each PDF once, when Certificates is chosen.
  React.useEffect(() => {
    if (!certMode || certReadRef.current) return;
    certReadRef.current = true;
    setCertDetails(prev => prev.map(d => ({ ...d, state: 'reading' as const })));
    files.forEach((f, i) => {
      const fd = new FormData();
      fd.append('file', f.file);
      const targetV = tags.vessel || vesselName;
      if (targetV) fd.append('vessel_id', targetV);
      fetch(`${host._base()}/api/certificates/extract-metadata`, { method: 'POST', headers: host._uploadHeaders(), body: fd })
        .then(r => (r.ok ? r.json() : null))
        .then((d: any) => {
          setCertDetails(prev => prev.map((x, idx) => idx !== i ? x : (d && d.success ? {
            ...x,
            number: d.certificate_number || '',
            authority: d.issuing_authority || '',
            issue: d.issue_date || '',
            expiry: d.expiry_date || '',
            noExpiry: !!d.has_no_expiry,
            state: 'ready' as const,
            note: 'Read from the PDF. Check before upload.',
          } : { ...x, state: 'ready' as const, note: 'Could not read this PDF. Fill the details in.' })));
          // First file decides the certificate type when none is chosen yet.
          if (i === 0 && d && d.certificate_master_id) {
            const m = certMasters.find(c => Number(c.id) === Number(d.certificate_master_id));
            if (m && certMasterIdRef.current === null) {
              certMasterIdRef.current = m.id;
              setCertMasterId(m.id);
              setTags(t => ({ ...t, category: m.name }));
            }
          }
        })
        .catch(() => setCertDetails(prev => prev.map((x, idx) => idx !== i ? x : { ...x, state: 'ready' as const, note: 'Could not read this PDF. Fill the details in.' })));
    });
  }, [certMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fill the issuing authority from the chosen certificate type when the PDF gave none.
  React.useEffect(() => {
    if (!certMaster || !certMaster.issuing_authority) return;
    setCertDetails(prev => prev.map(d => d.authority ? d : { ...d, authority: certMaster.issuing_authority || '' }));
  }, [certMasterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer while uploading
  React.useEffect(() => {
    if (!started || done) return undefined;
    const iv = window.setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => window.clearInterval(iv);
  }, [started, done]);

  // Auto-close countdown after completion
  React.useEffect(() => {
    if (autoCloseSeconds === null) return undefined;
    if (autoCloseSeconds <= 0) { onClose(); return undefined; }
    const t = window.setTimeout(() => setAutoCloseSeconds(v => v === null ? null : v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [autoCloseSeconds]);

  const updateProgress = (id: string, update: Partial<BulkUploadProgress>): void => {
    setProgress(prev => prev.map(p => p.id === id ? { ...p, ...update } : p));
  };

  // Run upload once on mount
  React.useEffect(() => {
    if (reviewing || hasRunRef.current) return;
    hasRunRef.current = true;
    setStarted(true);
    const overrideTags = tagsEdited ? { ...tags } : null;
    const certUpload = certMode && certMaster
      ? { master: certMaster, details: certDetails.map(d => ({ ...d })), tags: { ...tags, group: CERT_GROUP, category: certMaster.name } }
      : null;

    void (async () => {
      const newUploads: Array<{ name: string; size: string; date: string; id?: string; uploadedAt: number }> = [];
      const successFilesList: File[] = []; // tracks files that uploaded OK — used for vessel suggestions
      const successUploadEntries: VesselSuggestionUploadEntry[] = [];
      let lastWebUrl: string | null = null;

      for (let i = 0; i < files.length; i++) {
        const { file, relativePath } = files[i];
        const progressId = `bulk_${i}_${file.name}`;
        setCurrentIndex(i);
        updateProgress(progressId, { status: 'uploading' });

        if (certUpload) {
          // Certificate: registered through the Certificates module (which stores the file in SharePoint),
          // then tagged with the chosen Domain / Vessel / Group / Category.
          try {
            const d = certUpload.details[i];
            const base = host._base();
            const effVessel = certUpload.tags.vessel || vesselName || '';
            const dupFd = new FormData();
            dupFd.append('vessel_id', effVessel);
            dupFd.append('vessel_name', effVessel);
            dupFd.append('certificate_master_id', String(certUpload.master.id));
            if (d.number.trim()) dupFd.append('certificate_number', d.number.trim());
            dupFd.append('issue_date', d.issue);
            if (!d.noExpiry && d.expiry) dupFd.append('expiry_date', d.expiry);
            dupFd.append('has_no_expiry', d.noExpiry ? 'true' : 'false');
            let matchNote = '';
            try {
              const dupRes = await fetch(`${base}/api/certificates/check-duplicate`, { method: 'POST', headers: host._uploadHeaders(), body: dupFd });
              const dup = dupRes.ok ? await dupRes.json() as { match_type?: string } : null;
              if (dup && dup.match_type === 'exact_duplicate') {
                updateProgress(progressId, { status: 'failed', message: 'Already registered: this certificate is already on file for the vessel.' });
                continue;
              }
              if (dup && dup.match_type === 'renewal') matchNote = ' · newer than the certificate on file';
              if (dup && dup.match_type === 'older_version') matchNote = ' · older than the certificate on file';
            } catch { /* the check is advisory; carry on */ }

            const fd = new FormData();
            fd.append('vessel_id', effVessel);
            fd.append('vessel_name', effVessel);
            fd.append('certificate_master_id', String(certUpload.master.id));
            fd.append('issuing_authority', d.authority.trim());
            fd.append('issue_date', d.issue);
            if (d.number.trim()) fd.append('certificate_number', d.number.trim());
            if (!d.noExpiry && d.expiry) fd.append('expiry_date', d.expiry);
            fd.append('has_no_expiry', d.noExpiry ? 'true' : 'false');
            fd.append('upload_mode', 'separate');
            fd.append('file', file);
            const res = await fetch(`${base}/api/certificates`, { method: 'POST', headers: host._uploadHeaders(), body: fd });
            const body = await res.json().catch(() => ({})) as { detail?: string; sharepoint_file_url?: string | null; sharepoint_item_id?: string | null; sharepoint_drive_id?: string | null; upload_error?: string | null };
            if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Certificate was not saved (HTTP ${res.status}).`);

            let tagNote = '';
            const driveToUse = body.sharepoint_drive_id || targetDriveId || host.props.driveId;
            if (body.sharepoint_item_id && driveToUse) {
              try {
                const tagRes = await fetch(
                  `${base}/api/sites/${encodeURIComponent(targetSiteId || host.props.siteId || '')}/drives/${encodeURIComponent(driveToUse)}/items/${encodeURIComponent(body.sharepoint_item_id)}/tags`,
                  {
                    method: 'PATCH',
                    headers: host._headers(),
                    body: JSON.stringify({ department: certUpload.tags.domain, vessel: certUpload.tags.vessel, group: certUpload.tags.group, category: certUpload.tags.category }),
                  },
                );
                const tj = await tagRes.json().catch(() => ({})) as { detail?: string; ok?: boolean; metadata_patch?: { error?: string } };
                if (!tagRes.ok) tagNote = ` (registered, but tags not saved: ${tj.detail || `HTTP ${tagRes.status}`})`;
                else if (tj.ok === false) tagNote = ` (registered, but tags not saved: ${tj.metadata_patch?.error || 'SharePoint rejected them'})`;
              } catch (tagErr: any) {
                tagNote = ` (registered, but tags not saved: ${tagErr?.message || 'network error'})`;
              }
            }
            lastWebUrl = body.sharepoint_file_url || lastWebUrl;
            updateProgress(progressId, {
              status: 'done',
              message: `→ Certificates · ${certUpload.master.name}${matchNote}${body.upload_error ? ` (${body.upload_error})` : ''}${tagNote}`,
              webUrl: body.sharepoint_file_url || null,
            });
          } catch (err: any) {
            console.error(`[VesselDMS] Certificate upload failed for "${file.name}":`, err);
            updateProgress(progressId, { status: 'failed', message: err?.message || 'Certificate upload failed' });
          }
          continue;
        }

        let targetSubFolderPath = subFolderPath;
        if (relativePath && relativePath.includes('/')) {
          const relDir = relativePath.substring(0, relativePath.lastIndexOf('/'));
          const extraSegments = relDir.split('/').filter(Boolean).join(' > ');
          targetSubFolderPath = subFolderPath
            ? `${subFolderPath} > ${extraSegments}`
            : extraSegments;
        }

        const optimisticKeys = Array.from(new Set([
          targetSubFolderPath,
          (targetSubFolderPath || '').toLowerCase(),
          subFolderPath,
          (subFolderPath || '').toLowerCase(),
          currentFolderNode?.id,
          currentFolderNode?.name,
          folderId,
        ].filter(Boolean) as string[]));
        const optimisticId = host._addUploadingFilePlaceholder(optimisticKeys, file);

        try {
          // Use host._uploadFileToFolder which reliably resolves SharePoint folder paths, Graph IDs, and REST fallbacks
          const result = await host._uploadFileToFolder(
            folderId,
            targetSubFolderPath,
            vesselName,
            file,
            false,
            targetSiteId,
            targetDriveId,
            subFolderPath
          );

          host._replaceUploadingFilePlaceholder(optimisticKeys, optimisticId, file, {
            id: result.fileId,
            pending: result.statusPending,
            date: result.statusPending ? 'Queued for approval' : 'Just now',
            uploadedAt: Date.now(),
          });

          let tagNote = '';
          if (overrideTags && result.isGraphUpload && result.fileId) {
            try {
              const effSite = targetSiteId || host.props.siteId;
              const effDrive = targetDriveId || host.props.driveId;
              const res = await fetch(
                `${host._base()}/api/sites/${encodeURIComponent(effSite || '')}/drives/${encodeURIComponent(effDrive || '')}/items/${encodeURIComponent(result.fileId)}/tags`,
                {
                  method: 'PATCH',
                  headers: host._headers(),
                  body: JSON.stringify({
                    department: overrideTags.domain, vessel: overrideTags.vessel,
                    group: overrideTags.group, category: overrideTags.category,
                  }),
                },
              );
              const body = await res.json().catch(() => ({})) as { detail?: string; ok?: boolean; metadata_patch?: { error?: string } };
              if (!res.ok) tagNote = ` (uploaded, but tags not saved: ${body.detail || `HTTP ${res.status}`})`;
              else if (body.ok === false) tagNote = ` (uploaded, but tags not saved: ${body.metadata_patch?.error || 'SharePoint rejected them'})`;
            } catch (tagErr: any) {
              tagNote = ` (uploaded, but tags not saved: ${tagErr?.message || 'network error'})`;
            }
          }

          const fileId = result.fileId || `file_${Date.now()}_${i}`;
          const newUpload = {
            name: file.name,
            size: fmtSize(file.size),
            date: 'Just now',
            id: fileId,
            uploadedAt: Date.now(),
          };
          newUploads.push(newUpload);
          successFilesList.push(file); // track for vessel suggestions
          successUploadEntries.push({
            filename: file.name,
            drive_item_id: result.fileId || null,
            source_subfolder_path: targetSubFolderPath || null,
            source_vessel_name: vesselName || null,
            uploaded_at: Date.now(),
          });

          // Update state immediately for this file
          host.setState(prev => {
            const uploadedFilesByFolder = { ...prev.uploadedFilesByFolder };
            const baseRows = (prev.rows || []) as FlatRow[];

            // Find all rows matching this vessel + folder
            const vLower = (vesselName || '').toLowerCase();
            const folderNorm = (currentFolderNode?.name || '').toLowerCase();
            const subPathNorm = (subFolderPath || '').toLowerCase();
            const targetNorm = (targetSubFolderPath || '').toLowerCase();

            const matchingRows = baseRows.filter(r =>
              r.vesselName?.toLowerCase() === vLower &&
              (
                (folderNorm && (r.subCategory?.toLowerCase() === folderNorm || r.category?.toLowerCase() === folderNorm)) ||
                (r.subFolderPath && (r.subFolderPath.toLowerCase() === subPathNorm || r.subFolderPath.toLowerCase() === targetNorm)) ||
                (result.folderId && r.uploadFolderId === result.folderId)
              )
            );

            const isDeepUpload = !!targetSubFolderPath && !!subFolderPath &&
              targetSubFolderPath.trim().toLowerCase() !== subFolderPath.trim().toLowerCase();

            // Store file under all relevant keys so folder & list views see it immediately in its destination folder
            const keysToSet = new Set<string>([
              targetSubFolderPath,
              targetSubFolderPath.toLowerCase(),
              result.folderId,
              ...(!isDeepUpload ? [
                currentFolderNode?.id,
                currentFolderNode?.name,
                subFolderPath,
                subFolderPath.toLowerCase(),
              ] : []),
            ].filter(Boolean) as string[]);

            for (const mr of matchingRows) {
              if (isDeepUpload) {
                const mrPath = (mr.subFolderPath || '').trim().toLowerCase();
                if (mrPath === targetNorm) {
                  if (mr.groupKey) keysToSet.add(mr.groupKey);
                  if (mr.uploadFolderId) keysToSet.add(mr.uploadFolderId);
                }
              } else {
                if (mr.groupKey) keysToSet.add(mr.groupKey);
                if (mr.subFolderPath) {
                  keysToSet.add(mr.subFolderPath);
                  keysToSet.add(mr.subFolderPath.toLowerCase());
                }
                if (mr.subCategory) keysToSet.add(mr.subCategory);
                if (mr.category) keysToSet.add(mr.category);
                if (mr.uploadFolderId) keysToSet.add(mr.uploadFolderId);
                if (mr.vesselName && mr.subCategory) {
                  keysToSet.add(`${mr.vesselName} > ${mr.subCategory}`.toLowerCase());
                  keysToSet.add(`${mr.vesselName} > ${mr.group} > ${mr.subCategory}`.toLowerCase());
                }
              }
            }

            for (const key of Array.from(keysToSet)) {
              const existing = uploadedFilesByFolder[key] || [];
              uploadedFilesByFolder[key] = [...existing.filter(f => f.name !== file.name), newUpload];
            }

            // Also update matching row in rows array
            const targetParts = (targetSubFolderPath || '').split('>').map(s => s.trim()).filter(Boolean);
            const targetLeaf = targetParts[targetParts.length - 1] || (currentFolderNode?.name || 'Uploaded Files');
            const targetCategory = targetParts.length > 1 ? targetParts[targetParts.length - 2] : targetLeaf;
            const refRow = matchingRows[0] || baseRows.find(r => r.vesselName?.toLowerCase() === vLower) || null;

            const targetGroupKey = refRow
              ? `${refRow.vesselName}||${refRow.group}||${targetCategory}||${targetLeaf}||${targetSubFolderPath}`
              : `bulk||${targetCategory}||${targetLeaf}||${targetSubFolderPath}`;
            const targetUploadFolderId = result.folderId || refRow?.uploadFolderId || folderId;

            const effectiveRefRow: FlatRow = refRow || {
              srNo: String(baseRows.length + 1),
              vesselName: vesselName || '',
              group: (host.state.docMainFolder || 'Technical & Crewing'),
              category: targetCategory,
              subCategory: targetLeaf,
              subFolderPath: targetSubFolderPath,
              fileName: null,
              fileId: null,
              filePending: false,
              fileUploadedAt: undefined,
              groupKey: targetGroupKey,
              uploadFolderId: targetUploadFolderId,
            };

            let updatedRows = [...baseRows];

            // Ensure folder row exists for this targetSubFolderPath (fileName: null)
            const hasFolderRow = updatedRows.some(r =>
              (r.subFolderPath || '').toLowerCase() === targetNorm && !r.fileName
            );
            if (!hasFolderRow) {
              const nextSrBase = String(updatedRows.length + 1);
              const folderRow: FlatRow = {
                ...effectiveRefRow,
                srNo: nextSrBase,
                category: targetCategory,
                subCategory: targetLeaf,
                subFolderPath: targetSubFolderPath,
                fileName: null,
                fileId: null,
                filePending: false,
                fileUploadedAt: undefined,
                groupKey: targetGroupKey,
                uploadFolderId: targetUploadFolderId,
              };
              updatedRows.push(folderRow);
            }

            // Check if file row already exists for this file
            const existingFileIdx = updatedRows.findIndex(r =>
              ((r.subFolderPath || '').toLowerCase() === targetNorm || (r.groupKey || '').toLowerCase() === targetGroupKey.toLowerCase()) &&
              r.fileName?.toLowerCase() === file.name.toLowerCase()
            );

            if (existingFileIdx !== -1) {
              updatedRows = updatedRows.map((r, idx) =>
                idx === existingFileIdx
                  ? { ...r, fileName: file.name, fileId, filePending: result.statusPending, fileUploadedAt: newUpload.uploadedAt }
                  : r
              );
            } else {
              const nextFileSr = `${updatedRows.length + 1}.1`;
              const fileRow: FlatRow = {
                ...effectiveRefRow,
                srNo: nextFileSr,
                category: targetCategory,
                subCategory: targetLeaf,
                subFolderPath: targetSubFolderPath,
                groupKey: targetGroupKey,
                uploadFolderId: targetUploadFolderId,
                fileName: file.name,
                fileId,
                filePending: result.statusPending,
                fileUploadedAt: newUpload.uploadedAt,
              };
              updatedRows.push(fileRow);
            }

            // Optimistically update site folder cache for parent folder in SharePoint Sites view
            if (targetSiteId && targetDriveId && relativePath && relativePath.includes('/')) {
              const topFolderSeg = relativePath.split('/')[0];
              const pKeys = [
                currentFolderNode?.id ? `${targetSiteId}::${targetDriveId}::${currentFolderNode.id}` : '',
                folderId ? `${targetSiteId}::${targetDriveId}::${folderId}` : '',
              ].filter(Boolean);
              const folderItem = {
                id: result.folderId || `folder_${topFolderSeg}`,
                name: topFolderSeg,
                folder: { childCount: 1 },
                webUrl: '',
                lastModifiedDateTime: new Date().toISOString(),
              };
              pKeys.forEach(pKey => {
                const pCache = host._siteFolderItemsCache.get(pKey);
                if (pCache) {
                  if (!pCache.items.some((it: any) => (it.name || '').toLowerCase() === topFolderSeg.toLowerCase())) {
                    pCache.items = [folderItem, ...pCache.items];
                  }
                } else {
                  host._siteFolderItemsCache.set(pKey, { items: [folderItem], loading: false, parentPath: '' });
                }
              });
            }

            return { uploadedFilesByFolder, rows: updatedRows };
          });

          lastWebUrl = result.webUrl || lastWebUrl;
          updateProgress(progressId, {
            status: 'done',
            message: (relativePath ? `→ ${relativePath}` : `→ ${targetSubFolderPath || 'current folder'}`) + tagNote,
            webUrl: result.webUrl || null,
          });
        } catch (err: any) {
          host._clearUploadingFilePlaceholder(optimisticKeys, optimisticId);
          console.error(`[VesselDMS] Bulk upload failed for "${file.name}":`, err);
          updateProgress(progressId, {
            status: 'failed',
            message: err?.message || 'Upload failed',
          });
        }
      }

      setDone(true);
      setLastSuccessWebUrl(lastWebUrl);
      setAutoCloseSeconds(10);
      void host._syncScheduler?.triggerNow().catch(() => undefined);
      if (targetSiteId && targetDriveId) {
        const refreshTargetId = currentFolderNode?.id || folderId || 'root';
        void host._refreshSiteFolder(targetSiteId, targetDriveId, refreshTargetId);
        if (folderId && folderId !== refreshTargetId) {
          void host._refreshSiteFolder(targetSiteId, targetDriveId, folderId);
        }
      }
    })();
  }, [reviewing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived counts
  const doneCount = progress.filter(p => p.status === 'done').length;
  const failedCount = progress.filter(p => p.status === 'failed').length;
  const totalCount = files.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const canClose = !started || done;

  const statusIcon = (s: BulkUploadProgress['status']): React.ReactElement =>
    s === 'done' ? <Icon iconName="CheckMark" aria-hidden="true" className="bulk-upload-modal-i1" />
    : s === 'failed' ? <Icon iconName="ErrorBadge" aria-hidden="true" className="bulk-upload-modal-i1" />
    : s === 'uploading' ? <Icon iconName="Sync" aria-hidden="true" className="bulk-upload-modal-i1" />
    : <Icon iconName="CircleRing" aria-hidden="true" className="bulk-upload-modal-i1" />;
  const statusColor = (s: BulkUploadProgress['status']): string =>
    s === 'done' ? '#15803d' : s === 'failed' ? '#dc2626' : s === 'uploading' ? '#0284c7' : '#94a3b8';
  const statusBg = (s: BulkUploadProgress['status']): string =>
    s === 'done' ? '#dcfce7' : s === 'failed' ? '#fee2e2' : s === 'uploading' ? '#e0f2fe' : '#f1f5f9';

  return (
    <div
      role="presentation"
      onClick={() => { if (canClose) onClose(); }}
      className="bulk-upload-modal-i2" style={{ position: 'fixed', zIndex: 100001, background: 'rgba(15,23,42,0.62)', padding: isMobile ? 10 : 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        className="vdms-bulk-upload"
        onClick={e => e.stopPropagation()}
        style={{
          // This dialog renders outside the themed app wrapper, so it must set the app font itself (the dropdown popovers do too).
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          width: isMobile ? '95vw' : 740, maxWidth: '95vw', background: '#fff', borderRadius: 20,
          boxShadow: '0 30px 80px rgba(15,23,42,0.38)',
          overflow: 'hidden', border: '1px solid #d1fae5',
          display: 'flex', flexDirection: 'column', maxHeight: '92vh', minHeight: isMobile ? undefined : 'min(620px, 92vh)',
        }}
      >
        {/* ── Header ── */}
        <div className="bulk-upload-modal-i3" style={{ background: done ? (failedCount > 0 ? '#fffbeb' : '#ecfdf5') : started ? '#f0f9ff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div className="bulk-upload-modal-i4">
            <div className="bulk-upload-modal-i5" style={{ background: done ? (failedCount > 0 ? '#fef3c7' : '#dcfce7') : '#dbeafe' }}>
              {done
                ? (failedCount > 0
                  ? <Icon iconName="Warning" aria-hidden="true" className="bulk-upload-modal-i6" />
                  : <Icon iconName="Completed" aria-hidden="true" className="bulk-upload-modal-i6" />)
                : started
                ? <Icon iconName="Cloud" aria-hidden="true" className="bulk-upload-modal-i6" />
                : <Icon iconName="Upload" aria-hidden="true" className="bulk-upload-modal-i6" />}
            </div>
            <div className="bulk-upload-modal-i7" style={{ minWidth: 0 }}>
              <div id="bulk-upload-title" className="bulk-upload-modal-i8" style={{ color: done ? (failedCount > 0 ? '#b45309' : '#059669') : '#0f172a' }}>
                {done
                  ? (failedCount > 0 ? `Uploaded with ${failedCount} Error${failedCount !== 1 ? 's' : ''}` : <><Icon iconName="Completed" aria-hidden="true" className="bulk-upload-modal-i9" /> Folder Upload Completed Successfully!</>)
                  : started
                  ? `Uploading ${currentIndex + 1} of ${totalCount} file${totalCount !== 1 ? 's' : ''}…`
                  : `Ready to Upload ${totalCount} File${totalCount !== 1 ? 's' : ''}`}
              </div>
              <div className="bulk-upload-modal-i10" style={{ color: '#64748b' }}>
                {done
                  ? `${doneCount} of ${totalCount} file${totalCount !== 1 ? 's' : ''} uploaded successfully${failedCount > 0 ? `, ${failedCount} failed` : ''} · ${elapsedSeconds}s total`
                  : started
                  ? `${doneCount} done · Elapsed: ${elapsedSeconds}s`
                  : `Destination: ${subFolderPath || 'current folder'}`}
              </div>
            </div>
            {canClose && (
              <button onClick={onClose} className="bulk-upload-modal-i11" style={{ background: 'none', minWidth: 44, color: '#94a3b8' }}>×</button>
            )}
          </div>

          {/* Progress bar */}
          {started && (
            <div className="bulk-upload-modal-i12">
              <div className="bulk-upload-modal-i13" style={{ color: '#64748b' }}>
                <span>{doneCount} / {totalCount} files</span>
                <span>{pct}%</span>
              </div>
              <div className="bulk-upload-modal-i14" style={{ background: '#e2e8f0' }}>
                <div className="bulk-upload-modal-i15" style={{ background: done
                    ? (failedCount > 0 ? 'linear-gradient(90deg,#f59e0b,#d97706)' : 'linear-gradient(90deg,#10b981,#059669)')
                    : 'linear-gradient(90deg,#0284c7,#38bdf8)', width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* ── File List (at top) ── */}
        <div className="bulk-upload-modal-i16" style={{ maxHeight: reviewing ? (files.length > 2 ? 140 : undefined) : undefined, flex: reviewing ? undefined : 1, padding: reviewing ? '10px 28px' : '12px 28px', background: reviewing ? '#f8fafc' : '#fff', borderBottom: reviewing ? '1px solid #e2e8f0' : 'none' }}>
          {progress.map(p => (
            <div key={p.id} className="bulk-upload-modal-i17" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div className="bulk-upload-modal-i18" style={{ width: 26, background: statusBg(p.status), color: statusColor(p.status) }}>
                {statusIcon(p.status)}
              </div>
              <div className="bulk-upload-modal-i7" style={{ minWidth: 0 }}>
                <div className="bulk-upload-modal-i19" style={{ color: '#1e293b' }}>
                  {p.name}
                </div>
                {(p.message || (p.relativePath && p.relativePath !== p.name)) && (
                  <div className="bulk-upload-modal-i20" style={{ color: p.status === 'failed' ? '#dc2626' : '#64748b' }}>
                    {p.message || p.relativePath}
                  </div>
                )}
              </div>
              <div className="bulk-upload-modal-i21" style={{ color: '#94a3b8' }}>{p.size}</div>
              {p.status === 'done' && p.webUrl ? (
                <a
                  href={p.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open this file in SharePoint"
                  className="bulk-upload-modal-i22" style={{ minWidth: 68, color: statusColor(p.status) }}
                >
                  <Icon iconName="CheckMark" aria-hidden="true" className="bulk-upload-modal-i23" /> Done <Icon iconName="Link" aria-hidden="true" className="bulk-upload-modal-i23" />
                </a>
              ) : (
                <div className="bulk-upload-modal-i24" style={{ minWidth: 68, color: statusColor(p.status) }}>
                  {p.status === 'done' ? <><Icon iconName="CheckMark" aria-hidden="true" className="bulk-upload-modal-i23" /> Done</>
                    : p.status === 'failed' ? <><Icon iconName="ErrorBadge" aria-hidden="true" className="bulk-upload-modal-i23" /> Failed</>
                    : p.status === 'uploading' ? 'Uploading…'
                    : 'Queued'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Tag review (before upload starts) ── */}
        {reviewing && tagOptions && (
          <div className="bulk-upload-modal-i25">
            {/* Certificate Analysis Indicator */}
            {isAnalyzingCert && (
              <div className="bulk-upload-modal-i26" style={{ borderRadius: 8, background: '#f0f9ff', color: '#0369a1' }}>
                <Icon iconName="Sync" aria-hidden="true" className="bulk-upload-modal-i27" />
                <span>Analyzing document for maritime certificate &amp; vessel details…</span>
              </div>
            )}

            {/* Certificate Detected Banner */}
            {autoDetectedCert && certMode && (
              <div className="bulk-upload-modal-i28" style={{ borderRadius: 10, background: '#ecfdf5' }}>
                <div className="bulk-upload-modal-i29">
                  <Icon iconName="Ribbon" aria-hidden="true" className="bulk-upload-modal-i30" />
                  <span>
                    <strong>Certificate Detected:</strong> Auto-selected <strong>Technical and Crewing</strong> &gt; <strong>{tags.vessel || autoDetectedCert.vessel || 'Vessel'}</strong> &gt; <strong>Certificates</strong> ({autoDetectedCert.certName})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAutoDetectedCert(null);
                    setTags(autoTagsRef.current);
                    setCertMasterId(null);
                  }}
                  className="bulk-upload-modal-i31" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, color: '#334155' }}
                  title="Revert back to original folder tags"
                >
                  Revert to folder
                </button>
              </div>
            )}

            <div className="bulk-upload-modal-i32" style={{ color: '#0f172a' }}>Tags</div>
            <div className="bulk-upload-modal-i33" style={{ color: '#64748b' }}>
              Pre-filled from the destination folder. Change a value to override it for every file in this upload.
            </div>
            <div className="bulk-upload-modal-i34" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', width: '100%' }}>
              {TAG_FIELDS.map(f => {
                const value = tags[f.key];
                const auto = autoTagsRef.current[f.key];
                const options = tagOptions[f.key];
                return (
                  <div key={f.key} className="bulk-upload-modal-i35" style={{ color: '#64748b', minWidth: 0, width: '100%' }}>
                    <span className="bulk-upload-modal-i36" style={{ minWidth: 0 }}>
                      <span className="bulk-upload-modal-i37">
                        {f.key === 'category' && certMode ? 'Category (certificate type)' : f.label}
                      </span>
                      {value && (
                        <span className="bulk-upload-modal-i38" style={{ color: value === auto ? '#0369a1' : '#b45309' }}>
                          {value === auto ? 'from folder' : 'edited'}
                        </span>
                      )}
                    </span>
                    {(() => {
                      const isCertCat = f.key === 'category' && certMode;
                      const opts: SiteSelectorOption[] = isCertCat
                        ? [
                          { key: '', label: 'Choose certificate type…' },
                          // One flat list in the same text style as the other dropdowns; a type's category is only
                          // appended when two types share a name, so they stay tellable apart.
                          ...certMasters.slice()
                            .sort((a, b) => a.name.localeCompare(b.name) || (a.category || '').localeCompare(b.category || ''))
                            .map(m => ({
                              key: String(m.id),
                              label: certMasters.filter(x => x.name.trim().toLowerCase() === m.name.trim().toLowerCase()).length > 1 && m.category ? `${m.name} · ${m.category}` : m.name,
                            })),
                        ]
                        : [{ key: '', label: '(none)' }, ...options.map(o => ({ key: o, label: o }))];
                      const onPick = (v: string): void => {
                        if (isCertCat) {
                          const m = certMasters.find(c => String(c.id) === v);
                          setCertMasterId(m ? m.id : null);
                          setTags(prev => ({ ...prev, category: m ? m.name : '' }));
                          return;
                        }
                        if (f.key === 'group') {
                          const leavingCerts = normTag(tags.group) === normTag(CERT_GROUP) && normTag(v) !== normTag(CERT_GROUP);
                          setTags(prev => ({ ...prev, group: v, ...(leavingCerts ? { category: autoTagsRef.current.category } : null) }));
                          if (leavingCerts) setCertMasterId(null);
                          return;
                        }
                        setTags(prev => ({ ...prev, [f.key]: v }));
                      };
                      return (
                        <div className="bulk-upload-modal-i39" style={{ width: '100%', minWidth: 0 }}>
                          <SiteSelector
                            ariaLabel={isCertCat ? 'Category (certificate type)' : f.label}
                            value={isCertCat ? String(certMasterId ?? '') : value}
                            options={opts}
                            onChange={onPick}
                            minWidth={0}
                            width="100%"
                            compact
                            showIcons={false}
                            searchPlaceholder={isCertCat ? 'Search certificate types' : `Search ${f.label.toLowerCase()}`}
                            popoverMinWidth={260}
                            visibleRows={5}
                            uniformText
                          />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            {certMode && (
              <div className="bulk-upload-modal-i40" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <div className="bulk-upload-modal-i41">
                  <span className="bulk-upload-modal-i42" style={{ color: '#0f172a' }}>Certificate details</span>
                  <span className="bulk-upload-modal-i43" style={{ color: '#64748b' }}>
                    {certDetails.some(d => d.state === 'reading') ? 'Reading the PDF…' : 'Check the values before upload.'}
                  </span>
                </div>
                <div style={{ maxHeight: files.length > 1 ? 150 : undefined, overflowY: files.length > 1 ? 'auto' : undefined }}>
                  {files.map((f, i) => {
                    const d = certDetails[i] || EMPTY_CERT_DETAIL;
                    const set = (patch: Partial<CertDetail>): void => setCertDetails(prev => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x));
                    const inp: React.CSSProperties = { minHeight: 34, padding: '5px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
                    const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#64748b', minWidth: 0 };
                    const expiryBad = !d.noExpiry && !!d.expiry && !!d.issue && d.expiry <= d.issue;
                    return (
                      <div key={i} style={{ padding: files.length > 1 ? '6px 0' : 0, borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                        {files.length > 1 && <div className="bulk-upload-modal-i44" style={{ color: '#334155' }}>{f.file.name}</div>}
                        <div className="bulk-upload-modal-i45" style={{ gridTemplateColumns: isMobile ? '1fr 1fr' : '1.2fr 1.2fr 1fr 1fr' }}>
                          <label style={lab}>Certificate number<input style={inp} value={d.number} onChange={e => set({ number: e.target.value })} /></label>
                          <label style={lab}>Issuing authority *<input style={inp} value={d.authority} onChange={e => set({ authority: e.target.value })} /></label>
                          <label style={lab}>Issue date *<input type="date" style={inp} value={d.issue} onChange={e => set({ issue: e.target.value })} /></label>
                          <label style={lab}>Expiry date<input type="date" style={{ ...inp, borderColor: expiryBad ? '#ef4444' : '#e2e8f0' }} value={d.noExpiry ? '' : d.expiry} disabled={d.noExpiry} onChange={e => set({ expiry: e.target.value })} /></label>
                        </div>
                        <div className="bulk-upload-modal-i46" style={{ color: '#64748b' }}>
                          <label className="bulk-upload-modal-i47">
                            <input type="checkbox" checked={d.noExpiry} onChange={e => set({ noExpiry: e.target.checked })} /> This certificate has no expiry date
                          </label>
                          {expiryBad && <span className="bulk-upload-modal-i48">Expiry must be after the issue date.</span>}
                          {!expiryBad && d.note && <span className="bulk-upload-modal-i49">{d.note}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {tagError && (
              <div className="bulk-upload-modal-i50" style={{ color: '#b45309', background: '#fffbeb', borderRadius: 8 }}>
                Couldn't load the tag lists ({tagError}). You can still upload; files get the usual automatic tags.
              </div>
            )}
            {!tagsEdited && !tagError && (
              <div className="bulk-upload-modal-i33" style={{ color: '#94a3b8' }}>
                No changes: files are tagged the usual automatic way.
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="bulk-upload-modal-i51" style={{ borderTop: '1px solid #e2e8f0', background: done ? (failedCount > 0 ? '#fffdf5' : '#f0fdf4') : '#fafafa', flexDirection: isMobile ? 'column' : 'row' }}>
          <div className="bulk-upload-modal-i52" style={{ color: done && failedCount > 0 ? '#b45309' : '#15803d' }}>
            {done && failedCount > 0 && <><Icon iconName="Warning" aria-hidden="true" className="bulk-upload-modal-i27" /> Upload completed: {doneCount} succeeded, {failedCount} failed.</>}
            {done && failedCount === 0 && <><Icon iconName="CheckMark" aria-hidden="true" className="bulk-upload-modal-i27" /> Folder upload completed successfully ({doneCount} file{doneCount !== 1 ? 's' : ''} uploaded to SharePoint Online).</>}
            {!done && started && 'Files are being uploaded to SharePoint Online…'}
            {!done && !started && (certMode ? (certValid ? 'Click Upload to begin. It will also appear in Certificates.' : 'Choose the certificate type and fill in the required details.') : 'Click Upload to begin.')}
          </div>
          {done && doneCount > 0 ? (
            <div className="bulk-upload-modal-i53" style={{ width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={() => {
                  host._toggleAlertBell();
                  onClose();
                }}
                className="bulk-upload-modal-i54" style={{ background: '#0078d4', color: '#fff', borderRadius: 10 }}
              >
                View Alerts
              </button>
              {lastSuccessWebUrl && (
                <a
                  href={lastSuccessWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bulk-upload-modal-i55" style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 10 }}
                >
                  <Icon iconName="Link" aria-hidden="true" className="bulk-upload-modal-i27" /> Open in SharePoint
                </a>
              )}
              <button
                onClick={onClose}
                className="bulk-upload-modal-i56" style={{ borderRadius: 10 }}
              >
                Stay here{autoCloseSeconds !== null ? ` (${autoCloseSeconds}s)` : ''}
              </button>
            </div>
          ) : reviewing ? (
            <div className="bulk-upload-modal-i53" style={{ width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={onClose}
                className="bulk-upload-modal-i57" style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 10 }}
              >
                Cancel
              </button>
              <button
                onClick={() => setReviewing(false)}
                disabled={!tagOptions || !certValid}
                title={certMode && !certValid ? 'Choose the certificate type and fill in the issuing authority and issue date for every file.' : undefined}
                className="bulk-upload-modal-i58" style={{ background: tagOptions && certValid ? '#0078d4' : '#f1f5f9', color: tagOptions && certValid ? '#fff' : '#94a3b8', borderRadius: 10, cursor: tagOptions && certValid ? 'pointer' : 'not-allowed' }}
              >
                {tagOptions ? `Upload ${totalCount} file${totalCount !== 1 ? 's' : ''}` : 'Loading tags…'}
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              disabled={!canClose}
              className="bulk-upload-modal-i58" style={{ background: done ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9', color: done ? '#fff' : '#94a3b8', borderRadius: 10, width: isMobile ? '100%' : 'auto', cursor: canClose ? 'pointer' : 'not-allowed', boxShadow: done ? '0 3px 10px rgba(16,185,129,0.3)' : 'none', transition: 'all 0.2s ease' }}
            >
              {done
                ? `Close${autoCloseSeconds !== null ? ` (${autoCloseSeconds}s)` : ''}`
                : 'Uploading…'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Utility: extract all File entries from a DataTransfer (supports dropped folders) ──

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<BulkUploadFile[]> {
  const result: BulkUploadFile[] = [];

  const readEntry = (entry: any, path: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          result.push({ file, relativePath: path ? `${path}/${file.name}` : file.name });
          resolve();
        }, resolve);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = (): void => {
          reader.readEntries(async (entries: any[]) => {
            if (!entries.length) { resolve(); return; }
            for (const sub of entries) {
              await readEntry(sub, path ? `${path}/${entry.name}` : entry.name);
            }
            readAll(); // Read more batches (Chrome only returns 100 at a time)
          }, resolve);
        };
        readAll();
      } else {
        resolve();
      }
    });
  };

  const items = Array.from(dataTransfer.items || []);
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      await readEntry(entry, '');
    }
  }

  return result;
}
