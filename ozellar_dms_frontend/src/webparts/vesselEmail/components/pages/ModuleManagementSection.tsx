import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, dmsTone } from '../dmsDesignSystem';

/**
 * Settings → Module Management.
 * Backend: backend/app/module_settings_api.py (key/value in app_settings,
 * same table folder_structure_default_mode uses — no schema change).
 * Lets an admin show/hide sidebar modules app-wide. Every signed-in user's
 * Sidebar reads the same hidden list (VesselEmail.state.hiddenModules,
 * loaded in componentDidMount via _loadModuleSettings) so a hidden module
 * disappears from everyone's navigation, not just the admin's.
 * "Home" can't be hidden (server strips it) so there's always a way back in.
 */

interface ModuleInfo { id: string; label: string; }
interface ConfigResponse { modules: ModuleInfo[]; hidden: string[]; is_admin: boolean; }

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return (j && (j.detail || j.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled: boolean; onChange: () => void }): React.ReactElement {
  const trackW = 34, trackH = 20, knob = 14, pad = 3;
  return (
    <button
      type="button"
      role="switch"
      className="vdms-mod-toggle"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      style={{
        position: 'relative', flexShrink: 0, width: trackW, height: trackH, borderRadius: trackH,
        border: `1px solid ${on ? clay.accent : 'var(--vdms-line)'}`, background: on ? clay.accent : 'var(--vdms-surface-alt)',
        cursor: disabled ? 'not-allowed' : 'pointer', padding: 0, opacity: disabled ? 0.6 : 1,
        transition: 'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      <span className="module-management-section-i1" style={{ top: pad - 1, left: on ? trackW - knob - pad - 1 : pad - 1, width: knob, height: knob, background: 'var(--vdms-surface)' }} />
    </button>
  );
}

export function ModuleManagementSection({ host }: { host: VesselEmail }): React.ReactElement {
  const [config, setConfig] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/module-settings/config`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      const data: ConfigResponse = await r.json();
      setConfig(data);
      setHidden(new Set(data.hidden));
    } catch (e) {
      setError((e as Error).message || 'Could not load module settings.');
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => { load().catch(() => undefined); }, [load]);

  const dirty = React.useMemo(() => {
    if (!config) return false;
    const original = new Set(config.hidden);
    if (original.size !== hidden.size) return true;
    // Not `for (const id of hidden)` — iterating a Set directly needs
    // --downlevelIteration or an ES2015+ target, neither of which this
    // SPFx build is set up for (and changing tsconfig/build config is out
    // of scope here). Array.from() first, then iterate the array instead.
    return Array.from(hidden).some(id => !original.has(id));
  }, [config, hidden]);

  const toggle = (id: string): void => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch(`${host._base()}/api/module-settings/hidden`, {
        method: 'PUT', headers: host._headers(), body: JSON.stringify({ hidden: Array.from(hidden) }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const data: { hidden: string[] } = await r.json();
      setHidden(new Set(data.hidden));
      setConfig(prev => (prev ? { ...prev, hidden: data.hidden } : prev));
      // Refresh every user's live Sidebar immediately — not just this tab —
      // by pushing the same list into VesselEmail's own state.
      host.setState({ hiddenModules: data.hidden });
      setNotice('Saved. The sidebar updates immediately for everyone.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) return <div className="module-management-section-i2">Loading module settings…</div>;
  if (!config) {
    const dangerTone = dmsTone('danger');
    return (
      <div className="module-management-section-i3" style={{ borderRadius: 8, background: dangerTone.bg, color: dangerTone.fg }}>
        {error || 'Module settings are unavailable.'}{' '}
        <button style={dmsBtn('secondary')} onClick={() => { load().catch(() => undefined); }}>Retry</button>
      </div>
    );
  }

  const dangerTone = dmsTone('danger');
  const successTone = dmsTone('success');

  return (
    <div className="module-management-section-i4">
      <div className="module-management-section-i5">
        <div className="module-management-section-i6">
          Turn a module off to hide it from the sidebar for every user. Settings and Profile are always available.
        </div>
      </div>

      {!config.is_admin && (
        <div className="module-management-section-i2">Only administrators can change this setting.</div>
      )}

      <div className="vdms-mod-scroll" style={{ border: '1px solid var(--vdms-line)', borderRadius: 8, overflowY: 'scroll', overflowX: 'hidden', flex: '1 1 0', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignContent: 'start', background: 'var(--vdms-surface)' }}>
        {config.modules.map((m, idx) => {
          const isHidden = hidden.has(m.id);
          return (
            <div key={m.id} className="module-management-section-i7" style={{ minWidth: 0, borderTop: idx < 2 ? 'none' : '1px solid var(--vdms-line)', borderLeft: idx % 2 === 1 ? '1px solid var(--vdms-line)' : 'none', background: 'var(--vdms-surface)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="module-management-section-i8">{m.label}</div>
                <div className="module-management-section-i9" style={{ color: isHidden ? dangerTone.fg : successTone.fg }}>
                  {isHidden ? 'Hidden' : 'Active'}
                </div>
              </div>
              <Toggle on={!isHidden} disabled={!config.is_admin || saving} onChange={() => toggle(m.id)} />
            </div>
          );
        })}
      </div>

      <div className="module-management-section-i10">
        <button
          style={dmsBtn('primary', !(!config.is_admin || !dirty || saving))}
          disabled={!config.is_admin || !dirty || saving}
          onClick={() => { save().catch(() => undefined); }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && <span className="module-management-section-i6">You have unsaved changes.</span>}
      </div>

      {error && <div className="module-management-section-i11" style={{ borderRadius: 8, background: dangerTone.bg, color: dangerTone.fg }}>{error}</div>}
      {notice && <div className="module-management-section-i11" style={{ borderRadius: 8, background: successTone.bg, color: successTone.fg }}>{notice}</div>}
    </div>
  );
}
