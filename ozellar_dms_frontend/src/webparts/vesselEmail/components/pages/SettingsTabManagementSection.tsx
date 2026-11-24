import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, DMS_ON_ACCENT } from '../dmsDesignSystem';

/**
 * Settings → Settings Management.
 * Backend: backend/app/settings_tab_api.py (key/value in app_settings,
 * same table hidden_modules and folder_structure_default_mode use — no
 * schema change).
 * Lets an admin show/hide the Settings page's own left-nav tabs app-wide.
 * Every signed-in user's Settings left nav reads the same hidden list
 * (VesselEmail.state.hiddenSettingsTabs, loaded in componentDidMount via
 * _loadSettingsTabSettings) so a hidden tab disappears for everyone, not
 * just the admin. "Settings Management" can't be hidden (server strips it)
 * so there's always a way back in to un-hide the rest.
 */

interface SettingsTabInfo { id: string; label: string; }
interface ConfigResponse { tabs: SettingsTabInfo[]; hidden: string[]; is_admin: boolean; }

const C = {
  text: 'var(--vdms-text)', sub: 'var(--vdms-text-muted)', border: 'var(--vdms-line)', blue: clay.accent, blueBg: clay.accentSoft,
  redBg: clay.pillDangerBg, red: clay.pillDangerText, greenBg: clay.pillActiveBg, green: clay.pillActiveText,
};

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return (j && (j.detail || j.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled: boolean; onChange: () => void }): React.ReactElement {
  const trackW = 40, trackH = 22, knob = 16, pad = 3;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className="settings-tab-management-section-i1" style={{ width: trackW, height: trackH, borderRadius: trackH, border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : 'var(--vdms-surface-alt)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'background 0.2s ease, border-color 0.2s ease' }}
    >
      <span className="settings-tab-management-section-i2" style={{ top: pad - 1, left: on ? trackW - knob - pad - 1 : pad - 1, width: knob, height: knob, background: on ? DMS_ON_ACCENT : 'var(--vdms-surface)', boxShadow: clay.shadowRaised }} />
    </button>
  );
}

export function SettingsTabManagementSection({ host }: { host: VesselEmail }): React.ReactElement {
  const [config, setConfig] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/settings-tab-settings/config`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      const data: ConfigResponse = await r.json();
      setConfig(data);
      setHidden(new Set(data.hidden));
    } catch (e) {
      setError((e as Error).message || 'Could not load settings tab settings.');
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
      const r = await fetch(`${host._base()}/api/settings-tab-settings/hidden`, {
        method: 'PUT', headers: host._headers(), body: JSON.stringify({ hidden: Array.from(hidden) }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const data: { hidden: string[] } = await r.json();
      setHidden(new Set(data.hidden));
      setConfig(prev => (prev ? { ...prev, hidden: data.hidden } : prev));
      // Refresh every user's live Settings left nav immediately — not just
      // this tab — by pushing the same list into VesselEmail's own state.
      host.setState({ hiddenSettingsTabs: data.hidden });
      setNotice('Saved. The Settings menu updates immediately for everyone.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) return <div className="settings-tab-management-section-i3" style={{ color: C.sub }}>Loading settings management…</div>;
  if (!config) {
    return (
      <div className="settings-tab-management-section-i4" style={{ borderRadius: 8, background: C.redBg, color: C.red }}>
        {error || 'Settings management is unavailable.'}{' '}
        <button style={dmsBtn('secondary', true)} onClick={() => { load().catch(() => undefined); }}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-tab-management-section-i5">
      <div>
        <div className="settings-tab-management-section-i6" style={{ color: C.text }}>Settings Management</div>
        <div className="settings-tab-management-section-i7" style={{ color: C.sub }}>
          Turn a tab off to hide it from the Settings menu for every user. Settings Management is always available.
        </div>
      </div>

      {!config.is_admin && (
        <div className="settings-tab-management-section-i3" style={{ color: C.sub }}>Only administrators can change this setting.</div>
      )}

      <div className="settings-tab-management-section-i8" style={{ border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {config.tabs.map((t, idx) => {
          const isHidden = hidden.has(t.id);
          return (
            <div key={t.id} className="settings-tab-management-section-i9" style={{ borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`, background: 'var(--vdms-surface)' }}>
              <div>
                <div className="settings-tab-management-section-i10" style={{ color: C.text }}>{t.label}</div>
                <div className="settings-tab-management-section-i11" style={{ color: isHidden ? C.red : C.green }}>
                  {isHidden ? 'Hidden' : 'Active'}
                </div>
              </div>
              <Toggle on={!isHidden} disabled={!config.is_admin || saving} onChange={() => toggle(t.id)} />
            </div>
          );
        })}
      </div>

      <div className="settings-tab-management-section-i12">
        <button style={dmsBtn('primary', !(!config.is_admin || !dirty || saving))} disabled={!config.is_admin || !dirty || saving} onClick={() => { save().catch(() => undefined); }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && <span className="settings-tab-management-section-i13" style={{ color: C.sub }}>You have unsaved changes.</span>}
      </div>

      {error && <div className="settings-tab-management-section-i14" style={{ borderRadius: 8, background: C.redBg, color: C.red }}>{error}</div>}
      {notice && <div className="settings-tab-management-section-i14" style={{ borderRadius: 8, background: C.greenBg, color: C.green }}>{notice}</div>}
    </div>
  );
}
