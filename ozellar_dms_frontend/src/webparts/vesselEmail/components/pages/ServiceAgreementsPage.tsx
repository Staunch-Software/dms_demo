import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { DmsPageHeader, DmsEmptyState, DmsLoadingState } from '../dmsDesignSystem';
import {
  ServiceAgreementModal, ServiceAgreementHistoryModal, ServiceAgreementCloseModal,
  type ServiceAgreement, type ServiceAgreementOptions, type ServiceAgreementModalMode,
} from '../modals/ServiceAgreementModal';

// Styles: styles/pages/_service-agreements.scss

type StatusTab = 'all' | 'active' | 'expiring' | 'expired' | 'terminated';

const STATUS_LABEL: Record<ServiceAgreement['status'], string> = {
  active: 'Active', expiring: 'Expiring', expired: 'Expired', terminated: 'Terminated',
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const expiryHint = (a: ServiceAgreement): string => {
  if (a.status === 'terminated') return 'Terminated';
  if (a.no_expiry) return 'Perpetual';
  const d = a.days_left;
  if (d === null) return '';
  if (d < 0) return `Expired ${-d} day${d === -1 ? '' : 's'} ago`;
  if (d === 0) return 'Expires today';
  return `${d} day${d === 1 ? '' : 's'} left`;
};

/** Remarks in a small popover while the pointer is on the note icon (or it has keyboard focus). */
function RemarksHint({ text }: { text: string }): React.ReactElement {
  return (
    <span className="sa-remarks">
      <button type="button" className="sa-remarks__btn" aria-label="Remarks"><Icon iconName="Comment" /></button>
      <span role="tooltip" className="sa-remarks__pop"><strong>Remarks</strong>{text}</span>
    </span>
  );
}

export function ServiceAgreementsPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [items, setItems] = React.useState<ServiceAgreement[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({ active: 0, expiring: 0, expired: 0, terminated: 0 });
  const [options, setOptions] = React.useState<ServiceAgreementOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const [tab, setTab] = React.useState<StatusTab>('all');
  const [vesselId, setVesselId] = React.useState<string>('');
  const [category, setCategory] = React.useState<string>('');
  const [unit, setUnit] = React.useState<string>('');
  const [search, setSearch] = React.useState<string>('');
  const [query, setQuery] = React.useState<string>('');

  const [modal, setModal] = React.useState<{ mode: ServiceAgreementModalMode; agreement: ServiceAgreement | null } | null>(null);
  const [opening, setOpening] = React.useState<number | null>(null);
  const [historyFor, setHistoryFor] = React.useState<ServiceAgreement | null>(null);
  const [closing, setClosing] = React.useState<ServiceAgreement | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadOptions = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${host._base()}/api/service-agreements/options`, { headers: host._headers(), cache: 'no-store' });
      if (res.ok) setOptions(await res.json());
    } catch { /* the form still opens; its dropdowns stay empty */ }
  }, [host]);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: tab });
      if (vesselId) qs.set('vessel_id', vesselId);
      if (category) qs.set('category', category);
      if (unit) qs.set('business_unit', unit);
      if (query) qs.set('q', query);
      const res = await fetch(`${host._base()}/api/service-agreements?${qs.toString()}`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`error ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || {});
    } catch (e) {
      setError(`Could not load contracts (${(e as Error).message}).`);
    } finally {
      setLoading(false);
    }
  }, [host, tab, vesselId, category, unit, query]);

  React.useEffect(() => { void loadOptions(); }, [loadOptions]);
  React.useEffect(() => { void load(); }, [load]);

  /** Edit / Renew need the full contract (parties + files); the list only has a summary. */
  const openFull = async (a: ServiceAgreement, mode: ServiceAgreementModalMode): Promise<void> => {
    setOpening(a.id);
    try {
      const res = await fetch(`${host._base()}/api/service-agreements/${a.id}`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`error ${res.status}`);
      setModal({ mode, agreement: await res.json() });
    } catch (e) {
      setNotice({ tone: 'warning', text: `Could not open ${a.contract_no}: ${(e as Error).message}` });
    } finally {
      setOpening(null);
    }
  };

  const onSaved = (saved: ServiceAgreement, warning?: string | null): void => {
    const verb = !modal || modal.mode === 'add' ? 'saved' : modal.mode === 'renew' ? 'renewed' : 'updated';
    setModal(null);
    setNotice(warning
      ? { tone: 'warning', text: `${saved.contract_no} ${verb}. ${warning}` }
      : { tone: 'success', text: `${saved.contract_no} ${verb}.` });
    void load();
    void loadOptions();
  };

  const terminate = async (note: string): Promise<void> => {
    if (!closing) return;
    const a = closing;
    setBusy(true);
    try {
      const res = await fetch(`${host._base()}/api/service-agreements/${a.id}/terminate`, {
        method: 'POST',
        headers: { ...host._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && typeof data.detail === 'string') ? data.detail : `error ${res.status}`);
      setNotice(data && data.warning
        ? { tone: 'warning', text: `${a.contract_no} terminated. ${data.warning}` }
        : { tone: 'success', text: `${a.contract_no} terminated. Its files are now in Service Agreement / Expiry.` });
      setClosing(null);
      void load();
    } catch (e) {
      setNotice({ tone: 'warning', text: `Could not terminate ${a.contract_no}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const total = (counts.active || 0) + (counts.expiring || 0) + (counts.expired || 0) + (counts.terminated || 0);
  const tabs: Array<{ id: StatusTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: total },
    { id: 'active', label: 'Active', count: counts.active || 0 },
    { id: 'expiring', label: 'Expiring', count: counts.expiring || 0 },
    { id: 'expired', label: 'Expired', count: counts.expired || 0 },
    { id: 'terminated', label: 'Terminated', count: counts.terminated || 0 },
  ];
  const filtered = !!(query || vesselId || category || unit);
  const addBtn = (
    <button type="button" className="sa-btn sa-btn--primary" onClick={() => setModal({ mode: 'add', agreement: null })}>
      <Icon iconName="Add" /> Add Contract
    </button>
  );

  return (
    <div className="sa-page">
      <DmsPageHeader title="Service Agreements" subtitle="Contracts with vendors and service providers. Renewals keep the same contract number.">
        {addBtn}
      </DmsPageHeader>

      {notice && (
        <div role="status" className={`sa-notice sa-notice--${notice.tone}`}>
          <Icon iconName={notice.tone === 'success' ? 'CheckMark' : 'Warning'} />
          <span className="sa-notice__text">{notice.text}</span>
          <button type="button" className="sa-notice__close" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon iconName="Cancel" /></button>
        </div>
      )}

      <div className="sa-toolbar">
        <div className="sa-tabs" role="tablist" aria-label="Status">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`sa-tab sa-tab--${t.id}${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}<span className="sa-tab__count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="sa-filters">
          <div className="sa-search">
            <Icon iconName="Search" className="sa-search__icon" />
            <input className="sa-control" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search no, title, party, owner" aria-label="Search contracts" />
          </div>
          <select className="sa-control" value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {(options?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="sa-control" value={unit} onChange={e => setUnit(e.target.value)} aria-label="Filter by business unit">
            <option value="">All business units</option>
            {(options?.business_units || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="sa-control" value={vesselId} onChange={e => setVesselId(e.target.value)} aria-label="Filter by vessel">
            <option value="">All vessels</option>
            {(options?.vessels || []).map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
          </select>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={() => void load()} title="Refresh" aria-label="Refresh">
            <Icon iconName="Refresh" />
          </button>
        </div>
      </div>

      {loading ? (
        <DmsLoadingState label="Loading contracts…" />
      ) : error ? (
        <DmsEmptyState icon="Warning" tone="danger" title="Could not load">{error}</DmsEmptyState>
      ) : items.length === 0 ? (
        <DmsEmptyState icon="TextDocument" title={filtered || tab !== 'all' ? 'Nothing to show' : 'No contracts yet'}
          action={!filtered && tab === 'all' ? addBtn : undefined}>
          {filtered || tab !== 'all'
            ? 'No contracts match these filters.'
            : 'Upload a contract: its details are read from the file and a contract number is generated on save.'}
        </DmsEmptyState>
      ) : (
        <div className="sa-table-card">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Contract No</th>
                <th>Contract Title</th>
                <th>Brief Description</th>
                <th>Category</th>
                <th>Owner / PIC</th>
                <th>First Party</th>
                <th>Second Party</th>
                <th>Current Expiry</th>
                <th>Status</th>
                <th className="sa-table__actions-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td className="sa-table__no" data-label="Contract No">
                    {a.contract_no}
                    {a.confidentiality && a.confidentiality !== 'General' && (
                      <span className={`sa-conf sa-conf--${a.confidentiality.toLowerCase()}`} title={`Confidentiality: ${a.confidentiality}`}>
                        <Icon iconName="Lock" /> {a.confidentiality}
                      </span>
                    )}
                  </td>
                  <td className="sa-table__name" data-label="Title">
                    <span className="sa-table__name-line">
                      {a.sharepoint_file_url
                        ? <a href={a.sharepoint_file_url} target="_blank" rel="noopener noreferrer" title={`Open ${a.filename || 'contract'}`}>{a.agreement_name}</a>
                        : a.agreement_name}
                      {a.remarks && <RemarksHint text={a.remarks} />}
                    </span>
                    {a.vendor_reference && <span className="sa-table__sub">Ext. {a.vendor_reference}</span>}
                  </td>
                  <td className="sa-table__desc" data-label="Description"><span title={a.description || ''}>{a.description || '-'}</span></td>
                  <td data-label="Category">
                    {a.category || '-'}
                    {a.business_unit && <span className="sa-table__sub">{a.business_unit}</span>}
                  </td>
                  <td data-label="Owner / PIC">{a.owner_name || a.owner_email || '-'}</td>
                  <td className="sa-table__party" data-label="First Party" title={a.first_party?.name || ''}>{a.first_party?.name || '-'}</td>
                  <td className="sa-table__party" data-label="Second Party" title={a.second_party?.name || a.vendor || ''}>{a.second_party?.name || a.vendor || '-'}</td>
                  <td className="sa-table__date" data-label="Current Expiry">
                    {a.no_expiry ? 'No expiry' : fmtDate(a.expiry_date)}
                    <span className={`sa-table__sub sa-days sa-days--${a.status}`}
                      title={a.reminder_date ? `Reminder date: ${fmtDate(a.reminder_date)}` : undefined}>{expiryHint(a)}</span>
                  </td>
                  <td data-label="Status"><span className={`sa-status sa-status--${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                  <td className="sa-table__actions" data-label="">
                    <button type="button" className="sa-row-btn" disabled={opening === a.id} onClick={() => void openFull(a, 'edit')} title="Edit details">
                      <Icon iconName="Edit" /><span>Edit</span>
                    </button>
                    <button type="button" className="sa-row-btn sa-row-btn--accent" disabled={opening === a.id} onClick={() => void openFull(a, 'renew')} title="Upload the renewed contract">
                      <Icon iconName="Sync" /><span>Renew</span>
                    </button>
                    <button type="button" className="sa-row-btn sa-row-btn--icon" onClick={() => setHistoryFor(a)} title="Files and renewals" aria-label="Documents and history">
                      <Icon iconName="History" />
                    </button>
                    {a.status !== 'terminated' && (
                      <button type="button" className="sa-row-btn sa-row-btn--icon" onClick={() => setClosing(a)} title="Terminate: contract ended, files move to Expiry" aria-label="Terminate">
                        <Icon iconName="Blocked2" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ServiceAgreementModal host={host} mode={modal.mode} agreement={modal.agreement} options={options}
          onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {historyFor && <ServiceAgreementHistoryModal host={host} agreement={historyFor} onClose={() => setHistoryFor(null)} />}
      {closing && (
        <ServiceAgreementCloseModal agreement={closing} busy={busy} onCancel={() => setClosing(null)} onConfirm={note => void terminate(note)} />
      )}
    </div>
  );
}
