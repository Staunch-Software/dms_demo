import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn } from '../dmsDesignSystem';

/**
 * Sites → Site Management → (per site) Vessel folders.
 *
 * Which folders of the site's library hold the vessel folders. The Vessels
 * page ("Found in SharePoint"), the Dashboard's vessel count and the
 * SharePoint vessel sync only look inside them. Backend:
 * /api/vessel-roots/{site_key} (services/vessel_roots.py).
 */

type Mode = 'auto' | 'folders' | 'none';
interface RootsState { mode: Mode; paths: string[]; is_admin?: boolean; updated_by?: string | null }
interface BrowseFolder { id: string; name: string; path: string }

async function readError(r: Response): Promise<string> {
  try { const j = await r.json(); return (j && (j.detail || j.message)) || `HTTP ${r.status}`; } catch { return `HTTP ${r.status}`; }
}

export function VesselRootsControl({ host, siteKey, onSaved }: { host: VesselEmail; siteKey: string; onSaved?: () => void }): React.ReactElement {
  const [saved, setSaved] = React.useState<RootsState | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>('auto');
  const [paths, setPaths] = React.useState<string[]>([]);
  const [browsePath, setBrowsePath] = React.useState('');
  const [folders, setFolders] = React.useState<BrowseFolder[]>([]);
  const [browsing, setBrowsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoadError('');
    try {
      const r = await fetch(`${host._base()}/api/vessel-roots/${encodeURIComponent(siteKey)}`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      setSaved(await r.json());
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [host, siteKey]);

  React.useEffect(() => { load().catch(() => undefined); }, [load]);

  const browse = React.useCallback(async (path: string): Promise<void> => {
    setBrowsing(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/admin/sites/${encodeURIComponent(siteKey)}/folders?path=${encodeURIComponent(path)}`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      const d = await r.json();
      setFolders(d.folders || []);
      setBrowsePath(d.path || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBrowsing(false);
    }
  }, [host, siteKey]);

  const startEdit = (): void => {
    setMode(saved?.mode || 'auto');
    setPaths(saved?.paths || []);
    setError('');
    setOpen(true);
    void browse('');
  };

  const toggle = (path: string): void => setPaths((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));

  const save = async (): Promise<void> => {
    if (mode === 'folders' && paths.length === 0) { setError('Tick at least one folder, or choose another option.'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/vessel-roots/${encodeURIComponent(siteKey)}`, {
        method: 'PUT', headers: host._headers(), body: JSON.stringify({ mode, paths: mode === 'folders' ? paths : [] }),
      });
      if (!r.ok) throw new Error(await readError(r));
      await load();
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const crumbs = browsePath.split('/').filter(Boolean);
  const summary = !saved ? (loadError ? 'Couldn’t load' : 'Loading…')
    : saved.mode === 'none' ? 'This site has no vessel folders'
    : saved.mode === 'folders' ? saved.paths.join(' · ')
    : 'Automatic (whole library)';

  const radio = (value: Mode, title: string, hint: string): React.ReactElement => (
    <label className="vessel-roots-control-i1" style={{ borderRadius: 8, background: mode === value ? clay.accentSoft : 'transparent' }}>
      <input type="radio" name={`roots-${siteKey}`} checked={mode === value} onChange={() => setMode(value)} className="vessel-roots-control-i2" />
      <span>
        <span className="vessel-roots-control-i3">{title}</span>
        <span className="vessel-roots-control-i4">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="vessel-roots-control-i5" style={{ borderLeft: `2px solid ${clay.accentSoft}` }}>
      <div className="vessel-roots-control-i6">
        <Icon iconName="Boat" aria-hidden="true" className="vessel-roots-control-i7" style={{ color: clay.accent }} />
        <span className="vessel-roots-control-i8">Vessel folders:</span>
        <span className="vessel-roots-control-i9" title="Where the Vessels page and Dashboard look for this site's vessel folders">{summary}</span>
        {saved?.is_admin && !open && (
          <button type="button" onClick={startEdit} style={{ ...dmsBtn('ghost'), height: 26, padding: '0 8px', fontSize: 12 }}>
            <Icon iconName="Edit" aria-hidden="true" className="vessel-roots-control-i10" /> Change
          </button>
        )}
      </div>

      {open && (
        // The editor opens as a dialog so it never pushes the page content
        // (vessel cards, site rows) out of view.
        <div role="dialog" aria-modal="true" aria-label={`Vessel folders for ${siteKey}`}
          onClick={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false); }}
          className="vessel-roots-control-i11" style={{ position: 'fixed', zIndex: 1000, background: 'rgba(8,18,32,0.42)' }}>
        <div className="vessel-roots-control-i12" style={{ background: 'var(--vdms-surface)' }}>
          <div className="vessel-roots-control-i13">
            <Icon iconName="Boat" aria-hidden="true" className="vessel-roots-control-i14" style={{ color: clay.accent }} />
            <span className="vessel-roots-control-i15">Vessel folders</span>
            <span className="vessel-roots-control-i16">· {siteKey}</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="vessel-roots-control-i17">
              <Icon iconName="Cancel" className="vessel-roots-control-i18" />
            </button>
          </div>
          <div className="vessel-roots-control-i16">
            Where are this site’s vessel folders? Every folder inside the folders you pick is treated as a vessel —
            the Vessels page suggests them and the Dashboard counts them. Nothing else in the library is considered.
          </div>
          {radio('folders', 'Only inside these folders', 'Pick the folder(s) that contain one folder per vessel, e.g. “Technical and Crewing New”.')}
          {mode === 'folders' && (
            <div className="vessel-roots-control-i19">
              <div className="vessel-roots-control-i20">
                <a onClick={() => void browse('')} className="vessel-roots-control-i21" style={{ color: clay.accent }}>Library</a>
                {crumbs.map((c, i) => (
                  <span key={i} className="vessel-roots-control-i22">
                    <Icon iconName="ChevronRight" className="vessel-roots-control-i23" />
                    <a onClick={() => void browse(crumbs.slice(0, i + 1).join('/'))} className="vessel-roots-control-i21" style={{ color: clay.accent }}>{c}</a>
                  </span>
                ))}
              </div>
              <div className="vessel-roots-control-i24" style={{ borderRadius: 8 }}>
                {browsing ? <div className="vessel-roots-control-i25">Loading…</div>
                  : folders.length === 0 ? <div className="vessel-roots-control-i25">No folders here.</div>
                  : folders.map((f) => (
                    <div key={f.id} className="vessel-roots-control-i26">
                      <input type="checkbox" checked={paths.includes(f.path)} onChange={() => toggle(f.path)} aria-label={`Use ${f.name} as a vessel folder`} />
                      <Icon iconName="FabricFolder" className="vessel-roots-control-i18" style={{ color: clay.accent }} />
                      <span className="vessel-roots-control-i27">{f.name}</span>
                      <button type="button" onClick={() => void browse(f.path)} title="Open this folder" className="vessel-roots-control-i28">
                        <Icon iconName="ChevronRight" className="vessel-roots-control-i10" />
                      </button>
                    </div>
                  ))}
              </div>
              {paths.length > 0 && (
                <div className="vessel-roots-control-i29">
                  {paths.map((p) => (
                    <span key={p} className="vessel-roots-control-i30" style={{ background: clay.accentSoft, color: clay.accent }}>
                      {p}
                      <button type="button" onClick={() => toggle(p)} aria-label={`Remove ${p}`} className="vessel-roots-control-i31" style={{ color: clay.accent }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {radio('none', 'This site has no vessel folders', 'E.g. a migration source site. The Vessels page won’t suggest anything from it.')}
          {radio('auto', 'Automatic', 'Guess from the whole library (folders at the top level or one level down whose names match a vessel). This is how it worked before.')}
          {error && <div className="vessel-roots-control-i32" style={{ color: clay.pillDangerText }}>{error}</div>}
          <div className="vessel-roots-control-i33">
            <button type="button" onClick={() => setOpen(false)} style={dmsBtn('ghost')}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} style={dmsBtn('primary', !saving)}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
