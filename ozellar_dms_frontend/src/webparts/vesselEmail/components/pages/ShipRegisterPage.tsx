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
}

interface Options {
  ship_types: string[];
  equipment_names: string[];
  categories: Array<{ id: Category; label: string; power_unit: string | null }>;
  power_units: string[];
}

interface MasterItem { id: number; name: string; active: boolean; used_count: number }

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
function Field(props: {
  label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean;
  placeholder?: string; type?: string; wide?: boolean; hint?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel';
}): React.ReactElement {
  return (
    <label className={`sr-field${props.wide ? ' sr-field--wide' : ''}`}>
      <span className="sr-field__label">{props.label}</span>
      <input
        className="sr-input"
        type={props.type || 'text'}
        value={props.value}
        readOnly={props.readOnly || !props.onChange}
        placeholder={props.readOnly ? '' : props.placeholder}
        inputMode={props.inputMode}
        onChange={e => props.onChange && props.onChange(e.target.value)}
      />
      {props.hint && <span className="sr-field__hint">{props.hint}</span>}
    </label>
  );
}

function Section(props: { title: string; icon: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="sr-card">
      <header className="sr-card__head">
        <span className="sr-card__icon"><Icon iconName={props.icon} /></span>
        <div className="sr-card__titles">
          <h3 className="sr-card__title">{props.title}</h3>
          {props.subtitle && <p className="sr-card__subtitle">{props.subtitle}</p>}
        </div>
        {props.actions && <div className="sr-card__actions">{props.actions}</div>}
      </header>
      <div className="sr-card__body">{props.children}</div>
    </section>
  );
}

// ── Equipment Master (admin) ────────────────────────────────────────────────
function EquipmentMasterModal(props: { host: VesselEmail; onClose: (changed: boolean) => void }): React.ReactElement {
  const { host } = props;
  const [items, setItems] = React.useState<MasterItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState('');
  const [editing, setEditing] = React.useState<{ id: number; name: string } | null>(null);
  const [error, setError] = React.useState('');
  const [changed, setChanged] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${host._base()}/api/ship-register/equipment-master?include_inactive=true`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error((await readError(res)).message);
      setItems((await res.json()).items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [host]);
  React.useEffect(() => { void load(); }, [load]);

  const send = async (url: string, method: string, body: object): Promise<boolean> => {
    setError('');
    const res = await fetch(`${host._base()}${url}`, { method, headers: host._headers(), body: JSON.stringify(body) });
    if (!res.ok) { setError((await readError(res)).message); return false; }
    setChanged(true);
    await load();
    return true;
  };

  const add = async (): Promise<void> => {
    if (!name.trim()) return;
    if (await send('/api/ship-register/equipment-master', 'POST', { name })) setName('');
  };

  const shown = items.filter(i => !filter.trim() || i.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="sr-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(changed); }}>
      <div className="sr-modal" role="dialog" aria-label="Equipment Master">
        <header className="sr-modal__head">
          <div>
            <h3 className="sr-modal__title">Equipment Master</h3>
            <p className="sr-modal__subtitle">Names offered under "Add New Equipment" on every vessel.</p>
          </div>
          <button type="button" className="sr-icon-btn" onClick={() => props.onClose(changed)} aria-label="Close"><Icon iconName="Cancel" /></button>
        </header>
        <div className="sr-modal__add">
          <input className="sr-input" placeholder="New equipment name, e.g. Shaft Generator" value={name}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
          <button type="button" className="sa-btn sa-btn--primary" disabled={!name.trim()} onClick={() => void add()}>
            <Icon iconName="Add" /> Add
          </button>
        </div>
        {error && <div className="sr-alert sr-alert--error"><Icon iconName="ErrorBadge" /> {error}</div>}
        <input className="sr-input sr-modal__filter" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
        <div className="sr-modal__list">
          {loading ? <DmsLoadingState label="Loading equipment names…" /> : shown.map(item => (
            <div key={item.id} className={`sr-master-row${item.active ? '' : ' sr-master-row--off'}`}>
              {editing && editing.id === item.id ? (
                <>
                  <input className="sr-input" autoFocus value={editing.name} onChange={e => setEditing({ id: item.id, name: e.target.value })}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && await send(`/api/ship-register/equipment-master/${item.id}`, 'PATCH', { name: editing.name })) setEditing(null);
                      if (e.key === 'Escape') setEditing(null);
                    }} />
                  <button type="button" className="sr-icon-btn" title="Save" onClick={async () => {
                    if (await send(`/api/ship-register/equipment-master/${item.id}`, 'PATCH', { name: editing.name })) setEditing(null);
                  }}><Icon iconName="CheckMark" /></button>
                  <button type="button" className="sr-icon-btn" title="Cancel" onClick={() => setEditing(null)}><Icon iconName="Cancel" /></button>
                </>
              ) : (
                <>
                  <span className="sr-master-row__name">{item.name}</span>
                  {item.used_count > 0 && <span className="sr-chip" title="Vessels' equipment rows using this name">{item.used_count} in use</span>}
                  {!item.active && <span className="sr-chip sr-chip--muted">Inactive</span>}
                  <button type="button" className="sr-icon-btn" title="Rename" onClick={() => setEditing({ id: item.id, name: item.name })}><Icon iconName="Edit" /></button>
                  <button type="button" className="sr-icon-btn" title={item.active ? 'Deactivate (hide from the list)' : 'Activate'}
                    onClick={() => void send(`/api/ship-register/equipment-master/${item.id}`, 'PATCH', { active: !item.active })}>
                    <Icon iconName={item.active ? 'Hide3' : 'View'} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Register editor (one vessel) ────────────────────────────────────────────
function RegisterEditor(props: {
  host: VesselEmail; vesselId: number | null; options: Options | null; canEdit: boolean;
  onBack: (saved: boolean) => void;
}): React.ReactElement {
  const { host, options, canEdit } = props;
  // vesselId null = registering a new vessel; it becomes the new id once the vessel is created.
  const [vesselId, setVesselId] = React.useState<number | null>(props.vesselId);
  const isNew = vesselId === null;
  const sites = host.state.documentSites || [];
  const [siteKey, setSiteKey] = React.useState<string>(() => {
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
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    props.onBack(savedOnce);
  };

  const save = async (): Promise<void> => {
    if (!data) return;
    const creating = vesselId === null;
    if (creating) {
      const errors: string[] = [];
      if (!data.name.trim()) errors.push('Ship Name is required.');
      if (!/^\d{7}$/.test(data.imo.trim())) errors.push('IMO No must be exactly 7 digits.');
      if (sites.length > 0 && !siteKey) errors.push('Select the SharePoint site for this vessel\'s documents.');
      if (errors.length) { setError({ message: 'Please fix the following', errors }); return; }
    }
    setSaving(true); setError(null); setNotice('');
    try {
      const { equipment, vessel_id, name, updated_at, updated_by_email, ...fields } = data;
      void vessel_id; void updated_at; void updated_by_email;
      const body: any = { ...fields, equipment: equipment.map(({ key, ...rest }) => { void key; return rest; }) };
      // New vessel: one call creates the vessel (and its SharePoint folder in real mode) and saves the register.
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
      setNotice(creating ? `Vessel "${reg.name}" registered.` : 'Ship register saved.');
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
        <button type="button" className="sa-btn sa-btn--link" onClick={() => props.onBack(false)}><Icon iconName="Back" /> All vessels</button>
        <div className="sr-alert sr-alert--error"><Icon iconName="ErrorBadge" /> {error?.message || 'Could not load this vessel.'}</div>
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

  const managerRow = (prefix: 'tech_manager' | 'crew_manager', label: string): React.ReactElement => (
    <div className="sr-manager">
      <div className="sr-manager__label">{label}</div>
      <div className="sr-grid sr-grid--manager">
        <Field label="Company / Name" value={data[prefix]} onChange={set(prefix)} placeholder="e.g. Ozellar Ship Management" />
        <Field label="PIC Email" type="email" inputMode="email" value={data[`${prefix}_email` as keyof Register] as string} onChange={set(`${prefix}_email` as keyof Register)} placeholder="pic@company.com" />
        <Field label="Email 2" type="email" inputMode="email" value={data[`${prefix}_email2` as keyof Register] as string} onChange={set(`${prefix}_email2` as keyof Register)} />
        <Field label="Phone" type="tel" inputMode="tel" value={data[`${prefix}_phone` as keyof Register] as string} onChange={set(`${prefix}_phone` as keyof Register)} placeholder="+65 …" />
        <Field label="Phone 2" type="tel" inputMode="tel" value={data[`${prefix}_phone2` as keyof Register] as string} onChange={set(`${prefix}_phone2` as keyof Register)} />
      </div>
    </div>
  );

  const cell = (row: Equipment, field: keyof Equipment, placeholder = '', inputMode?: 'decimal'): React.ReactElement => (
    <input className="sr-input sr-input--cell" value={row[field]} readOnly={!canEdit} placeholder={canEdit ? placeholder : ''}
      inputMode={inputMode} onChange={e => updateRow(row.key, field, e.target.value)} />
  );

  return (
    <div className="sr-page">
      <div className="sr-editor-bar">
        <button type="button" className="sa-btn sa-btn--link" onClick={back}><Icon iconName="Back" /> All vessels</button>
        <div className="sr-editor-bar__title">
          <h2>{isNew ? (data.name.trim() || 'New vessel') : data.name}</h2>
          <span className="sr-editor-bar__meta">
            {isNew ? 'Fill in the template and register the vessel' : data.imo ? `IMO ${data.imo}` : 'No IMO yet'}
            {data.updated_at && ` · Last saved ${fmtDateTime(data.updated_at)}${data.updated_by_email ? ` by ${data.updated_by_email}` : ''}`}
          </span>
        </div>
        {canEdit && (
          <div className="sr-editor-bar__actions">
            {dirty && !isNew && <span className="sr-chip sr-chip--warn">Unsaved changes</span>}
            {!isNew && <button type="button" className="sa-btn sa-btn--secondary" disabled={!dirty || saving} onClick={() => setData(JSON.parse(initial))}>Discard</button>}
            <button type="button" className="sa-btn sa-btn--primary" disabled={!dirty || saving} onClick={() => void save()}>
              <Icon iconName={isNew ? 'Add' : 'Save'} /> {saving ? 'Saving…' : isNew ? 'Register Vessel' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {!canEdit && <div className="sr-alert sr-alert--info"><Icon iconName="Info" /> View only. An administrator can edit the ship register.</div>}
      {notice && <div className="sr-alert sr-alert--success"><Icon iconName="CheckMark" /> {notice}<button type="button" className="sr-alert__close" onClick={() => setNotice('')}><Icon iconName="Cancel" /></button></div>}
      {error && (
        <div className="sr-alert sr-alert--error">
          <Icon iconName="ErrorBadge" />
          <div>
            <strong>{error.message}</strong>
            {error.errors.length > 0 && <ul>{error.errors.map(e => <li key={e}>{e}</li>)}</ul>}
          </div>
        </div>
      )}

      <Section title="Ship Particulars" icon="Ferry" subtitle="Registration, tonnage, class and insurance">
        <div className="sr-grid">
          <Field label={isNew ? 'IMO No *' : 'IMO No'} value={data.imo} onChange={set('imo')} placeholder="7 digits" inputMode="numeric" />
          {isNew
            ? <Field label="Ship Name *" value={data.name} onChange={set('name')} placeholder="e.g. Ozellar Star" />
            : <Field label="Ship Name" value={data.name} readOnly hint="Rename the vessel in Vessel Master" />}
          <Field label="Flag" value={data.flag} onChange={set('flag')} placeholder="e.g. Singapore" />
          <Field label="Port of Registry" value={data.port_of_registry} onChange={set('port_of_registry')} />
          <Field label="Official No" value={data.official_no} onChange={set('official_no')} />
          <Field label="MMSI" value={data.mmsi} onChange={set('mmsi')} placeholder="9 digits" inputMode="numeric" />
          <Field label="Call Sign" value={data.call_sign} onChange={set('call_sign')} />
          <label className="sr-field">
            <span className="sr-field__label">Type of Ship</span>
            {canEdit ? (
              <CustomDropdown options={shipTypeOptions} selectedKey={data.vessel_type || undefined} placeholder="Select type"
                onChange={key => setData(d => (d ? { ...d, vessel_type: String(key) } : d))} />
            ) : <input className="sr-input" readOnly value={data.vessel_type} />}
          </label>
          <Field label="Gross Tonnage (GT)" value={data.gross_tonnage} onChange={set('gross_tonnage')} inputMode="decimal" />
          <Field label="Net Tonnage (NT)" value={data.net_tonnage} onChange={set('net_tonnage')} inputMode="decimal" />
          <Field label="Deadweight (MT)" value={data.deadweight} onChange={set('deadweight')} inputMode="decimal" />
          <Field label="Class" value={data.class_society} onChange={set('class_society')} placeholder="e.g. DNV, ABS, LR" />
          <Field label="P&I Club" value={data.p_and_i} onChange={set('p_and_i')} />
          <Field label="H&M Insurer" value={data.h_and_m} onChange={set('h_and_m')} />
          {isNew && sites.length > 0 && (
            <label className="sr-field sr-field--wide">
              <span className="sr-field__label">SharePoint Site *</span>
              <CustomDropdown options={sites.map(x => ({ key: x.site_key, text: x.sp_site_name || x.site_key }))}
                selectedKey={siteKey || undefined} placeholder="Select site" onChange={key => setSiteKey(String(key))} />
              <span className="sr-field__hint">The vessel's document folder is created in this site.</span>
            </label>
          )}
        </div>
      </Section>

      <Section title="Managers" icon="People" subtitle="Technical and crew management contacts">
        {managerRow('tech_manager', 'Tech Manager')}
        {managerRow('crew_manager', 'Crew Manager')}
      </Section>

      {ENGINE_SECTIONS.map(sec => {
        const rows = data.equipment.filter(e => e.category === sec.id);
        return (
          <Section key={sec.id} title={sec.title} icon={sec.icon} subtitle={`${sec.hint} · ${rows.length} unit${rows.length === 1 ? '' : 's'}`}
            actions={canEdit && (
              <button type="button" className="sa-btn sa-btn--secondary" onClick={() => addRow(sec.id, sec.unit)}><Icon iconName="Add" /> Add</button>
            )}>
            {rows.length === 0 ? (
              <p className="sr-empty-line">No {sec.title.toLowerCase()} added yet.</p>
            ) : (
              <div className="sr-table-wrap">
                <table className="sr-table">
                  <thead>
                    <tr><th className="sr-col-no">#</th><th>Make</th><th>Model</th><th>Serial Number</th><th className="sr-col-power">Power</th><th className="sr-col-rpm">RPM</th>{canEdit && <th className="sr-col-x" />}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.key}>
                        <td className="sr-col-no">{i + 1}</td>
                        <td>{cell(row, 'make', 'e.g. MAN B&W')}</td>
                        <td>{cell(row, 'model')}</td>
                        <td>{cell(row, 'serial_number')}</td>
                        <td className="sr-col-power">
                          <div className="sr-power">
                            {cell(row, 'power', '0', 'decimal')}
                            {canEdit ? (
                              <select className="sr-input sr-input--unit" value={row.power_unit || sec.unit}
                                onChange={e => updateRow(row.key, 'power_unit', e.target.value)}>
                                {unitOptions.map(u => <option key={u.key} value={u.key}>{u.text}</option>)}
                              </select>
                            ) : <span className="sr-unit">{row.power_unit || sec.unit}</span>}
                          </div>
                        </td>
                        <td className="sr-col-rpm">{cell(row, 'rpm', '0', 'decimal')}</td>
                        {canEdit && (
                          <td className="sr-col-x">
                            <button type="button" className="sr-icon-btn" title="Remove" onClick={() => removeRow(row.key)}><Icon iconName="Delete" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })}

      {(() => {
        const rows = data.equipment.filter(e => e.category === 'other');
        return (
          <Section title="Other Equipment" icon="Repair" subtitle={`Picked from the Equipment Master list · ${rows.length} item${rows.length === 1 ? '' : 's'}`}
            actions={canEdit && (
              <button type="button" className="sa-btn sa-btn--secondary" onClick={() => addRow('other', '')}><Icon iconName="Add" /> Add New Equipment</button>
            )}>
            {rows.length === 0 ? (
              <p className="sr-empty-line">No other equipment added yet.</p>
            ) : (
              <div className="sr-table-wrap">
                <table className="sr-table">
                  <thead>
                    <tr><th className="sr-col-no">#</th><th className="sr-col-name">Equipment Name</th><th>Make</th><th>Model</th><th className="sr-col-spec">Specification</th>{canEdit && <th className="sr-col-x" />}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.key}>
                        <td className="sr-col-no">{i + 1}</td>
                        <td className="sr-col-name">
                          {canEdit ? (
                            <CustomDropdown options={nameOptions} selectedKey={row.equipment_name || undefined} placeholder="Select equipment"
                              onChange={key => updateRow(row.key, 'equipment_name', String(key))} />
                          ) : <span>{row.equipment_name}</span>}
                        </td>
                        <td>{cell(row, 'make')}</td>
                        <td>{cell(row, 'model')}</td>
                        <td className="sr-col-spec">{cell(row, 'specification', 'Capacity, rating, type…')}</td>
                        {canEdit && (
                          <td className="sr-col-x">
                            <button type="button" className="sr-icon-btn" title="Remove" onClick={() => removeRow(row.key)}><Icon iconName="Delete" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })()}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export function ShipRegisterPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [items, setItems] = React.useState<Summary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  // number = existing vessel, 'new' = register a new vessel, null = list
  const [selected, setSelected] = React.useState<number | 'new' | null>(null);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [masterOpen, setMasterOpen] = React.useState(false);
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
  const complete = items.filter(i => i.filled === i.total_fields).length;

  return (
    <div className="sr-page">
      <DmsPageHeader title="Ship Register" subtitle="Ship particulars, managers, engines and equipment for every vessel.">
        {isAdmin && (
          <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setMasterOpen(true)}>
            <Icon iconName="BulletedList" /> Equipment Master
          </button>
        )}
        <button type="button" className="sa-btn sa-btn--ghost" onClick={() => void load()} title="Refresh" aria-label="Refresh">
          <Icon iconName="Refresh" />
        </button>
        {isAdmin && (
          <button type="button" className="sa-btn sa-btn--primary" onClick={() => setSelected('new')}>
            <Icon iconName="Add" /> Register New Vessel
          </button>
        )}
      </DmsPageHeader>

      <div className="sr-toolbar">
        <div className="sr-search">
          <Icon iconName="Search" />
          <input placeholder="Search vessel, IMO, flag, class, manager…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="sr-stats">
          <span className="sr-chip">{items.length} vessels</span>
          <span className="sr-chip sr-chip--ok">{complete} complete</span>
        </div>
      </div>

      {error && <div className="sr-alert sr-alert--error"><Icon iconName="ErrorBadge" /> {error}</div>}

      {loading ? <DmsLoadingState label="Loading ship register…" /> : shown.length === 0 ? (
        <DmsEmptyState icon="Ferry" title={items.length ? 'No vessels match your search' : 'No vessels yet'}>
          {items.length ? 'Try a different search.' : 'Use Register New Vessel to add the first one.'}
        </DmsEmptyState>
      ) : (
        <div className="sr-table-card">
          <table className="sr-table sr-table--list">
            <thead>
              <tr>
                <th>Vessel</th><th>IMO</th><th>Type</th><th>Flag</th><th>Class</th><th>DWT</th>
                <th>Tech Manager</th><th>Machinery</th><th>Completed</th><th className="sr-col-x" />
              </tr>
            </thead>
            <tbody>
              {shown.map(i => {
                const pct = Math.round((i.filled / Math.max(1, i.total_fields)) * 100);
                return (
                  <tr key={i.vessel_id} className="sr-row" onClick={() => setSelected(i.vessel_id)} tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setSelected(i.vessel_id); }}>
                    <td className="sr-row__name">{i.name}</td>
                    <td>{i.imo || <span className="sr-muted">-</span>}</td>
                    <td>{i.vessel_type || <span className="sr-muted">-</span>}</td>
                    <td>{i.flag || <span className="sr-muted">-</span>}</td>
                    <td>{i.class_society || <span className="sr-muted">-</span>}</td>
                    <td>{i.deadweight ? Number(i.deadweight).toLocaleString('en-US') : <span className="sr-muted">-</span>}</td>
                    <td>{i.tech_manager || <span className="sr-muted">-</span>}</td>
                    <td title={`Main ${i.equipment_counts.main_engine || 0} · Aux ${i.equipment_counts.aux_engine || 0} · Emergency ${i.equipment_counts.emergency_generator || 0} · Other ${i.equipment_counts.other || 0}`}>
                      {i.equipment_total ? `${i.equipment_total} item${i.equipment_total === 1 ? '' : 's'}` : <span className="sr-muted">None</span>}
                    </td>
                    <td>
                      <div className="sr-progress" title={`${i.filled} of ${i.total_fields} particulars filled`}>
                        <div className={`sr-progress__bar${pct === 100 ? ' sr-progress__bar--done' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sr-progress__text">{pct}%</span>
                    </td>
                    <td className="sr-col-x"><Icon iconName="ChevronRight" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {masterOpen && (
        <EquipmentMasterModal host={host} onClose={changed => { setMasterOpen(false); if (changed) void loadOptions(); }} />
      )}
    </div>
  );
}
