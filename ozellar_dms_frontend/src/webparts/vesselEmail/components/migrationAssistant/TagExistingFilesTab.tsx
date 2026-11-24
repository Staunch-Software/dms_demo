// Ported from the standalone project's TagExistingFiles.tsx.
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { MigrationApi, errDetail } from './api';
import { pill, primaryBtn, secondaryBtn, tokens, error as errColor } from './styles';
import type { ExistingFileTagApply, ExistingFileTagRow, ExistingFileTagScan, TaggedScanJob } from './types';

function TagValue({ value }: { value: string | null | undefined }): React.ReactElement {
  return <span style={{ color: value ? undefined : errColor }}>{value || 'blank'}</span>;
}

export function TagExistingFilesTab({ api, isNight }: { api: MigrationApi; isNight: boolean }): React.ReactElement {
  const t = tokens(isNight);
  const [rootPath, setRootPath] = React.useState('Technical and Crewing  New');
  const [defaultRoot, setDefaultRoot] = React.useState('Technical and Crewing  New');
  const [vessels, setVessels] = React.useState<Array<{ name: string; path: string }>>([]);
  const [scan, setScan] = React.useState<ExistingFileTagScan | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [result, setResult] = React.useState<ExistingFileTagApply | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const [recentJobs, setRecentJobs] = React.useState<TaggedScanJob[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    api.listVessels()
      .then((data) => {
        if (!mounted) return;
        const root = data.destination_root || 'Technical and Crewing  New';
        setDefaultRoot(root);
        setRootPath((prev) => (prev === 'Technical and Crewing' || !prev ? root : prev));
        setVessels(data.vessels || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [api]);

  const runScan = async (): Promise<void> => {
    setScanning(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const data = await api.scanExistingFiles(rootPath);
      setScan(data);
      setSelected(new Set(data.files.filter((f) => f.ready).map((f) => f.id)));
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not scan destination files.'));
    } finally {
      setScanning(false);
    }
  };

  const openRecentJobs = async (): Promise<void> => {
    setRecentOpen(true);
    setRecentLoading(true);
    try {
      setRecentJobs(await api.listTaggedScanJobs());
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load recent tagged scans.'));
    } finally {
      setRecentLoading(false);
    }
  };

  const viewJob = async (job: TaggedScanJob): Promise<void> => {
    setRecentOpen(false);
    try {
      const data = await api.getTaggedScanJob(job.id);
      setRootPath(data.root_path);
      setScan(data);
      setSelected(new Set(data.files.filter((f) => f.ready).map((f) => f.id)));
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not load that tagged scan.'));
    }
  };

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const apply = async (): Promise<void> => {
    setApplying(true);
    setErrorMsg(null);
    try {
      setResult(await api.applyExistingFileTags(rootPath, Array.from(selected)));
      await runScan();
    } catch (e) {
      setErrorMsg(errDetail(e, 'Could not apply tags.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="tag-existing-files-tab-i1">
      <div className="tag-existing-files-tab-i2">
        <div className="tag-existing-files-tab-i3" style={{ color: t.text }}>
          <Icon iconName="Tag" className="tag-existing-files-tab-i4" />Tag Existing Files
        </div>
        <div className="tag-existing-files-tab-i5" style={{ color: t.textMuted }}>
          Derives Group, Category and Vessel only from a file's current folder path — no move, no content extraction. Only writes Managed Metadata columns.
        </div>
        <div className="tag-existing-files-tab-i6">
          {vessels.length > 0 && (
            <select
              value={vessels.some((v) => v.path === rootPath) ? rootPath : rootPath === defaultRoot ? '__ROOT__' : '__CUSTOM__'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__ROOT__') {
                  setRootPath(defaultRoot);
                } else if (val !== '__CUSTOM__') {
                  setRootPath(val);
                }
              }}
              className="tag-existing-files-tab-i7" style={{ borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text }}
            >
              <option value="__ROOT__">Destination Root ({defaultRoot})</option>
              {vessels.map((v) => (
                <option key={v.path} value={v.path}>
                  Vessel: {v.name}
                </option>
              ))}
              {!vessels.some((v) => v.path === rootPath) && rootPath !== defaultRoot && (
                <option value="__CUSTOM__">Custom Path</option>
              )}
            </select>
          )}
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="Destination root folder path"
            className="tag-existing-files-tab-i8" style={{ minWidth: 'min(300px, 100%)', borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text }}
          />
          <button style={primaryBtn(scanning || applying, isNight)} disabled={scanning || applying} onClick={runScan}>
            <Icon iconName="Sync" className="tag-existing-files-tab-i9" />
            {scanning ? 'Scanning…' : 'Scan destination'}
          </button>
          <button style={secondaryBtn(isNight)} disabled={scanning || applying} onClick={openRecentJobs}>
            <Icon iconName="History" className="tag-existing-files-tab-i9" />
            Recent tagged scans
          </button>
          <button
            style={primaryBtn(scanning || applying || selected.size === 0 || !scan, isNight)}
            disabled={scanning || applying || selected.size === 0 || !scan}
            onClick={apply}
          >
            <Icon iconName="CheckMark" className="tag-existing-files-tab-i9" />
            {applying ? 'Applying…' : `Apply Tags (${selected.size})`}
          </button>
        </div>
      </div>

      {errorMsg && <div className="tag-existing-files-tab-i10" style={{ borderRadius: 10, border: `1px solid ${errColor}55`, background: `${errColor}15`, color: errColor }}>{errorMsg}</div>}

      {scan && (
        <div className="tag-existing-files-tab-i11">
          <div className="tag-existing-files-tab-i12" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <Stat label="Files found" value={scan.summary.total_files} isNight={isNight} />
            <Stat label="Fully tagged" value={scan.summary.fully_tagged} isNight={isNight} color="#16a34a" />
            <Stat label="Category skipped" value={scan.summary.category_skipped} isNight={isNight} color="#d97706" />
            <Stat label="Missing taxonomy" value={scan.summary.missing_taxonomy} isNight={isNight} />
            <Stat label="Failed" value={scan.summary.missing_terms} isNight={isNight} color={errColor} />
          </div>
          <div className="tag-existing-files-tab-i13" style={{ border: `1px solid ${t.border}` }}>
            <table className="tag-existing-files-tab-i14" style={{ width: '100%' }}>
              <thead style={{ background: t.surfaceAlt }}>
                <tr>
                  <th className="tag-existing-files-tab-i15" />
                  <th className="tag-existing-files-tab-i16" style={{ color: t.textMuted }}>File / folder</th>
                  <th className="tag-existing-files-tab-i16" style={{ color: t.textMuted }}>Current</th>
                  <th className="tag-existing-files-tab-i16" style={{ color: t.textMuted }}>Folder-derived</th>
                  <th className="tag-existing-files-tab-i16" style={{ color: t.textMuted }}>Terms</th>
                </tr>
              </thead>
              <tbody>
                {scan.files.map((file: ExistingFileTagRow) => (
                  <tr key={file.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td className="tag-existing-files-tab-i15"><input type="checkbox" checked={selected.has(file.id)} disabled={!file.ready} onChange={() => toggle(file.id)} /></td>
                    <td className="tag-existing-files-tab-i15">
                      <div className="tag-existing-files-tab-i17" style={{ color: t.text }}>{file.filename}</div>
                      <div className="tag-existing-files-tab-i18" style={{ color: t.textSubtle }}>{file.folder_path}</div>
                    </td>
                    <td className="tag-existing-files-tab-i19">G: <TagValue value={file.current.group} /><br />C: <TagValue value={file.current.category} /><br />V: <TagValue value={file.current.vessel} /></td>
                    <td className="tag-existing-files-tab-i19">
                      {file.derived ? <>G: <TagValue value={file.derived.group} /><br />C: <TagValue value={file.derived.category} /><br />V: <TagValue value={file.derived.vessel} /></> : <span style={{ color: errColor }}>Unable to determine tags</span>}
                    </td>
                    <td className="tag-existing-files-tab-i19">
                      {file.derived ? Object.entries(file.terms).map(([key, term]) => {
                        const skippedOptional = !term.resolved && key === 'category' && file.ready;
                        const color = term.resolved ? '#16a34a' : skippedOptional ? '#d97706' : errColor;
                        return <div key={key} title={term.reason} style={{ color }}>{key}: {term.resolved ? term.guid : skippedOptional ? `skipped — ${term.reason}` : term.reason}</div>;
                      }) : <span style={{ color: errColor }}>Not ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="tag-existing-files-tab-i20" style={{ borderTop: `1px solid ${t.border}`, color: t.text }}>
          Fully tagged: <b className="tag-existing-files-tab-i21">{result.fully_tagged}</b> · Tagged (category skipped): <b className="tag-existing-files-tab-i22">{result.category_skipped}</b> · Failed: <b style={{ color: errColor }}>{result.failed}</b>
        </div>
      )}

      {recentOpen && (
        <div className="tag-existing-files-tab-i23" style={{ position: 'fixed', zIndex: 1000, background: 'rgba(0,0,0,0.4)' }} onClick={() => setRecentOpen(false)}>
          <div className="tag-existing-files-tab-i24" style={{ width: '100%', background: t.surface }} onClick={(e) => e.stopPropagation()}>
            <div className="tag-existing-files-tab-i25" style={{ color: t.text }}>Recent tagged scans</div>
            {recentLoading ? <div className="tag-existing-files-tab-i26">Loading…</div> : recentJobs.length === 0 ? <div className="tag-existing-files-tab-i27" style={{ color: t.textMuted }}>No tagged scans yet.</div> : recentJobs.map((job) => (
              <div key={job.id} onClick={() => viewJob(job)} className="tag-existing-files-tab-i28">
                <div style={{ minWidth: 0 }}>
                  <div className="tag-existing-files-tab-i29" style={{ color: t.text }}>{job.root_path || 'Destination root'}</div>
                  <div className="tag-existing-files-tab-i18" style={{ color: t.textSubtle }}>{job.summary.total_files} files · {job.summary.fully_tagged} fully tagged</div>
                </div>
                <span style={pill('success')}>{job.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, isNight, color }: { label: string; value: number; isNight: boolean; color?: string }): React.ReactElement {
  const t = tokens(isNight);
  return (
    <div className="tag-existing-files-tab-i30" style={{ borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface }}>
      <div className="tag-existing-files-tab-i18" style={{ color: t.textMuted }}>{label}</div>
      <div className="tag-existing-files-tab-i31" style={{ color: color || t.text }}>{value}</div>
    </div>
  );
}
