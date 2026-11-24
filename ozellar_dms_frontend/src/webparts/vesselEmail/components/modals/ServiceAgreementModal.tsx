import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { VesselMultiSelect } from '../VesselMultiSelect';

// Styles: styles/modals/_service-agreement.scss

export interface ContractParty {
  role: 'first' | 'second' | 'additional';
  name: string;
  address?: string | null;
  pic?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ContractDocument {
  id: number;
  document_type: string;
  version: string | null;
  filename: string | null;
  sharepoint_file_url: string | null;
  folder: 'active' | 'expiry';
  uploaded_at: string | null;
  uploaded_by: string | null;
}

/** One contract as returned by GET /api/service-agreements (parties / documents only on single reads). */
export interface ServiceAgreement {
  id: number;
  contract_no: string;
  agreement_name: string;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  business_unit: string | null;
  owner_email: string | null;
  owner_name: string | null;
  confidentiality: string;
  vendor_reference: string | null;
  vendor: string | null;
  first_party: ContractParty | null;
  second_party: ContractParty | null;
  parties?: ContractParty[];
  documents?: ContractDocument[];
  contract_date: string | null;
  issue_date: string | null;
  initial_expiry_date: string | null;
  expiry_date: string | null;
  no_expiry: boolean;
  days_left: number | null;
  reminder_date: string | null;
  auto_renewal: boolean;
  renewal_period_value: number | null;
  renewal_period_unit: string | null;
  notice_period_days: number | null;
  applies_to: string;
  applies_to_detail: string | null;
  vessels: Array<{ id: number; name: string }>;
  remarks: string | null;
  /** active / expiring (reminder date reached) / expired / terminated */
  status: 'active' | 'expiring' | 'expired' | 'terminated';
  closed: boolean;
  sharepoint_file_url: string | null;
  filename: string | null;
}

export interface ServiceAgreementOptions {
  categories: string[];
  business_units: string[];
  confidentiality: string[];
  renewal_units: string[];
  applies_to: Array<{ id: string; label: string }>;
  document_types: string[];
  sub_categories: string[];
  party_names: string[];
  users: Array<{ email: string; name: string; department?: string | null; job_title?: string | null }>;
  vessels: Array<{ id: number; name: string; vessel_type?: string | null }>;
  default_reminder_days: number;
  contract_no_format: string;
  sharepoint_folder: string;
}

export type ServiceAgreementModalMode = 'add' | 'edit' | 'renew';

interface Props {
  host: VesselEmail;
  mode: ServiceAgreementModalMode;
  agreement: ServiceAgreement | null;
  options: ServiceAgreementOptions | null;
  onClose: () => void;
  onSaved: (saved: ServiceAgreement, warning?: string | null) => void;
}

type Tab = 'contract' | 'parties' | 'dates' | 'documents';

interface PartyForm { name: string; address: string; pic: string; phone: string; email: string; }
interface NewFile { key: number; file: File; type: string; version: string; }

interface FormState {
  agreement_name: string;
  description: string;
  category: string;
  sub_category: string;
  business_unit: string;
  owner_email: string;
  confidentiality: string;
  vendor_reference: string;
  applies_to: string;
  applies_to_detail: string;
  vessel_ids: string[];
  first: PartyForm;
  second: PartyForm;
  additional: PartyForm[];
  contract_date: string;
  issue_date: string;
  initial_expiry_date: string;
  expiry_date: string;
  no_expiry: boolean;
  auto_renewal: boolean;
  renewal_period_value: string;
  renewal_period_unit: string;
  notice_period_days: string;
  notice_na: boolean;
  remarks: string;
  notes: string;
}

const emptyParty = (): PartyForm => ({ name: '', address: '', pic: '', phone: '', email: '' });
const toParty = (p: ContractParty | null | undefined): PartyForm => ({
  name: p?.name || '', address: p?.address || '', pic: p?.pic || '', phone: p?.phone || '', email: p?.email || '',
});

const initialForm = (a: ServiceAgreement | null, mode: ServiceAgreementModalMode): FormState => {
  const parties = a?.parties || [];
  return {
    agreement_name: a?.agreement_name || '',
    description: a?.description || '',
    category: a?.category || '',
    sub_category: a?.sub_category || '',
    business_unit: a?.business_unit || '',
    owner_email: a?.owner_email || '',
    confidentiality: a?.confidentiality || 'General',
    vendor_reference: a?.vendor_reference || '',
    applies_to: a?.applies_to || 'all_ships',
    applies_to_detail: a?.applies_to_detail || '',
    vessel_ids: (a?.vessels || []).map(v => String(v.id)),
    first: toParty(a?.first_party || parties.filter(p => p.role === 'first')[0]),
    second: toParty(a?.second_party || parties.filter(p => p.role === 'second')[0]),
    additional: parties.filter(p => p.role === 'additional').map(toParty),
    contract_date: mode === 'renew' ? '' : (a?.contract_date || ''),
    // A renewal starts with empty dates: they come from the new document.
    issue_date: mode === 'renew' ? '' : (a?.issue_date || ''),
    initial_expiry_date: a?.initial_expiry_date || '',
    expiry_date: mode === 'renew' ? '' : (a?.expiry_date || ''),
    no_expiry: !!a?.no_expiry,
    auto_renewal: !!a?.auto_renewal,
    renewal_period_value: a?.renewal_period_value ? String(a.renewal_period_value) : '',
    renewal_period_unit: a?.renewal_period_unit || 'years',
    notice_period_days: a?.notice_period_days !== null && a?.notice_period_days !== undefined ? String(a.notice_period_days) : '',
    notice_na: !!a && (a.notice_period_days === null || a.notice_period_days === undefined),
    remarks: a?.remarks || '',
    notes: '',
  };
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const minusDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - days);
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let fileKey = 0;

const Modal = (props: { label: string; busy: boolean; onClose: () => void; className?: string; children: React.ReactNode }): React.ReactElement =>
  ReactDOM.createPortal(
    <div className="sa-modal" role="dialog" aria-modal="true" aria-label={props.label}
      onMouseDown={e => { if (e.target === e.currentTarget && !props.busy) props.onClose(); }}>
      <div className={`sa-modal__dialog ${props.className || ''}`}>{props.children}</div>
    </div>,
    document.body,
  );

export function ServiceAgreementModal({ host, mode, agreement, options, onClose, onSaved }: Props): React.ReactElement {
  const [form, setForm] = React.useState<FormState>(() => initialForm(agreement, mode));
  const [newFiles, setNewFiles] = React.useState<NewFile[]>([]);
  const [tab, setTab] = React.useState<Tab>('contract');
  const [showErrors, setShowErrors] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);
  const [extractNote, setExtractNote] = React.useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [auto, setAuto] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nextNo, setNextNo] = React.useState<string>('');
  const fileInput = React.useRef<HTMLInputElement>(null);
  const extractInput = React.useRef<HTMLInputElement>(null);

  const docTypes = options?.document_types || ['Main Contract', 'Amendment', 'Annexure / Schedule', 'Quotation / Proposal', 'Correspondence', 'Other'];
  const reminderDefault = options?.default_reminder_days || 60;
  const renewedBefore = mode === 'edit' && !!agreement && !!agreement.initial_expiry_date && agreement.initial_expiry_date !== agreement.expiry_date;

  const formHeaders = React.useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    const base = host._headers();
    Object.keys(base).forEach(k => { if (k.toLowerCase() !== 'content-type' && base[k]) h[k] = base[k]; });
    return h;
  }, [host]);

  React.useEffect(() => {
    if (mode !== 'add') return;
    fetch(`${host._base()}/api/service-agreements/next-contract-no`, { headers: host._headers(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.contract_no) setNextNo(d.contract_no); })
      .catch(() => undefined);
  }, [host, mode]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm(f => ({ ...f, [key]: value }));
    setAuto(a => ({ ...a, [key]: false }));
    setError(null);
  };
  const setParty = (which: 'first' | 'second', key: keyof PartyForm, value: string): void => {
    setForm(f => ({ ...f, [which]: { ...f[which], [key]: value } }));
    setAuto(a => ({ ...a, [`${which}.${key}`]: false }));
    setError(null);
  };
  const setAdditional = (i: number, key: keyof PartyForm, value: string): void => {
    setForm(f => ({ ...f, additional: f.additional.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));
  };

  // ---------------------------------------------------------------- files + auto-fill
  const addFiles = (list: FileList | File[] | null, firstType?: string): File[] => {
    const arr = list ? Array.prototype.slice.call(list) as File[] : [];
    if (!arr.length) return arr;
    setNewFiles(prev => {
      const hasMain = prev.some(f => f.type === 'Main Contract') || (mode === 'edit' && (agreement?.documents || []).some(d => d.folder === 'active' && d.document_type === 'Main Contract'));
      return prev.concat(arr.map((file, i) => ({
        key: ++fileKey, file,
        type: i === 0 && firstType ? firstType : (!hasMain && i === 0 ? 'Main Contract' : 'Other'),
        version: '1',
      })));
    });
    setError(null);
    return arr;
  };

  const runExtraction = async (f: File): Promise<void> => {
    setExtracting(true);
    setExtractNote(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${host._base()}/api/service-agreements/extract-metadata`, { method: 'POST', headers: formHeaders(), body: fd });
      const data = res.ok ? await res.json() : null;
      if (!data || !data.success) {
        setExtractNote({ tone: 'warn', text: (data && data.message) || 'Details could not be read from this file. Please fill them in.' });
        return;
      }
      const x = data.fields || {};
      const filled: Record<string, boolean> = {};
      const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
      setForm(prev => {
        const next: FormState = { ...prev, first: { ...prev.first }, second: { ...prev.second } };
        const take = (key: 'agreement_name' | 'description' | 'vendor_reference' | 'category' | 'sub_category' | 'contract_date' | 'issue_date', value: unknown): void => {
          const v = str(value);
          if (!v) return;
          if (mode === 'renew' && (key === 'agreement_name' || key === 'description' || key === 'category' || key === 'sub_category')) return;
          next[key] = v;
          filled[key] = true;
        };
        take('agreement_name', x.agreement_name);
        take('description', x.description);
        take('vendor_reference', x.vendor_reference);
        take('category', x.category);
        take('sub_category', x.sub_category);
        take('contract_date', x.contract_date);
        take('issue_date', x.issue_date);
        const exp = str(x.expiry_date);
        if (exp) {
          if (mode === 'renew') { next.expiry_date = exp; filled.expiry_date = true; }
          else { next.initial_expiry_date = exp; next.no_expiry = false; filled.initial_expiry_date = true; }
        }
        if (mode !== 'renew') {
          if (str(x.first_party_name) && !next.first.name) { next.first.name = str(x.first_party_name); filled['first.name'] = true; }
          if (str(x.second_party_name)) { next.second.name = str(x.second_party_name); filled['second.name'] = true; }
          if (str(x.second_party_email)) { next.second.email = str(x.second_party_email); filled['second.email'] = true; }
          if (str(x.second_party_phone)) { next.second.phone = str(x.second_party_phone); filled['second.phone'] = true; }
          if (x.auto_renewal) { next.auto_renewal = true; filled.auto_renewal = true; }
          if (x.renewal_period_value) {
            next.renewal_period_value = String(x.renewal_period_value);
            next.renewal_period_unit = str(x.renewal_period_unit) || 'years';
            filled.renewal_period_value = true;
          }
          if (x.notice_period_days) { next.notice_period_days = String(x.notice_period_days); next.notice_na = false; filled.notice_period_days = true; }
          if (x.applies_to === 'all_ships') { next.applies_to = 'all_ships'; filled.applies_to = true; }
          else if (Array.isArray(x.vessel_ids) && x.vessel_ids.length) {
            next.applies_to = 'vessels';
            next.vessel_ids = x.vessel_ids.map((v: number) => String(v));
            filled.applies_to = true;
          }
        }
        return next;
      });
      setAuto(filled);
      const missing: string[] = (data.undetected_fields || []).filter((m: string) => mode !== 'renew' || /date/i.test(m));
      setExtractNote(missing.length
        ? { tone: 'warn', text: `Read from the file. Please fill in: ${missing.join(', ')}.` }
        : { tone: 'ok', text: 'Details read from the file. Please check every tab before saving.' });
    } catch {
      setExtractNote({ tone: 'warn', text: 'Details could not be read from this file. Please fill them in.' });
    } finally {
      setExtracting(false);
    }
  };

  // Renew: the first new file fills the new dates.
  const addAndMaybeRead = (list: FileList | null): void => {
    const first = !newFiles.length;
    const arr = addFiles(list, mode === 'renew' && first ? 'Main Contract' : undefined);
    if (mode === 'renew' && first && arr[0]) void runExtraction(arr[0]);
  };

  const onUploadContract = (list: FileList | null): void => {
    const arr = addFiles(list, 'Main Contract');
    if (arr[0]) void runExtraction(arr[0]);
  };

  // ---------------------------------------------------------------- validation (per tab)
  const problems = React.useMemo((): Record<Tab, string[]> => {
    const p: Record<Tab, string[]> = { contract: [], parties: [], dates: [], documents: [] };
    if (mode !== 'renew') {
      if (!form.agreement_name.trim()) p.contract.push('Contract Title');
      if (!form.description.trim()) p.contract.push('Brief Description');
      if (form.description.length > 500) p.contract.push('Brief Description (max 500 characters)');
      if (!form.category) p.contract.push('Contract Category');
      if (!form.business_unit) p.contract.push('Business Unit');
      if (!form.owner_email) p.contract.push('Contract Owner / PIC');
      if (form.applies_to === 'vessels' && !form.vessel_ids.length) p.contract.push('Vessels');
      if (form.applies_to === 'newbuilding' && !form.applies_to_detail.trim()) p.contract.push('Hull number');
      if (form.applies_to === 'project' && !form.applies_to_detail.trim()) p.contract.push('Project name');
      if (!form.first.name.trim()) p.parties.push('First Party name');
      if (!form.second.name.trim()) p.parties.push('Second Party name');
      [form.first, form.second].concat(form.additional).forEach(x => {
        if (x.email.trim() && !EMAIL_OK.test(x.email.trim())) p.parties.push(`Email of ${x.name || 'a party'}`);
      });
      if (form.auto_renewal && !form.renewal_period_value) p.dates.push('Renewal Period');
      if (!form.notice_na && form.notice_period_days === '' && mode === 'add') p.dates.push('Notice Period (or tick Not applicable)');
    }
    if (!form.issue_date) p.dates.push('Effective Date');
    const exp = mode === 'renew' ? form.expiry_date : (renewedBefore ? form.expiry_date : form.initial_expiry_date);
    if (!form.no_expiry && !exp) p.dates.push(mode === 'renew' ? 'New Expiry Date' : 'Initial Expiry Date');
    if (!form.no_expiry && exp && form.issue_date && exp <= form.issue_date) p.dates.push('Expiry must be after the effective date');
    if (mode !== 'edit' && !newFiles.length) p.documents.push('At least one file');
    return p;
  }, [form, newFiles, mode, renewedBefore]);

  const allProblems = (Object.keys(problems) as Tab[]).reduce((n, t) => n + problems[t].length, 0);

  // ---------------------------------------------------------------- save
  const partiesPayload = (): ContractParty[] => {
    const clean = (role: ContractParty['role'], p: PartyForm): ContractParty => ({
      role, name: p.name.trim(), address: p.address.trim(), pic: p.pic.trim(), phone: p.phone.trim(), email: p.email.trim(),
    });
    return [clean('first', form.first), clean('second', form.second)]
      .concat(form.additional.filter(p => p.name.trim()).map(p => clean('additional', p)));
  };

  const appendFiles = (fd: FormData): void => {
    newFiles.forEach(f => fd.append('files', f.file));
    fd.append('document_types', JSON.stringify(newFiles.map(f => f.type)));
    fd.append('document_versions', JSON.stringify(newFiles.map(f => f.version)));
  };

  const save = async (): Promise<void> => {
    setShowErrors(true);
    if (allProblems) {
      const first = (['contract', 'parties', 'dates', 'documents'] as Tab[]).filter(t => problems[t].length)[0];
      setTab(first);
      setError(`Please complete: ${problems[first].join(', ')}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      const shipIds = form.applies_to === 'vessels' ? form.vessel_ids.map(v => Number(v)) : [];
      const notice = form.notice_na ? '' : form.notice_period_days;
      if (mode === 'edit' && agreement) {
        const body: Record<string, unknown> = {
          agreement_name: form.agreement_name, description: form.description, category: form.category,
          sub_category: form.sub_category, business_unit: form.business_unit, owner_email: form.owner_email,
          confidentiality: form.confidentiality, vendor_reference: form.vendor_reference,
          contract_date: form.contract_date || null, issue_date: form.issue_date || null,
          initial_expiry_date: form.no_expiry ? null : (form.initial_expiry_date || null),
          no_expiry: form.no_expiry, auto_renewal: form.auto_renewal,
          renewal_period_value: form.renewal_period_value ? Number(form.renewal_period_value) : null,
          renewal_period_unit: form.renewal_period_value ? form.renewal_period_unit : null,
          notice_period_days: notice === '' ? null : Number(notice),
          applies_to: form.applies_to, applies_to_detail: form.applies_to_detail, vessel_ids: shipIds,
          parties: partiesPayload(), remarks: form.remarks,
        };
        if (renewedBefore) body.expiry_date = form.no_expiry ? null : (form.expiry_date || null);
        res = await fetch(`${host._base()}/api/service-agreements/${agreement.id}`, {
          method: 'PUT', headers: { ...host._headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok && newFiles.length) {
          const fd = new FormData();
          appendFiles(fd);
          res = await fetch(`${host._base()}/api/service-agreements/${agreement.id}/documents`, { method: 'POST', headers: formHeaders(), body: fd });
        }
      } else if (mode === 'renew' && agreement) {
        const fd = new FormData();
        appendFiles(fd);
        fd.append('issue_date', form.issue_date);
        fd.append('expiry_date', form.no_expiry ? '' : form.expiry_date);
        fd.append('no_expiry', String(form.no_expiry));
        fd.append('contract_date', form.contract_date);
        fd.append('vendor_reference', form.vendor_reference);
        fd.append('remarks', form.remarks);
        fd.append('notes', form.notes);
        res = await fetch(`${host._base()}/api/service-agreements/${agreement.id}/renew`, { method: 'POST', headers: formHeaders(), body: fd });
      } else {
        const fd = new FormData();
        appendFiles(fd);
        const fields: Record<string, string> = {
          agreement_name: form.agreement_name, description: form.description, category: form.category,
          sub_category: form.sub_category, business_unit: form.business_unit, owner_email: form.owner_email,
          confidentiality: form.confidentiality, vendor_reference: form.vendor_reference,
          contract_date: form.contract_date, issue_date: form.issue_date,
          initial_expiry_date: form.no_expiry ? '' : form.initial_expiry_date, no_expiry: String(form.no_expiry),
          auto_renewal: String(form.auto_renewal),
          renewal_period_value: form.renewal_period_value, renewal_period_unit: form.renewal_period_value ? form.renewal_period_unit : '',
          notice_period_days: notice, applies_to: form.applies_to, applies_to_detail: form.applies_to_detail,
          vessel_ids: JSON.stringify(shipIds), parties: JSON.stringify(partiesPayload()), remarks: form.remarks,
        };
        Object.keys(fields).forEach(k => fd.append(k, fields[k]));
        res = await fetch(`${host._base()}/api/service-agreements`, { method: 'POST', headers: formHeaders(), body: fd });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data && data.detail;
        setError(typeof detail === 'string' ? detail : `Could not save (error ${res.status}).`);
        return;
      }
      onSaved(data as ServiceAgreement, data && data.warning);
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- small render helpers
  const autoTag = (key: string): React.ReactNode =>
    auto[key] ? <span className="sa-modal__auto" title="Read from the uploaded file">auto</span> : null;

  const label = (text: string, key: string, required?: boolean, htmlFor?: string): React.ReactElement => (
    <label className="sa-modal__label" htmlFor={htmlFor}>
      {text}{required && <span className="sa-modal__req">*</span>}{autoTag(key)}
    </label>
  );

  const textField = (
    key: 'agreement_name' | 'vendor_reference' | 'sub_category' | 'applies_to_detail' | 'contract_date' | 'issue_date' | 'initial_expiry_date' | 'expiry_date' | 'notes',
    text: string,
    opts: { required?: boolean; type?: string; list?: string; disabled?: boolean; placeholder?: string; className?: string } = {},
  ): React.ReactElement => (
    <div className={`sa-modal__field ${opts.className || ''}`}>
      {label(text, key, opts.required, `sa-${key}`)}
      <input id={`sa-${key}`} className="sa-modal__input" type={opts.type || 'text'} list={opts.list}
        disabled={opts.disabled} placeholder={opts.placeholder} value={form[key]} onChange={e => set(key, e.target.value)} />
    </div>
  );

  const selectField = (
    key: 'category' | 'business_unit' | 'owner_email' | 'applies_to',
    text: string,
    items: Array<{ value: string; label: string }>,
    required?: boolean,
  ): React.ReactElement => (
    <div className="sa-modal__field">
      {label(text, key, required, `sa-${key}`)}
      <select id={`sa-${key}`} className="sa-modal__input" value={form[key]} onChange={e => set(key, e.target.value)}>
        {key !== 'applies_to' && <option value="">Select…</option>}
        {items.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
      </select>
    </div>
  );

  const segment = (key: 'confidentiality', items: string[], text: string): React.ReactElement => (
    <div className="sa-modal__field">
      <span className="sa-modal__label">{text}<span className="sa-modal__req">*</span></span>
      <div className="sa-modal__segment" role="radiogroup" aria-label={text}>
        {items.map(i => (
          <button key={i} type="button" role="radio" aria-checked={form[key] === i}
            className={form[key] === i ? 'is-on' : ''} onClick={() => set(key, i)}>{i}</button>
        ))}
      </div>
    </div>
  );

  const partyCard = (which: 'first' | 'second', title: string, hint: string): React.ReactElement => {
    const p = form[which];
    const input = (key: keyof PartyForm, text: string, placeholder?: string, type?: string): React.ReactElement => (
      <div className="sa-modal__field">
        {label(text, `${which}.${key}`, key === 'name', `sa-${which}-${key}`)}
        <input id={`sa-${which}-${key}`} className="sa-modal__input" type={type || 'text'} value={p[key]}
          list={key === 'name' ? 'sa-party-names' : undefined} placeholder={placeholder}
          onChange={e => setParty(which, key, e.target.value)} />
      </div>
    );
    return (
      <div className="sa-party">
        <div className="sa-party__title">{title}<span>{hint}</span></div>
        {input('name', 'Name', which === 'first' ? 'e.g. Ozellar Marine' : 'Vendor / service provider')}
        <div className="sa-party__row">
          {input('pic', 'PIC')}
          {input('phone', 'Phone', undefined, 'tel')}
        </div>
        {input('email', 'Email', undefined, 'email')}
        <div className="sa-modal__field">
          {label('Address', `${which}.address`, false, `sa-${which}-address`)}
          <textarea id={`sa-${which}-address`} className="sa-modal__input sa-modal__textarea sa-modal__textarea--sm" rows={2}
            value={p.address} onChange={e => setParty(which, 'address', e.target.value)} />
        </div>
      </div>
    );
  };

  const vesselOptions = (options?.vessels || []).map(v => ({ id: String(v.id), name: v.name, subtext: v.vessel_type || undefined }));
  const appliesItems = (options?.applies_to || [
    { id: 'all_ships', label: 'All vessels' }, { id: 'vessels', label: 'Selected vessels' },
    { id: 'newbuilding', label: 'Newbuilding (hull number)' }, { id: 'project', label: 'Project' },
    { id: 'shore_office', label: 'Shore office' }, { id: 'none', label: 'Not applicable' },
  ]).map(a => ({ value: a.id, label: a.label }));

  const currentExpiry = mode === 'renew' ? form.expiry_date : (renewedBefore ? form.expiry_date : form.initial_expiry_date);
  const noticeDays = form.notice_na || form.notice_period_days === '' ? reminderDefault : Number(form.notice_period_days) || 0;
  const reminder = !form.no_expiry && currentExpiry ? minusDays(currentExpiry, noticeDays) : '';

  // ---------------------------------------------------------------- tabs
  const contractTab = (
    <div className="sa-modal__grid">
      {textField('agreement_name', 'Contract Title', { required: true, placeholder: 'e.g. AMC - Main Engine', className: 'sa-span-2' })}
      {textField('vendor_reference', 'External Contract No', { placeholder: "Counterparty's number" })}
      <div className="sa-modal__field sa-span-3">
        <label className="sa-modal__label" htmlFor="sa-description">
          Brief Description<span className="sa-modal__req">*</span>{autoTag('description')}
          <span className={`sa-modal__counter${form.description.length > 500 ? ' is-over' : ''}`}>{form.description.length}/500</span>
        </label>
        <textarea id="sa-description" className="sa-modal__input sa-modal__textarea" rows={2} value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="What the contract covers" />
      </div>
      {selectField('category', 'Contract Category', (options?.categories || []).map(c => ({ value: c, label: c })), true)}
      {textField('sub_category', 'Sub Category', { list: 'sa-sub-categories' })}
      {selectField('business_unit', 'Business Unit', (options?.business_units || []).map(c => ({ value: c, label: c })), true)}
      {selectField('owner_email', 'Contract Owner / PIC', (options?.users || []).map(u => ({ value: u.email, label: u.department ? `${u.name} (${u.department})` : u.name })), true)}
      {segment('confidentiality', options?.confidentiality || ['General', 'Internal', 'Confidential'], 'Confidentiality')}
      {selectField('applies_to', 'Applicable Vessel / Project', appliesItems)}
      {form.applies_to === 'vessels' && (
        <div className="sa-modal__field sa-span-3">
          <span className="sa-modal__label">Vessels<span className="sa-modal__req">*</span>{autoTag('applies_to')}</span>
          <VesselMultiSelect options={vesselOptions} selectedIds={form.vessel_ids} onChange={ids => set('vessel_ids', ids)}
            style={{ width: '100%', flex: '1 1 auto', minWidth: 0 }} placement="auto" />
        </div>
      )}
      {(form.applies_to === 'newbuilding' || form.applies_to === 'project' || form.applies_to === 'shore_office') &&
        textField('applies_to_detail', form.applies_to === 'newbuilding' ? 'Hull Number' : form.applies_to === 'project' ? 'Project Name' : 'Office',
          { required: form.applies_to !== 'shore_office', className: 'sa-span-3' })}
    </div>
  );

  const partiesTab = (
    <div className="sa-parties">
      <div className="sa-parties__main">
        {partyCard('first', 'First Party / Company', 'Our company')}
        {partyCard('second', 'Second Party / Counterparty', 'Vendor / service provider')}
      </div>
      <div className="sa-parties__extra">
        <div className="sa-party__title">Additional Parties<span>Optional</span></div>
        {form.additional.map((p, i) => (
          <div key={i} className="sa-parties__extra-row">
            <input className="sa-modal__input" placeholder="Name" aria-label="Name" value={p.name} onChange={e => setAdditional(i, 'name', e.target.value)} />
            <input className="sa-modal__input" placeholder="PIC" aria-label="PIC" value={p.pic} onChange={e => setAdditional(i, 'pic', e.target.value)} />
            <input className="sa-modal__input" placeholder="Phone" aria-label="Phone" value={p.phone} onChange={e => setAdditional(i, 'phone', e.target.value)} />
            <input className="sa-modal__input" placeholder="Email" aria-label="Email" value={p.email} onChange={e => setAdditional(i, 'email', e.target.value)} />
            <input className="sa-modal__input" placeholder="Address" aria-label="Address" value={p.address} onChange={e => setAdditional(i, 'address', e.target.value)} />
            <button type="button" className="sa-icon-btn" aria-label="Remove party"
              onClick={() => setForm(f => ({ ...f, additional: f.additional.filter((_, j) => j !== i) }))}><Icon iconName="Cancel" /></button>
          </div>
        ))}
        <button type="button" className="sa-btn sa-btn--link" onClick={() => setForm(f => ({ ...f, additional: f.additional.concat([emptyParty()]) }))}>
          <Icon iconName="Add" /> Add party
        </button>
      </div>
    </div>
  );

  const expiryField = (key: 'initial_expiry_date' | 'expiry_date', text: string): React.ReactElement => (
    <div className="sa-modal__field">
      <label className="sa-modal__label" htmlFor={`sa-${key}`}>
        {text}{!form.no_expiry && <span className="sa-modal__req">*</span>}{autoTag(key)}
        <span className="sa-modal__check">
          <input type="checkbox" checked={form.no_expiry} onChange={e => set('no_expiry', e.target.checked)} /> No expiry / Perpetual
        </span>
      </label>
      <input id={`sa-${key}`} className="sa-modal__input" type="date" disabled={form.no_expiry}
        value={form.no_expiry ? '' : form[key]} onChange={e => set(key, e.target.value)} />
    </div>
  );

  const readOnly = (text: string, value: string, hint?: string): React.ReactElement => (
    <div className="sa-modal__field">
      <span className="sa-modal__label">{text}</span>
      <div className="sa-modal__readonly" title={hint}>{value}</div>
    </div>
  );

  const datesTab = (
    <div className="sa-modal__grid">
      {textField('contract_date', 'Contract Date (signed)', { type: 'date' })}
      {textField('issue_date', 'Effective / Commencement Date', { type: 'date', required: true })}
      {renewedBefore ? readOnly('Initial Expiry Date', fmtDate(form.initial_expiry_date)) : expiryField('initial_expiry_date', 'Initial Expiry Date')}
      {renewedBefore
        ? expiryField('expiry_date', 'Current Expiry Date')
        : readOnly('Current Expiry Date', form.no_expiry ? 'No expiry' : (currentExpiry ? fmtDate(currentExpiry) : 'Same as Initial Expiry'), 'Copied from the Initial Expiry Date; changes only on renewal')}
      <div className="sa-modal__field">
        <label className="sa-modal__label" htmlFor="sa-notice">
          Notice Period (days){autoTag('notice_period_days')}
          <span className="sa-modal__check">
            <input type="checkbox" checked={form.notice_na} onChange={e => set('notice_na', e.target.checked)} /> Not applicable
          </span>
        </label>
        <input id="sa-notice" className="sa-modal__input" type="number" min={0} max={3650} disabled={form.notice_na}
          value={form.notice_na ? '' : form.notice_period_days} onChange={e => set('notice_period_days', e.target.value)} placeholder="e.g. 30" />
      </div>
      {readOnly('Reminder Date', form.no_expiry ? 'No reminder' : (reminder ? fmtDate(reminder) : '-'),
        `Current Expiry minus Notice Period${form.notice_na || form.notice_period_days === '' ? ` (default ${reminderDefault} days)` : ''}`)}
      <div className="sa-modal__field">
        <span className="sa-modal__label">Auto-Renewal<span className="sa-modal__req">*</span>{autoTag('auto_renewal')}</span>
        <div className="sa-modal__segment" role="radiogroup" aria-label="Auto-renewal">
          <button type="button" role="radio" aria-checked={form.auto_renewal} className={form.auto_renewal ? 'is-on' : ''} onClick={() => set('auto_renewal', true)}>Yes</button>
          <button type="button" role="radio" aria-checked={!form.auto_renewal} className={!form.auto_renewal ? 'is-on' : ''} onClick={() => set('auto_renewal', false)}>No</button>
        </div>
      </div>
      <div className="sa-modal__field">
        <label className="sa-modal__label" htmlFor="sa-renewal">Renewal Period{form.auto_renewal && <span className="sa-modal__req">*</span>}{autoTag('renewal_period_value')}</label>
        <div className="sa-modal__inline">
          <input id="sa-renewal" className="sa-modal__input" type="number" min={1} max={999} value={form.renewal_period_value}
            onChange={e => set('renewal_period_value', e.target.value)} placeholder="e.g. 1" />
          <select className="sa-modal__input" aria-label="Renewal period unit" value={form.renewal_period_unit} onChange={e => set('renewal_period_unit', e.target.value)}>
            {(options?.renewal_units || ['days', 'months', 'years']).map(u => <option key={u} value={u}>{u[0].toUpperCase() + u.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="sa-modal__field" />
      <div className="sa-modal__field sa-span-3">
        <label className="sa-modal__label" htmlFor="sa-remarks">Remarks</label>
        <textarea id="sa-remarks" className="sa-modal__input sa-modal__textarea" rows={2} maxLength={4000}
          value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Shown when you point at the contract in the list" />
      </div>
    </div>
  );

  const existingDocs = (agreement?.documents || []);
  const fileRows = (
    <div className="sa-docs">
      {newFiles.map(f => (
        <div key={f.key} className="sa-docs__row">
          <Icon iconName="PDF" className="sa-docs__icon" />
          <span className="sa-docs__name" title={f.file.name}>{f.file.name}</span>
          <select className="sa-modal__input sa-docs__type" aria-label="Document type" value={f.type}
            onChange={e => setNewFiles(list => list.map(x => (x.key === f.key ? { ...x, type: e.target.value } : x)))}>
            {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="sa-modal__input sa-docs__ver" aria-label="Version" value={f.version} placeholder="Ver."
            onChange={e => setNewFiles(list => list.map(x => (x.key === f.key ? { ...x, version: e.target.value } : x)))} />
          <button type="button" className="sa-icon-btn" aria-label="Remove file" onClick={() => setNewFiles(list => list.filter(x => x.key !== f.key))}>
            <Icon iconName="Cancel" />
          </button>
        </div>
      ))}
      <input ref={fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx" hidden
        onChange={e => { addAndMaybeRead(e.target.files); e.target.value = ''; }} />
      <button type="button" className="sa-docs__add" onClick={() => fileInput.current && fileInput.current.click()}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addAndMaybeRead(e.dataTransfer.files); }}>
        <Icon iconName="Add" /> Add files <span>or drop them here — PDF, Word, Excel or image</span>
      </button>
    </div>
  );

  const documentsTab = (
    <div className="sa-docs-tab">
      {fileRows}
      {existingDocs.length > 0 && (
        <div className="sa-docs__existing">
          <div className="sa-party__title">Saved files<span>{existingDocs.length}</span></div>
          {existingDocs.map(d => (
            <div key={d.id} className="sa-docs__row sa-docs__row--saved">
              <Icon iconName="PDF" className="sa-docs__icon" />
              {d.sharepoint_file_url
                ? <a className="sa-docs__name" href={d.sharepoint_file_url} target="_blank" rel="noopener noreferrer" title={d.filename || ''}>{d.filename || 'File'}</a>
                : <span className="sa-docs__name">{d.filename || 'File'}</span>}
              <span className="sa-docs__meta">{d.document_type}{d.version ? ` • v${d.version}` : ''} • {fmtDate((d.uploaded_at || '').slice(0, 10))}</span>
              <span className={`sa-folder sa-folder--${d.folder}`}>{d.folder === 'active' ? 'Active' : 'Expiry'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renewBody = (
    <>
      <div className="sa-modal__grid">
        {textField('issue_date', 'New Effective Date', { type: 'date', required: true })}
        {expiryField('expiry_date', 'New Expiry Date')}
        {textField('contract_date', 'Contract Date (signed)', { type: 'date' })}
        {textField('vendor_reference', 'External Contract No')}
        {textField('notes', 'Renewal Note', { placeholder: 'e.g. Yearly renewal, new rates', className: 'sa-span-2' })}
      </div>
      <div className="sa-modal__field">
        <span className="sa-modal__label">Renewed files<span className="sa-modal__req">*</span></span>
        {fileRows}
      </div>
      {extracting && <div className="sa-modal__note sa-modal__note--ok">Reading the new dates from the file…</div>}
      {!extracting && extractNote && <div className={`sa-modal__note sa-modal__note--${extractNote.tone}`}>{extractNote.text}</div>}
    </>
  );

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'contract', label: 'Contract', icon: 'TextDocument' },
    { id: 'parties', label: 'Parties', icon: 'People' },
    { id: 'dates', label: 'Dates & Renewal', icon: 'Calendar' },
    { id: 'documents', label: 'Documents', icon: 'Attach' },
  ];

  const title = mode === 'add' ? 'Add Contract' : mode === 'edit' ? 'Edit Contract' : 'Renew Contract';
  const contractNo = agreement ? agreement.contract_no : (nextNo || 'Generated on save');
  const activeFolder = (options?.sharepoint_folder || 'Technical and Crewing/Service Agreement/Active | Expiry').split(' | ')[0];

  return (
    <Modal label={title} busy={saving} onClose={onClose} className="sa-modal__dialog--wide">
      <div className="sa-modal__header">
        <div className="sa-modal__heading">
          <span className="sa-modal__icon"><Icon iconName={mode === 'renew' ? 'Sync' : 'TextDocument'} /></span>
          <div>
            <h3 className="sa-modal__title">{title}</h3>
            <div className="sa-modal__subtitle">
              {mode !== 'add' && agreement ? agreement.agreement_name : 'Upload the contract, check each tab, save.'}
            </div>
          </div>
        </div>
        <div className="sa-modal__header-right">
          <span className="sa-modal__contract" title="Contract number"><Icon iconName="NumberSymbol" /> {contractNo}</span>
          <button type="button" className="sa-modal__close" onClick={onClose} disabled={saving} aria-label="Close"><Icon iconName="Cancel" /></button>
        </div>
      </div>

      {mode === 'add' && (
        <div className="sa-modal__strip">
          <div className={`sa-modal__upload${newFiles.length ? ' is-filled' : ''}`}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onUploadContract(e.dataTransfer.files); }}>
            <Icon iconName={newFiles.length ? 'PDF' : 'CloudUpload'} className="sa-modal__upload-icon" />
            <div className="sa-modal__upload-text">
              <div className="sa-modal__upload-name">
                {newFiles.length ? `${newFiles.length} file${newFiles.length === 1 ? '' : 's'} attached` : 'Upload the contract'}
                <span className="sa-modal__req">*</span>
              </div>
              <div className="sa-modal__upload-hint">
                {extracting ? 'Reading details from the file…' : 'Details are filled in from the file. More files can be added in Documents.'}
              </div>
            </div>
            <input ref={extractInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" hidden
              onChange={e => { onUploadContract(e.target.files); e.target.value = ''; }} />
            <button type="button" className="sa-btn sa-btn--secondary" disabled={extracting || saving}
              onClick={() => extractInput.current && extractInput.current.click()}>
              {extracting ? 'Reading…' : newFiles.length ? 'Upload another' : 'Choose file'}
            </button>
          </div>
          {extractNote && <div className={`sa-modal__note sa-modal__note--${extractNote.tone}`}>{extractNote.text}</div>}
        </div>
      )}

      {mode !== 'renew' && (
        <div className="sa-modal__tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`sa-modal__tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
              <Icon iconName={t.icon} /> {t.label}
              {showErrors && problems[t.id].length > 0 && <span className="sa-modal__tab-err" title={problems[t.id].join(', ')}>{problems[t.id].length}</span>}
              {t.id === 'documents' && (newFiles.length + existingDocs.length) > 0 && !(showErrors && problems.documents.length) &&
                <span className="sa-modal__tab-count">{newFiles.length + existingDocs.length}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="sa-modal__body">
        {mode === 'renew' ? renewBody : (
          <div role="tabpanel">
            {tab === 'contract' && contractTab}
            {tab === 'parties' && partiesTab}
            {tab === 'dates' && datesTab}
            {tab === 'documents' && documentsTab}
          </div>
        )}
        <datalist id="sa-sub-categories">{(options?.sub_categories || []).map(v => <option key={v} value={v} />)}</datalist>
        <datalist id="sa-party-names">{(options?.party_names || []).map(v => <option key={v} value={v} />)}</datalist>
      </div>

      {error && <div role="alert" className="sa-modal__note sa-modal__note--error sa-modal__error">{error}</div>}

      <div className="sa-modal__footer">
        <div className="sa-modal__footer-info">
          <Icon iconName="FabricFolder" />
          {mode === 'renew'
            ? <span>New files go to <strong>Active</strong>; the current ones move to <strong>Expiry</strong>. Contract no stays the same.</span>
            : <span>Files saved in <strong>{activeFolder}</strong></span>}
        </div>
        <div className="sa-modal__footer-actions">
          {mode !== 'renew' && tab !== 'documents' && (
            <button type="button" className="sa-btn sa-btn--secondary" disabled={saving}
              onClick={() => setTab(TABS[TABS.map(t => t.id).indexOf(tab) + 1].id)}>Next <Icon iconName="ChevronRight" /></button>
          )}
          <button type="button" className="sa-btn sa-btn--secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="sa-btn sa-btn--primary" onClick={() => void save()} disabled={saving || extracting}>
            {saving ? 'Saving…' : mode === 'renew' ? 'Renew' : mode === 'edit' ? 'Save changes' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Every file of a contract (Active + Expiry) and its renewal history. */
export function ServiceAgreementHistoryModal({ host, agreement, onClose }: { host: VesselEmail; agreement: ServiceAgreement; onClose: () => void }): React.ReactElement {
  const [data, setData] = React.useState<{ history: any[]; documents: ContractDocument[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`${host._base()}/api/service-agreements/${agreement.id}/history`, { headers: host._headers(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`error ${r.status}`))))
      .then(d => setData({ history: d.history || [], documents: d.documents || [] }))
      .catch((e: Error) => setError(`Could not load the history (${e.message}).`));
  }, [host, agreement.id]);

  return (
    <Modal label="Contract history" busy={false} onClose={onClose} className="sa-modal__dialog--narrow">
      <div className="sa-modal__header">
        <div className="sa-modal__heading">
          <span className="sa-modal__icon"><Icon iconName="History" /></span>
          <div>
            <h3 className="sa-modal__title">Documents &amp; History</h3>
            <div className="sa-modal__subtitle">{agreement.contract_no} • {agreement.agreement_name}</div>
          </div>
        </div>
        <button type="button" className="sa-modal__close" onClick={onClose} aria-label="Close"><Icon iconName="Cancel" /></button>
      </div>
      <div className="sa-modal__body sa-modal__body--scroll">
        {error && <div className="sa-modal__note sa-modal__note--error">{error}</div>}
        {!error && !data && <div className="sa-history__meta">Loading…</div>}
        {data && (
          <>
            <div className="sa-party__title">Files<span>{data.documents.length}</span></div>
            {data.documents.map(d => (
              <div key={d.id} className="sa-docs__row sa-docs__row--saved">
                <Icon iconName="PDF" className="sa-docs__icon" />
                {d.sharepoint_file_url
                  ? <a className="sa-docs__name" href={d.sharepoint_file_url} target="_blank" rel="noopener noreferrer">{d.filename || 'File'}</a>
                  : <span className="sa-docs__name">{d.filename || 'File'}</span>}
                <span className="sa-docs__meta">{d.document_type}{d.version ? ` • v${d.version}` : ''} • {fmtDate((d.uploaded_at || '').slice(0, 10))}</span>
                <span className={`sa-folder sa-folder--${d.folder}`}>{d.folder === 'active' ? 'Active' : 'Expiry'}</span>
              </div>
            ))}
            <div className="sa-party__title">Renewals<span>{data.history.length}</span></div>
            <div className="sa-history__item sa-history__item--current">
              <div className="sa-history__tag">CURRENT</div>
              <div className="sa-history__dates">{fmtDate(agreement.issue_date)} → {agreement.no_expiry ? 'No expiry' : fmtDate(agreement.expiry_date)}</div>
            </div>
            {data.history.length === 0 && <div className="sa-history__meta">Not renewed yet.</div>}
            {data.history.map(h => (
              <div key={h.id} className="sa-history__item">
                <div className="sa-history__dates">{fmtDate(h.issue_date)} → {fmtDate(h.expiry_date)}</div>
                <div className="sa-history__meta">
                  Renewed {fmtDate((h.renewed_at || '').slice(0, 10))}{h.renewed_by_email ? ` by ${h.renewed_by_email}` : ''}{h.notes ? ` • ${h.notes}` : ''}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Confirm Terminate for a contract that ended without renewal. */
export function ServiceAgreementCloseModal({ agreement, busy, onCancel, onConfirm }: {
  agreement: ServiceAgreement; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void;
}): React.ReactElement {
  const [note, setNote] = React.useState('');
  return (
    <Modal label="Terminate contract" busy={busy} onClose={onCancel} className="sa-modal__dialog--small">
      <div className="sa-modal__header">
        <div className="sa-modal__heading">
          <span className="sa-modal__icon sa-modal__icon--warn"><Icon iconName="Blocked2" /></span>
          <div>
            <h3 className="sa-modal__title">Terminate {agreement.contract_no}?</h3>
            <div className="sa-modal__subtitle">{agreement.agreement_name}</div>
          </div>
        </div>
      </div>
      <div className="sa-modal__body">
        <p className="sa-modal__text">
          Use this when the contract has ended and will not be renewed. Its files move to <strong>Service Agreement / Expiry</strong>.
          Nothing is deleted, and it can still be renewed later.
        </p>
        <input className="sa-modal__input" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Reason (optional), e.g. vendor changed" aria-label="Reason" />
      </div>
      <div className="sa-modal__footer sa-modal__footer--end">
        <button type="button" className="sa-btn sa-btn--secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sa-btn sa-btn--danger" onClick={() => onConfirm(note)} disabled={busy}>
          {busy ? 'Terminating…' : 'Terminate'}
        </button>
      </div>
    </Modal>
  );
}
