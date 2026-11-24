// Ported from the standalone project's VesselExcelExport.tsx. Read-only —
// never touches the migration scan/move pipeline.
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { MigrationApi, errDetail } from './api';
import { primaryBtn, tokens, error as errColor } from './styles';
import type { SourceFolder } from './types';

export function VesselExcelExportTab({ api, isNight }: { api: MigrationApi; isNight: boolean }): React.ReactElement {
  const t = tokens(isNight);
  const [vessels, setVessels] = React.useState<SourceFolder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listVessels()
      .then((data) => { if (!cancelled) setVessels(data.vessels); })
      .catch((e) => !cancelled && setErrorMsg(errDetail(e, 'Could not load vessels.')))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [api]);

  const handleCreate = async (vesselPath: string): Promise<void> => {
    setErrorMsg(null);
    setDownloadingPath(vesselPath);
    try {
      const res = await fetch(api.vesselExcelExportUrl(vesselPath), { headers: api.authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${vesselPath.split('/').pop()} - Drawings and Manuals.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not create the Excel sheet.');
    } finally {
      setDownloadingPath(null);
    }
  };

  return (
    <div className="vessel-excel-export-tab-i1">
      <div className="vessel-excel-export-tab-i2">
        <div className="vessel-excel-export-tab-i3" style={{ color: t.text }}>
          <Icon iconName="ExcelDocument" className="vessel-excel-export-tab-i4" />Vessel Document Excel Export
        </div>
        <div className="vessel-excel-export-tab-i5" style={{ color: t.textMuted }}>
          Pick a vessel and download a workbook of everything under its Drawings and Manuals folders — one sheet per folder, however deep.
        </div>
      </div>
      {errorMsg && <div className="vessel-excel-export-tab-i6" style={{ borderRadius: 10, border: `1px solid ${errColor}55`, background: `${errColor}15`, color: errColor }}>{errorMsg}</div>}
      <div className="vessel-excel-export-tab-i7">
        {loading ? (
          <div className="vessel-excel-export-tab-i8" style={{ color: t.textMuted }}>Loading vessels…</div>
        ) : vessels.length === 0 ? (
          <div className="vessel-excel-export-tab-i8" style={{ color: t.textMuted }}>No vessel folders found.</div>
        ) : (
          <div className="vessel-excel-export-tab-i9" style={{ border: `1px solid ${t.border}` }}>
            {vessels.map((v, i) => {
              const isDownloading = downloadingPath === v.path;
              return (
                <div key={v.id} className="vessel-excel-export-tab-i10" style={{ borderTop: i ? `1px solid ${t.border}` : undefined }}>
                  <span className="vessel-excel-export-tab-i11" style={{ color: t.text }}><Icon iconName="Ferry" style={{ color: t.textMuted }} />{v.name}</span>
                  <button disabled={isDownloading} onClick={() => handleCreate(v.path)} style={primaryBtn(isDownloading, isNight)}>
                    <Icon iconName={isDownloading ? 'Sync' : 'ExcelDocument'} className="vessel-excel-export-tab-i12" />{isDownloading ? 'Creating…' : 'Create Excel'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
