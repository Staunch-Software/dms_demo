import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import {
  applyColorTheme, CLAY_COLOR_PRESETS, DEFAULT_CLAY_COLORS, clay,
} from '../clayTheme';
import type { ClayColorSet, ClayColorTheme } from '../clayTheme';
import { dmsBtn, dmsControlStyle } from '../dmsDesignSystem';

/**
 * Settings → Color Management.
 * Backend: backend/app/color_settings_api.py (key/value in app_settings,
 * same table module_settings_api / filter_settings_api use — no schema
 * change). Lets an admin recolor the whole app — background, text,
 * design/accent color and hover color — set independently for light mode
 * and night mode. Every signed-in user gets the same colors
 * (VesselEmail.state.colorTheme, loaded in componentDidMount via
 * _loadColorSettings), the same way Module Management's hidden list is
 * shared app-wide.
 *
 * Editing here calls applyColorTheme() on every keystroke for an instant
 * live preview across the whole app (buttons, top bar, cards, dialogs —
 * everything built from the clay.* tokens in clayTheme.ts), before the
 * change is ever saved. "Save changes" persists it for everyone; leaving
 * the page without saving reverts the preview back to the saved colors.
 */

const C = {
  text: 'var(--vdms-text)', sub: 'var(--vdms-text-muted)', border: 'var(--vdms-line)', blue: clay.accent, blueBg: clay.accentSoft,
  redBg: clay.pillDangerBg, red: clay.pillDangerText, greenBg: clay.pillActiveBg, green: clay.pillActiveText,
};

interface ConfigResponse { colors: ClayColorTheme; defaults: ClayColorTheme; presets: { id: string; label: string; colors: ClayColorTheme }[]; is_admin: boolean; }

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return (j && (j.detail || j.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

const FIELDS: { key: keyof ClayColorSet; label: string; hint: string }[] = [
  { key: 'bg', label: 'Background color', hint: 'The app’s base background.' },
  { key: 'text', label: 'Text color', hint: 'Main body and heading text.' },
  { key: 'accent', label: 'Design color', hint: 'Primary/accent color — buttons, top bar, highlights.' },
  { key: 'hover', label: 'Hover color', hint: 'Shown when hovering buttons and clickable cards.' },
];

function ColorField({ label, hint, value, disabled, onChange }: {
  label: string; hint: string; value: string; disabled: boolean; onChange: (hex: string) => void;
}): React.ReactElement {
  const [text, setText] = React.useState(value);
  React.useEffect(() => { setText(value); }, [value]);
  const invalid = !HEX_RE.test(text);

  return (
    <div className="color-management-section-i1">
      <input
        type="color"
        value={HEX_RE.test(value) ? value : '#000000'}
        disabled={disabled}
        onChange={e => { setText(e.target.value); onChange(e.target.value); }}
        className="color-management-section-i2" style={{ border: `1px solid ${C.border}`, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <div className="color-management-section-i3" style={{ minWidth: 0 }}>
        <div className="color-management-section-i4" style={{ color: C.text }}>{label}</div>
        <div className="color-management-section-i5" style={{ color: C.sub }}>{hint}</div>
      </div>
      <input
        type="text"
        value={text}
        disabled={disabled}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          if (HEX_RE.test(v)) onChange(v);
        }}
        placeholder="#RRGGBB"
        className="color-management-section-i6" style={{ fontFamily: 'monospace', borderRadius: 6, border: `1px solid ${invalid ? clay.pillDangerText : C.border}`, color: C.text }}
      />
    </div>
  );
}

function ModeGroup({ title, colors, disabled, onChange }: {
  title: string; colors: ClayColorSet; disabled: boolean; onChange: (key: keyof ClayColorSet, hex: string) => void;
}): React.ReactElement {
  return (
    <div className="color-management-section-i7" style={{ border: `1px solid ${C.border}`, borderRadius: clay.radiusCard, background: 'var(--vdms-surface)', boxShadow: clay.shadowRaised }}>
      <div className="color-management-section-i8" style={{ color: C.sub }}>{title}</div>
      <div className="color-management-section-i9">
        {FIELDS.map((f, idx) => (
          <div key={f.key} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${C.border}` }}>
            <ColorField label={f.label} hint={f.hint} value={colors[f.key]} disabled={disabled} onChange={hex => onChange(f.key, hex)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetSwatch({ label, colors, active, disabled, onClick }: {
  label: string; colors: ClayColorTheme; active: boolean; disabled: boolean; onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className="color-management-section-i10" style={{ borderRadius: 8, border: active ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: active ? C.blueBg : 'var(--vdms-surface)', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <div className="color-management-section-i11" style={{ borderRadius: 6, border: `1px solid ${C.border}` }}>
        <div className="color-management-section-i3" style={{ background: colors.light.bg }} />
        <div className="color-management-section-i3" style={{ background: colors.light.accent }} />
        <div className="color-management-section-i3" style={{ background: colors.night.bg }} />
        <div className="color-management-section-i3" style={{ background: colors.night.accent }} />
      </div>
      <div className="color-management-section-i12" style={{ color: C.text }}>{label}</div>
    </button>
  );
}

export function ColorManagementSection({ host }: { host: VesselEmail }): React.ReactElement {
  const [config, setConfig] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [appearanceOpen, setAppearanceOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [draft, setDraft] = React.useState<ClayColorTheme | null>(null);
  const savedRef = React.useRef<ClayColorTheme | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/color-settings/config`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      const data: ConfigResponse = await r.json();
      setConfig(data);
      setDraft(data.colors);
      savedRef.current = data.colors;
    } catch (e) {
      setError((e as Error).message || 'Could not load color settings.');
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => { load().catch(() => undefined); }, [load]);

  // Live preview: whenever the draft changes, apply it app-wide immediately
  // (not yet saved). Revert to the saved colors if this section unmounts
  // without saving, so navigating away without clicking Save doesn't leave
  // the app on an un-persisted preview.
  React.useEffect(() => {
    if (draft) applyColorTheme(draft);
    return () => {
      if (savedRef.current) applyColorTheme(savedRef.current);
    };
  }, [draft]);

  const dirty = React.useMemo(() => {
    if (!config || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(config.colors);
  }, [config, draft]);

  const setField = (mode: 'light' | 'night', key: keyof ClayColorSet, hex: string): void => {
    setDraft(prev => (prev ? { ...prev, [mode]: { ...prev[mode], [key]: hex } } : prev));
  };

  const applyPreset = (colors: ClayColorTheme): void => setDraft(colors);
  const resetToDefault = (): void => setDraft(config ? config.defaults : DEFAULT_CLAY_COLORS);

  const save = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch(`${host._base()}/api/color-settings/colors`, {
        method: 'PUT', headers: host._headers(), body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error(await readError(r));
      const data: { colors: ClayColorTheme } = await r.json();
      setDraft(data.colors);
      savedRef.current = data.colors;
      setConfig(prev => (prev ? { ...prev, colors: data.colors } : prev));
      // Refresh every user's live app immediately — not just this tab — by
      // pushing the saved colors into VesselEmail's own state, the same way
      // Module Management pushes hiddenModules into host.setState.
      host.setState({ colorTheme: data.colors });
      setNotice('Saved. The new colors apply immediately for everyone.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) return <div className="color-management-section-i13" style={{ color: C.sub }}>Loading color settings…</div>;
  if (!config || !draft) {
    return (
      <div className="color-management-section-i14" style={{ borderRadius: 8, background: C.redBg, color: C.red }}>
        {error || 'Color settings are unavailable.'}{' '}
        <button style={dmsBtn('secondary', true)} onClick={() => { load().catch(() => undefined); }}>Retry</button>
      </div>
    );
  }

  const disabled = !config.is_admin || saving;
  const isDefault = JSON.stringify(draft) === JSON.stringify(config.defaults);

  return (
    <div className="color-management-section-i15">
      <div className="color-management-section-i16">
        <div className="color-management-section-i17">
          <button type="button" aria-haspopup="menu" aria-expanded={appearanceOpen} style={{ ...dmsControlStyle(), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
            onClick={() => setAppearanceOpen(o => !o)}>
            Appearance <span aria-hidden="true" className="color-management-section-i18">▾</span>
          </button>
          {appearanceOpen && (
            <>
              <div onClick={() => setAppearanceOpen(false)} className="color-management-section-i19" style={{ position: 'fixed' }} />
              <div role="menu" className="color-management-section-i20" style={{ minWidth: 150, borderRadius: 12, background: 'var(--vdms-surface)' }}>
                {([['night', 'Night'], ['light', 'Light']] as const).map(([m, label]) => {
                  const active = (host.state.themeMode === 'night') === (m === 'night');
                  return (
                    <button key={m} type="button" role="menuitemradio" aria-checked={active}
                      onClick={() => { if (!active) host._toggleThemeMode(); setAppearanceOpen(false); }}
                      className="color-management-section-i21" style={{ background: active ? 'var(--vdms-surface-alt)' : 'transparent', fontWeight: active ? 700 : 500, borderRadius: 8 }}>
                      {label}{active && <span aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="vdms-scroll-clean" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4 }}>
      {!config.is_admin && (
        <div className="color-management-section-i13" style={{ color: C.sub }}>Only administrators can change this setting.</div>
      )}

      <div>
        <div className="color-management-section-i22" style={{ color: C.sub }}>
          Preset palettes
        </div>
        <div className="color-management-section-i23">
          {config.presets.map(p => (
            <PresetSwatch
              key={p.id}
              label={p.label}
              colors={p.colors}
              disabled={disabled}
              active={JSON.stringify(draft) === JSON.stringify(p.colors)}
              onClick={() => applyPreset(p.colors)}
            />
          ))}
        </div>
      </div>

      <div className="color-management-section-i24">
        <ModeGroup title="Light mode" colors={draft.light} disabled={disabled} onChange={(k, hex) => setField('light', k, hex)} />
        <ModeGroup title="Night mode" colors={draft.night} disabled={disabled} onChange={(k, hex) => setField('night', k, hex)} />
      </div>

      </div>

      {error && <div className="color-management-section-i25" style={{ borderRadius: 8, background: C.redBg, color: C.red }}>{error}</div>}
      {notice && <div className="color-management-section-i25" style={{ borderRadius: 8, background: C.greenBg, color: C.green }}>{notice}</div>}
      <div className="color-management-section-i26">
        <button style={dmsBtn('primary', !(disabled || !dirty))} disabled={disabled || !dirty} onClick={() => { save().catch(() => undefined); }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button style={dmsBtn('secondary', !(disabled || isDefault))} disabled={disabled || isDefault} onClick={resetToDefault}>
          Reset to default
        </button>
        {dirty && !saving && <span className="color-management-section-i27" style={{ color: C.sub }}>You have unsaved changes — previewing live.</span>}
      </div>
    </div>
  );
}
