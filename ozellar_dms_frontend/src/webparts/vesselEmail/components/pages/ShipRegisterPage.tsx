import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { DmsPageHeader, DmsEmptyState, DmsLoadingState } from '../dmsDesignSystem';
import { CustomDropdown } from '../CustomDropdown';

// Ship Register (client template "Ship_DMS_Module_Template", 2026-11-27):
// ship particulars, technical / crew manager contacts, engines and equipment per vessel.
// Backend: app/ship_register_api.py. Styles: styles/pages/_ship-register.scss

type Category = 'main_engine' | 'aux_engine' | 'emergency_generator' | 'other';

interface Equipment {
  key: string;               // client-side row key
  category: Category;
  equipment_name: string;
  make: string;
  model: string;
  serial_number: string;
  power: string;
  power_unit: string;
  rpm: string;
  specification: string;
}

interface Register {
  vessel_id: number;
  name: string;
  imo: string; flag: string; port_of_registry: string; vessel_type: string; class_society: string; call_sign: string;
  official_no: string; mmsi: string; gross_tonnage: string; net_tonnage: string; deadweight: string;
  p_and_i: string; h_and_m: string;
  tech_manager: string; tech_manager_email: string; tech_manager_email2: string; tech_manager_phone: string; tech_manager_phone2: string;
  crew_manager: string; crew_manager_email: string; crew_manager_email2: string; crew_manager_phone: string; crew_manager_phone2: string;
  updated_at: string | null;
  updated_by_email: string | null;
  equipment: Equipment[];
}

interface Summary {
  vessel_id: number; name: string; imo: string | null; flag: string | null; vessel_type: string | null;
  class_society: string | null; deadweight: string | null; tech_manager: string | null; crew_manager: string | null;
  equipment_counts: Partial<Record<Category, number>>; equipment_total: number;
  filled: number; total_fields: number; updated_at: string | null;
  cert_held: number; cert_total: number; cert_optional: number;
  documents: number | null;   // null when document counts are unavailable (stub mode / SharePoint scan failed)
}

interface Options {
  ship_types: string[];
  equipment_names: string[];
  categories: Array<{ id: Category; label: string; power_unit: string | null }>;
  power_units: string[];
}

const ENGINE_SECTIONS: Array<{ id: Category; title: string; icon: string; unit: string; hint: string }> = [
  { id: 'main_engine', title: 'Main Engine', icon: 'Settings', unit: 'kW', hint: 'Propulsion engine(s)' },
  { id: 'aux_engine', title: 'Aux Engine', icon: 'Lightbulb', unit: 'kVA', hint: 'Generator engines' },
  { id: 'emergency_generator', title: 'Emergency Generator', icon: 'Warning', unit: 'kVA', hint: 'Emergency power' },
];

let rowSeq = 0;
const newRow = (category: Category, unit = ''): Equipment => ({
  key: `n${++rowSeq}`, category, equipment_name: '', make: '', model: '', serial_number: '',
  power: '', power_unit: unit, rpm: '', specification: '',
});

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function toRegister(raw: any): Register {
  const out: any = {};
  Object.keys(raw || {}).forEach(k => { out[k] = k === 'equipment' || k === 'vessel_id' || k.startsWith('updated_') ? raw[k] : s(raw[k]); });
  out.equipment = (raw?.equipment || []).map((e: any) => ({
    key: `e${e.id}`, category: e.category, equipment_name: s(e.equipment_name), make: s(e.make), model: s(e.model),
    serial_number: s(e.serial_number), power: s(e.power), power_unit: s(e.power_unit), rpm: s(e.rpm),
    specification: s(e.specification),
  }));
  return out as Register;
}

async function readError(res: Response): Promise<{ message: string; errors: string[] }> {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (d && typeof d === 'object') return { message: d.message || 'Request failed', errors: d.errors || [] };
    return { message: typeof d === 'string' ? d : `Request failed (${res.status})`, errors: [] };
  } catch {
    return { message: `Request failed (${res.status})`, errors: [] };
  }
}

const TEXT_FIELDS = [
  'name', 'imo', 'flag', 'port_of_registry', 'vessel_type', 'class_society', 'call_sign',
  'official_no', 'mmsi', 'gross_tonnage', 'net_tonnage', 'deadweight', 'p_and_i', 'h_and_m',
  'tech_manager', 'tech_manager_email', 'tech_manager_email2', 'tech_manager_phone', 'tech_manager_phone2',
  'crew_manager', 'crew_manager_email', 'crew_manager_email2', 'crew_manager_phone', 'crew_manager_phone2',
];

// Blank register for "Register New Vessel": one empty row per engine type, like the client's template.
function emptyRegister(): Register {
  const out: any = { vessel_id: 0, updated_at: null, updated_by_email: null };
  TEXT_FIELDS.forEach(f => { out[f] = ''; });
  out.equipment = ENGINE_SECTIONS.map(sec => newRow(sec.id, sec.unit));
  return out as Register;
}

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};


// ─────────────────────────────────────────────────────────────────────────────
type InputMode = 'numeric' | 'decimal' | 'email' | 'tel';

function Field(props: {
  label: string; icon: string; value: string; onChange?: (v: string) => void; readOnly?: boolean;
  placeholder?: string; type?: string; wide?: boolean; hint?: string; inputMode?: InputMode; required?: boolean;
}): React.ReactElement {
  const readOnly = props.readOnly || !props.onChange;
  return (
    <label className={`sr-field${props.wide ? ' sr-field--wide' : ''}`}>
      <span className="sr-field__label">{props.label}{props.required && <span className="sr-req">*</span>}</span>
      <span className={`sr-inputbox${readOnly ? ' sr-inputbox--ro' : ''}`}>
        <Icon iconName={props.icon} className="sr-inputbox__icon" />
        <input
          type={props.type || 'text'}
          value={props.value}
          readOnly={readOnly}
          placeholder={readOnly ? '' : props.placeholder}
          inputMode={props.inputMode}
          onChange={e => props.onChange && props.onChange(e.target.value)}
        />
      </span>
      {props.hint && <span className="sr-field__hint">{props.hint}</span>}
    </label>
  );
}

type TabId = 'particulars' | 'managers' | 'machinery' | 'equipment';
const TABS: Array<{ id: TabId; label: string; icon: string; hint: string }> = [
  { id: 'particulars', label: 'Ship Particulars', icon: 'Ferry', hint: 'Registry, tonnage, class & insurance' },
  { id: 'managers', label: 'Managers', icon: 'People', hint: 'Technical & crew contacts' },
  { id: 'machinery', label: 'Machinery', icon: 'Settings', hint: 'Main, aux & emergency engines' },
  { id: 'equipment', label: 'Equipment', icon: 'Repair', hint: 'Other equipment on board' },
];

const ENGINE_ICONS: Record<string, string> = { main_engine: 'Settings', aux_engine: 'LightningBolt', emergency_generator: 'Warning' };

// ── Register editor (one ship): tabs so each part fits on one screen ────────
function RegisterEditor(props: {
  host: VesselEmail; vesselId: number | null; options: Options | null; canEdit: boolean;
  onBack: (saved: boolean) => void;
}): React.ReactElement {
  const { host, options, canEdit } = props;
  // vesselId null = registering a new ship; it becomes the new id once the ship is created.
  const [vesselId, setVesselId] = React.useState<number | null>(props.vesselId);
  const isNew = vesselId === null;
  const sites = host.state.documentSites || [];
  // The ship's document folder goes into the current document site, as Vessel Master does.
  const [siteKey] = React.useState<string>(() => {
    const active = host.state.activeDocumentSite;
    return (sites.find(x => x.site_key === active) || sites.find(x => x.is_primary) || sites[0])?.site_key || '';
  });
  const [data, setData] = React.useState<Register | null>(null);
  const [initial, setInitial] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; errors: string[] } | null>(null);
  const [notice, setNotice] = React.useState('');
  const [savedOnce, setSavedOnce] = React.useState(false);
  const [tab, setTab] = React.useState<TabId>('particulars');
  const [engine, setEngine] = React.useState<Category>('main_engine');

  const load = React.useCallback(async () => {
    if (vesselId === null) {
      const blank = emptyRegister();
      setData(blank);
      setInitial(JSON.stringify(blank));
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${host._base()}/api/ship-register/${vesselId}`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error((await readError(res)).message);
      const reg = toRegister(await res.json());
      setData(reg);
      setInitial(JSON.stringify(reg));
    } catch (e) {
      setError({ message: (e as Error).message, errors: [] });
    } finally {
      setLoading(false);
    }
  }, [host, vesselId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { void load(); }, []);

  const dirty = !!data && (isNew || JSON.stringify(data) !== initial);
  const set = (field: keyof Register) => (canEdit ? (v: string) => setData(d => (d ? { ...d, [field]: v } : d)) : undefined);

  const updateRow = (key: string, field: keyof Equipment, value: string): void =>
    setData(d => (d ? { ...d, equipment: d.equipment.map(e => (e.key === key ? { ...e, [field]: value } : e)) } : d));
  const addRow = (category: Category, unit: string): void =>
    setData(d => (d ? { ...d, equipment: [...d.equipment, newRow(category, unit)] } : d));
  const removeRow = (key: string): void =>
    setData(d => (d ? { ...d, equipment: d.equipment.filter(e => e.key !== key) } : d));

  const back = (): void => {
    if (dirty && !isNew && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    if (isNew && dirty && data && (data.name || data.imo) && !window.confirm('Discard this new ship?')) return;
    props.onBack(savedOnce);
  };

  const save = async (): Promise<void> => {
    if (!data) return;
    const creating = vesselId === null;
    if (creating) {
      const errors: string[] = [];
      if (!data.name.trim()) errors.push('Ship Name is required.');
      if (!/^\d{7}$/.test(data.imo.trim())) errors.push('IMO No must be exactly 7 digits.');
      if (errors.length) { setError({ message: 'Please fix the following', errors }); setTab('particulars'); return; }
    }
    setSaving(true); setError(null); setNotice('');
    try {
      const { equipment, vessel_id, name, updated_at, updated_by_email, ...fields } = data;
      void vessel_id; void updated_at; void updated_by_email;
      const body: any = { ...fields, equipment: equipment.map(({ key, ...rest }) => { void key; return rest; }) };
      // New ship: one call creates the vessel (and its SharePoint folder in real mode) and saves the register.
      if (creating) { body.name = name; body.site_key = siteKey || null; }
      const res = await fetch(`${host._base()}/api/ship-register${creating ? '' : `/${vesselId}`}`, {
        method: creating ? 'POST' : 'PUT', headers: host._headers(), body: JSON.stringify(body),
      });
      if (!res.ok || res.status === 202) { setError(await readError(res)); return; }
      const reg = toRegister(await res.json());
      if (creating) {
        setVesselId(reg.vessel_id);
        if (siteKey) host._invalidateDocumentLiveTree(siteKey);
      }
      setData(reg);
      setInitial(JSON.stringify(reg));
      setSavedOnce(true);
      setNotice(creating ? `${reg.name} registered${siteKey ? ' and its SharePoint folder created' : ''}.` : 'Changes saved.');
    } catch (e) {
      setError({ message: (e as Error).message, errors: [] });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DmsLoadingState label="Loading ship register…" />;
  if (!data) {
    return (
      <div className="sr-page">
        <button type="button" className="sa-btn sa-btn--link" onClick={() => props.onBack(false)}><Icon iconName="Back" /> All ships</button>
        <div className="sr-alert sr-alert--error"><Icon iconName="ErrorBadge" /> {error?.message || 'Could not load this ship.'}</div>
      </div>
    );
  }

  const shipTypeOptions = Array.from(new Set([...(options?.ship_types || []), ...(data.vessel_type ? [data.vessel_type] : [])]))
    .map(t => ({ key: t, text: t }));
  const nameOptions = Array.from(new Set([
    ...(options?.equipment_names || []),
    ...data.equipment.filter(e => e.category === 'other' && e.equipment_name).map(e => e.equipment_name),
  ])).map(n => ({ key: n, text: n }));
  const unitOptions = (options?.power_units || ['kW', 'kVA']).map(u => ({ key: u, text: u }));
  const count = (c: Category): number => data.equipment.filter(e => e.category === c).length;
  const filledRows = (c: Category): number => data.equipment.filter(e => e.category === c && (e.make || e.model || e.equipment_name)).length;

  // Per-tab status for the tab strip: a check once the essentials are in.
  const tabDone: Record<TabId, boolean> = {
    particulars: !!(data.imo && data.flag && data.vessel_type && data.class_society && data.deadweight),
    managers: !!(data.tech_manager && data.crew_manager),
    machinery: ENGINE_SECTIONS.every(sec => filledRows(sec.id) > 0),
    equipment: filledRows('other') > 0,
  };
  const tabBadge: Partial<Record<TabId, number>> = {
    machinery: filledRows('main_engine') + filledRows('aux_engine') + filledRows('emergency_generator'),
    equipment: filledRows('other'),
  };
  const tabIndex = TABS.findIndex(t => t.id === tab);

  const managerCard = (prefix: 'tech_manager' | 'crew_manager', label: string, icon: string): React.ReactElement => (
    <div className="sr-manager">
      <div className="sr-manager__head"><span className="sr-manager__icon"><Icon iconName={icon} /></span>{label}</div>
      <div className="sr-grid sr-grid--2">
        <Field label="Company / Name" icon="CityNext" wide value={data[prefix]} onChange={set(prefix)} placeholder="e.g. Ozellar Ship Management" />
        <Field label="PIC Email" icon="Mail" type="email" inputMode="email" value={data[`${prefix}_email` as keyof Register] as string} onChange={set(`${prefix}_email` as keyof Register)} placeholder="pic@company.com" />
        <Field label="Email 2" icon="Mail" type="email" inputMode="email" value={data[`${prefix}_email2` as keyof Register] as string} onChange={set(`${prefix}_email2` as keyof Register)} />
        <Field label="Phone" icon="Phone" type="tel" inputMode="tel" value={data[`${prefix}_phone` as keyof Register] as string} onChange={set(`${prefix}_phone` as keyof Register)} placeholder="+91 …" />
        <Field label="Phone 2" icon="Phone" type="tel" inputMode="tel" value={data[`${prefix}_phone2` as keyof Register] as string} onChange={set(`${prefix}_phone2` as keyof Register)} />
      </div>
    </div>
  );

  const cell = (row: Equipment, field: keyof Equipment, label: string, placeholder = '', inputMode?: 'decimal'): React.ReactElement => (
    <input className="sr-input sr-input--cell" value={row[field]} readOnly={!canEdit} placeholder={canEdit ? placeholder : ''}
      aria-label={label} inputMode={inputMode} onChange={e => updateRow(row.key, field, e.target.value)} />
  );
  const removeBtn = (row: Equipment): React.ReactElement | null => (canEdit ? (
    <button type="button" className="sr-icon-btn sr-icon-btn--danger" title="Remove" aria-label="Remove row" onClick={() => removeRow(row.key)}>
      <Icon iconName="Delete" />
    </button>
  ) : null);

  const sec = ENGINE_SECTIONS.find(x => x.id === engine) || ENGINE_SECTIONS[0];
  const engineRows = data.equipment.filter(e => e.category === sec.id);
  const otherRows = data.equipment.filter(e => e.category === 'other');

  return (
    <div className="sr-page sr-page--editor">
      {/* Header */}
      <div className="sr-editor-bar">
        <button type="button" className="sr-icon-btn sr-icon-btn--lg" onClick={back} title="All ships" aria-label="Back to all ships"><Icon iconName="Back" /></button>
        <span className="sr-ship-avatar"><Icon iconName="Ferry" /></span>
        <div className="sr-editor-bar__title">
          <h2>{isNew ? (data.name.trim() || 'New Ship') : data.name}</h2>
          <div className="sr-editor-bar__meta">
            {isNew ? <span className="sr-chip sr-chip--info"><Icon iconName="Add" /> New registration</span> : (
              <>
                {data.imo && <span className="sr-chip"><Icon iconName="NumberSymbol" /> IMO {data.imo}</span>}
                {data.vessel_type && <span className="sr-chip"><Icon iconName="Ferry" /> {data.vessel_type}</span>}
                {data.flag && <span className="sr-chip"><Icon iconName="Flag" /> {data.flag}</span>}
                {data.updated_at && <span className="sr-editor-bar__saved"><Icon iconName="Clock" /> Saved {fmtDateTime(data.updated_at)}</span>}
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="sr-editor-bar__actions">
            {dirty && !isNew && <span className="sr-chip sr-chip--warn"><Icon iconName="Edit" /> Unsaved</span>}
            {!isNew && (
              <button type="button" className="sa-btn sa-btn--secondary" disabled={!dirty || saving} onClick={() => setData(JSON.parse(initial))}>
                <Icon iconName="Undo" /> Discard
              </button>
            )}
            <button type="button" className="sa-btn sa-btn--primary" disabled={!dirty || saving} onClick={() => void save()}>
              <Icon iconName={saving ? 'Sync' : isNew ? 'CheckMark' : 'Save'} /> {saving ? 'Saving…' : isNew ? 'Register Ship' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {!canEdit && <div className="sr-alert sr-alert--info"><Icon iconName="Info" /> View only. An administrator can edit the ship register.</div>}
      {notice && <div className="sr-alert sr-alert--success"><Icon iconName="CompletedSolid" /> {notice}<button type="button" className="sr-alert__close" aria-label="Dismiss" onClick={() => setNotice('')}><Icon iconName="Cancel" /></button></div>}
      {error && (
        <div className="sr-alert sr-alert--error">
          <Icon iconName="ErrorBadge" />
          <div>
            <strong>{error.message}</strong>
            {error.errors.length > 0 && <ul>{error.errors.map(e => <li key={e}>{e}</li>)}</ul>}
          </div>
          <button type="button" className="sr-alert__close" aria-label="Dismiss" onClick={() => setError(null)}><Icon iconName="Cancel" /></button>
        </div>
      )}

      {/* Tabs */}
      <nav className="sr-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`sr-tab${tab === t.id ? ' sr-tab--active' : ''}${tabDone[t.id] ? ' sr-tab--done' : ''}`} onClick={() => setTab(t.id)}>
            <span className="sr-tab__icon"><Icon iconName={tabDone[t.id] ? 'CheckMark' : t.icon} /></span>
            <span className="sr-tab__text">
              <span className="sr-tab__label">{i + 1}. {t.label}{tabBadge[t.id] ? <span className="sr-tab__badge">{tabBadge[t.id]}</span> : null}</span>
              <span className="sr-tab__hint">{t.hint}</span>
            </span>
          </button>
        ))}
      </nav>

      <section className="sr-panel">
        {tab === 'particulars' && (
          <div className="sr-grid">
            <Field label="Ship Name" icon="Ferry" required={isNew} value={data.name} onChange={isNew ? set('name') : undefined}
              placeholder="e.g. GCL Yamuna" hint={isNew && siteKey ? 'A SharePoint folder is created for this ship' : undefined} />
            <Field label="IMO No" icon="NumberSymbol" required={isNew} value={data.imo} onChange={set('imo')} placeholder="7 digits" inputMode="numeric" />
            <label className="sr-field">
              <span className="sr-field__label">Type of Ship</span>
              {canEdit ? (
                <CustomDropdown options={shipTypeOptions} selectedKey={data.vessel_type || undefined} placeholder="Select type"
                  onChange={key => setData(d => (d ? { ...d, vessel_type: String(key) } : d))} />
              ) : <span className="sr-inputbox sr-inputbox--ro"><Icon iconName="Ferry" className="sr-inputbox__icon" /><input readOnly value={data.vessel_type} /></span>}
            </label>
            <Field label="Flag" icon="Flag" value={data.flag} onChange={set('flag')} placeholder="e.g. India" />
            <Field label="Port of Registry" icon="Location" value={data.port_of_registry} onChange={set('port_of_registry')} placeholder="e.g. Mumbai" />
            <Field label="Official No" icon="Tag" value={data.official_no} onChange={set('official_no')} />
            <Field label="MMSI" icon="Globe" value={data.mmsi} onChange={set('mmsi')} placeholder="9 digits" inputMode="numeric" />
            <Field label="Call Sign" icon="Megaphone" value={data.call_sign} onChange={set('call_sign')} />
            <Field label="Gross Tonnage (GT)" icon="Package" value={data.gross_tonnage} onChange={set('gross_tonnage')} inputMode="decimal" />
            <Field label="Net Tonnage (NT)" icon="Package" value={data.net_tonnage} onChange={set('net_tonnage')} inputMode="decimal" />
            <Field label="Deadweight (MT)" icon="Package" value={data.deadweight} onChange={set('deadweight')} inputMode="decimal" />
            <Field label="Class" icon="Ribbon" value={data.class_society} onChange={set('class_society')} placeholder="e.g. IRS, DNV, ABS" />
            <Field label="P&I Club" icon="Health" value={data.p_and_i} onChange={set('p_and_i')} />
            <Field label="H&M Insurer" icon="Shield" value={data.h_and_m} onChange={set('h_and_m')} />
          </div>
        )}

        {tab === 'managers' && (
          <div className="sr-managers">
            {managerCard('tech_manager', 'Tech Manager', 'Settings')}
            {managerCard('crew_manager', 'Crew Manager', 'People')}
          </div>
        )}

        {tab === 'machinery' && (
          <div className="sr-machinery">
            <div className="sr-seg" role="tablist">
              {ENGINE_SECTIONS.map(x => (
                <button key={x.id} type="button" role="tab" aria-selected={engine === x.id}
                  className={`sr-seg__btn${engine === x.id ? ' sr-seg__btn--active' : ''}`} onClick={() => setEngine(x.id)}>
                  <Icon iconName={ENGINE_ICONS[x.id]} /> {x.title}
                  <span className="sr-seg__count">{filledRows(x.id)}</span>
                </button>
              ))}
            </div>
            {engineRows.length === 0 ? (
              <DmsEmptyState icon={ENGINE_ICONS[sec.id]} title={`No ${sec.title.toLowerCase()} yet`}>
                {canEdit ? 'Use Add Unit to enter make, model, serial number, power and RPM.' : 'Nothing recorded.'}
              </DmsEmptyState>
            ) : (
              <div className="sr-rows">
                <div className="sr-rows__head sr-rows--engine">
                  <span>#</span><span>Make</span><span>Model</span><span>Serial Number</span><span>Power</span><span>RPM</span><span />
                </div>
                {engineRows.map((row, i) => (
                  <div key={row.key} className="sr-rows__row sr-rows--engine">
                    <span className="sr-rows__no">{i + 1}</span>
                    {cell(row, 'make', 'Make', 'e.g. MAN B&W')}
                    {cell(row, 'model', 'Model')}
                    {cell(row, 'serial_number', 'Serial Number')}
                    <span className="sr-power">
                      {cell(row, 'power', 'Power', '0', 'decimal')}
                      {canEdit ? (
                        <select className="sr-input sr-input--unit" aria-label="Power unit" value={row.power_unit || sec.unit}
                          onChange={e => updateRow(row.key, 'power_unit', e.target.value)}>
                          {unitOptions.map(u => <option key={u.key} value={u.key}>{u.text}</option>)}
                        </select>
                      ) : <span className="sr-unit">{row.power_unit || sec.unit}</span>}
                    </span>
                    {cell(row, 'rpm', 'RPM', '0', 'decimal')}
                    {removeBtn(row) || <span />}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <button type="button" className="sr-add-row" onClick={() => addRow(sec.id, sec.unit)}>
                <Icon iconName="CirclePlus" /> Add Unit to {sec.title}
              </button>
            )}
          </div>
        )}

        {tab === 'equipment' && (
          <div className="sr-machinery">
            {otherRows.length === 0 ? (
              <DmsEmptyState icon="Repair" title="No other equipment yet">
                {canEdit ? 'Use Add Equipment to pick an item (boiler, purifier, crane…) and enter its make, model and specification.' : 'Nothing recorded.'}
              </DmsEmptyState>
            ) : (
              <div className="sr-rows">
                <div className="sr-rows__head sr-rows--other">
                  <span>#</span><span>Equipment Name</span><span>Make</span><span>Model</span><span>Specification</span><span />
                </div>
                {otherRows.map((row, i) => (
                  <div key={row.key} className="sr-rows__row sr-rows--other">
                    <span className="sr-rows__no">{i + 1}</span>
                    {canEdit ? (
                      <CustomDropdown options={nameOptions} selectedKey={row.equipment_name || undefined} placeholder="Select equipment"
                        onChange={key => updateRow(row.key, 'equipment_name', String(key))} />
                    ) : <span className="sr-rows__text">{row.equipment_name}</span>}
                    {cell(row, 'make', 'Make')}
                    {cell(row, 'model', 'Model')}
                    {cell(row, 'specification', 'Specification', 'Capacity, rating, type…')}
                    {removeBtn(row) || <span />}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <button type="button" className="sr-add-row" onClick={() => addRow('other', '')}>
                <Icon iconName="CirclePlus" /> Add Equipment
              </button>
            )}
          </div>
        )}

        {/* Step navigation */}
        <footer className="sr-panel__foot">
          <button type="button" className="sa-btn sa-btn--secondary" disabled={tabIndex === 0} onClick={() => setTab(TABS[tabIndex - 1].id)}>
            <Icon iconName="ChevronLeft" /> Previous
          </button>
          <span className="sr-steps">{TABS.map(t => <span key={t.id} className={`sr-steps__dot${t.id === tab ? ' sr-steps__dot--on' : ''}`} />)}</span>
          {tabIndex < TABS.length - 1 ? (
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setTab(TABS[tabIndex + 1].id)}>
              Next <Icon iconName="ChevronRight" />
            </button>
          ) : canEdit ? (
            <button type="button" className="sa-btn sa-btn--primary" disabled={!dirty || saving} onClick={() => void save()}>
              <Icon iconName={isNew ? 'CheckMark' : 'Save'} /> {saving ? 'Saving…' : isNew ? 'Register Ship' : 'Save'}
            </button>
          ) : <span />}
        </footer>
      </section>
    </div>
  );
}

// ── List page ───────────────────────────────────────────────────────────────
function certTone(held: number, total: number): string {
  if (!total) return 'none';
  const pct = held / total;
  return pct >= 1 ? 'ok' : pct >= 0.5 ? 'warn' : 'bad';
}

export function ShipRegisterPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [items, setItems] = React.useState<Summary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  // number = existing ship, 'new' = register a new ship, null = list
  const [selected, setSelected] = React.useState<number | 'new' | null>(null);
  const [options, setOptions] = React.useState<Options | null>(null);
  const isAdmin = host._isAdmin();

  const loadOptions = React.useCallback(async () => {
    try {
      const res = await fetch(`${host._base()}/api/ship-register/options`, { headers: host._headers(), cache: 'no-store' });
      if (res.ok) setOptions(await res.json());
    } catch { /* dropdowns fall back to free values */ }
  }, [host]);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${host._base()}/api/ship-register`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error((await readError(res)).message);
      setItems((await res.json()).items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => { void load(); void loadOptions(); }, [load, loadOptions]);

  if (selected !== null) {
    return (
      <RegisterEditor host={host} vesselId={selected === 'new' ? null : selected} options={options} canEdit={isAdmin}
        onBack={saved => { setSelected(null); if (saved) void load(); }} />
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = items.filter(i => !needle || [i.name, i.imo, i.flag, i.vessel_type, i.class_society, i.tech_manager, i.crew_manager]
    .some(v => (v || '').toLowerCase().includes(needle)));
  const sum = (f: (i: Summary) => number): number => items.reduce((a, i) => a + f(i), 0);
  const certHeld = sum(i => i.cert_held);
  const certTotal = sum(i => i.cert_total);
  const docsKnown = items.some(i => i.documents !== null);

  const tiles = [
    { icon: 'Ferry', label: 'Ships registered', value: String(items.length), tone: 'accent' },
    { icon: 'Certificate', label: 'Certificates uploaded', value: certTotal ? `${certHeld} / ${certTotal}` : '-', tone: certTone(certHeld, certTotal) },
    { icon: 'Ribbon', label: 'Optional uploaded', value: String(sum(i => i.cert_optional)), tone: 'accent' },
    { icon: 'FabricFolder', label: 'Documents', value: docsKnown ? String(sum(i => i.documents || 0)) : '-', tone: 'accent' },
  ];

  const certCell = (i: Summary): React.ReactElement => {
    if (!i.cert_total) return <span className="sr-muted">-</span>;
    const pct = Math.round((i.cert_held / i.cert_total) * 100);
    const tone = certTone(i.cert_held, i.cert_total);
    return (
      <span className="sr-cert" title={`${i.cert_held} of ${i.cert_total} mandatory certificates uploaded (${pct}%)`}>
        <span className="sr-progress"><span className={`sr-progress__bar sr-progress__bar--${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} /></span>
        <span className={`sr-cert__text sr-cert__text--${tone}`}>{i.cert_held} of {i.cert_total}</span>
      </span>
    );
  };

  return (
    <div className="sr-page">
      <DmsPageHeader title="Ship Register" subtitle="Register ships with their particulars, managers, machinery and equipment.">
        <button type="button" className="sa-btn sa-btn--ghost" onClick={() => void load()} title="Refresh" aria-label="Refresh">
          <Icon iconName="Refresh" />
        </button>
        {isAdmin && (
          <button type="button" className="sa-btn sa-btn--primary" onClick={() => setSelected('new')}>
            <Icon iconName="Add" /> Add Ship
          </button>
        )}
      </DmsPageHeader>

      <div className="sr-tiles">
        {tiles.map(t => (
          <div key={t.label} className={`sr-tile sr-tile--${t.tone}`}>
            <span className="sr-tile__icon"><Icon iconName={t.icon} /></span>
            <span className="sr-tile__text">
              <span className="sr-tile__value">{loading ? '…' : t.value}</span>
              <span className="sr-tile__label">{t.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="sr-toolbar">
        <div className="sr-search">
          <Icon iconName="Search" />
          <input placeholder="Search ship name, IMO, type, flag, manager…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button type="button" className="sr-search__clear" aria-label="Clear search" onClick={() => setQ('')}><Icon iconName="Cancel" /></button>}
        </div>
      </div>

      {error && <div className="sr-alert sr-alert--error"><Icon iconName="ErrorBadge" /> {error}</div>}

      {loading ? <DmsLoadingState label="Loading ship register…" /> : shown.length === 0 ? (
        <DmsEmptyState icon="Ferry" title={items.length ? 'No ships match your search' : 'No ships registered yet'}>
          {items.length ? 'Try a different search.' : 'Use Add Ship to register the first ship with its particulars, managers, machinery and equipment.'}
        </DmsEmptyState>
      ) : (
        <>
          {/* Wide screens: table */}
          <div className="sr-table-card sr-only-wide">
            <table className="sr-table sr-table--list">
              <thead>
                <tr>
                  <th><Icon iconName="Ferry" /> Ship Name</th>
                  <th><Icon iconName="NumberSymbol" /> IMO No</th>
                  <th className="sr-num"><Icon iconName="Certificate" /> Certificates Required</th>
                  <th><Icon iconName="CloudUpload" /> Uploaded</th>
                  <th className="sr-num"><Icon iconName="Ribbon" /> Optional</th>
                  <th className="sr-num"><Icon iconName="FabricFolder" /> Documents</th>
                  <th className="sr-col-x" />
                </tr>
              </thead>
              <tbody>
                {shown.map(i => (
                  <tr key={i.vessel_id} className="sr-row" onClick={() => setSelected(i.vessel_id)} tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setSelected(i.vessel_id); }}>
                    <td>
                      <span className="sr-shipcell">
                        <span className="sr-ship-avatar sr-ship-avatar--sm"><Icon iconName="Ferry" /></span>
                        <span>
                          <span className="sr-row__name">{i.name}</span>
                          <span className="sr-row__sub">{[i.vessel_type, i.flag].filter(Boolean).join(' · ') || '-'}</span>
                        </span>
                      </span>
                    </td>
                    <td>{i.imo ? <span className="sr-mono">{i.imo}</span> : <span className="sr-chip sr-chip--warn">Missing</span>}</td>
                    <td className="sr-num"><strong>{i.cert_total || '-'}</strong></td>
                    <td>{certCell(i)}</td>
                    <td className="sr-num">{i.cert_optional}</td>
                    <td className="sr-num">{i.documents === null ? <span className="sr-muted" title="Counted from SharePoint once it is connected">-</span> : i.documents}</td>
                    <td className="sr-col-x"><Icon iconName="ChevronRight" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: cards */}
          <div className="sr-cards sr-only-narrow">
            {shown.map(i => (
              <button key={i.vessel_id} type="button" className="sr-shipcard" onClick={() => setSelected(i.vessel_id)}>
                <span className="sr-shipcard__head">
                  <span className="sr-ship-avatar sr-ship-avatar--sm"><Icon iconName="Ferry" /></span>
                  <span className="sr-shipcard__title">
                    <span className="sr-row__name">{i.name}</span>
                    <span className="sr-row__sub"><Icon iconName="NumberSymbol" /> {i.imo || 'IMO missing'}</span>
                  </span>
                  <Icon iconName="ChevronRight" className="sr-shipcard__chev" />
                </span>
                <span className="sr-shipcard__cert">{certCell(i)}</span>
                <span className="sr-shipcard__stats">
                  <span><Icon iconName="Certificate" /> {i.cert_total || '-'} required</span>
                  <span><Icon iconName="Ribbon" /> {i.cert_optional} optional</span>
                  <span><Icon iconName="FabricFolder" /> {i.documents === null ? '-' : i.documents} docs</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
