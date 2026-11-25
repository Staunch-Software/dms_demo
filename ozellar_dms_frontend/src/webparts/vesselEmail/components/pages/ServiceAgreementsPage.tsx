import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { DmsPageHeader, DmsEmptyState, DmsLoadingState } from '../dmsDesignSystem';
import {
  ServiceAgreementModal, ServiceAgreementHistoryModal, ServiceAgreementCloseModal,
  type ServiceAgreement, type ServiceAgreementOptions, type ServiceAgreementModalMode,
} from '../modals/ServiceAgreementModal';
import { CustomDropdown, type CustomDropdownOption } from '../CustomDropdown';

// Styles: styles/pages/_service-agreements.scss

type StatusTab = 'all' | 'draft' | 'pending_approval' | 'active' | 'expiring' | 'expired' | 'terminated';

const STATUS_LABEL: Record<ServiceAgreement['status'], string> = {
  draft: 'Draft', pending_approval: 'Pending Approval',
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

const APPLIES_LABEL: Record<string, string> = {
  all_ships: 'All vessels', vessels: 'Selected vessels', newbuilding: 'Newbuilding (hull number)',
  project: 'Project', shore_office: 'Shore office', none: 'Not applicable',
};

const STATUS_TEXT: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending Approval', active: 'Active', expiring: 'Expiring',
  expired: 'Expired', terminated: 'Terminated',
};

/** Everything about one contract, shown when its row is opened with the arrow. */
function ContractDetails({ a }: { a: ServiceAgreement }): React.ReactElement {
  const item = (label: string, value: React.ReactNode, wide?: boolean): React.ReactElement => (
    <div className={`sa-detail__item${wide ? ' sa-detail__item--wide' : ''}`}>
      <span className="sa-detail__label">{label}</span>
      <span className="sa-detail__value">{value === null || value === undefined || value === '' ? '-' : value}</span>
    </div>
  );
  const parties = a.parties || [];
  const byRole = (role: string): typeof parties => parties.filter(p => p.role === role);
  const partyCard = (title: string, p: (typeof parties)[number] | null | undefined): React.ReactElement => (
    <div className="sa-detail__party">
      <div className="sa-detail__party-title">{title}</div>
      {p ? (
        <>
          <div className="sa-detail__party-name">{p.name}</div>
          <div><Icon iconName="Contact" /> {p.pic || '-'}</div>
          <div><Icon iconName="Phone" /> {p.phone || '-'}</div>
          <div><Icon iconName="Mail" /> {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : '-'}</div>
          <div><Icon iconName="POI" /> {p.address || '-'}</div>
        </>
      ) : <div>-</div>}
    </div>
  );
  const applies = a.applies_to === 'vessels'
    ? (a.vessels || []).map(v => v.name).join(', ')
    : `${APPLIES_LABEL[a.applies_to] || a.applies_to}${a.applies_to_detail ? `: ${a.applies_to_detail}` : ''}`;
  const docs = a.documents || [];
  return (
    <div className="sa-detail">
      <section className="sa-detail__section">
        <h4>Contract</h4>
        <div className="sa-detail__grid">
          {item('Contract Number', a.contract_no)}
          {item('External Contract Number', a.vendor_reference)}
          {item('Status', STATUS_TEXT[a.status] || a.status)}
          {item('Contract Title', a.agreement_name, true)}
          {item('Brief Description', a.description, true)}
          {item('Contract Category', a.category)}
          {item('Business Unit', a.business_unit)}
          {item('Confidentiality', a.confidentiality)}
          {item('Contract Owner / PIC', a.owner_name ? `${a.owner_name}${a.owner_email ? ` (${a.owner_email})` : ''}` : a.owner_email)}
          {item('Applicable Vessel / Project', applies, true)}
          {a.remarks && item('Remarks', a.remarks, true)}
        </div>
      </section>
      <section className="sa-detail__section">
        <h4>Dates &amp; Renewal</h4>
        <div className="sa-detail__grid">
          {item('Contract Date', fmtDate(a.contract_date))}
          {item('Effective / Commencement Date', fmtDate(a.issue_date))}
          {item('Initial Expiry Date', a.no_expiry ? 'No Expiry / Perpetual' : fmtDate(a.initial_expiry_date))}
          {item('Current Expiry Date', a.no_expiry ? 'No Expiry / Perpetual' : fmtDate(a.expiry_date))}
          {item('Auto-Renewal', a.auto_renewal ? 'Yes' : 'No')}
          {item('Renewal Period', a.renewal_period_value ? `${a.renewal_period_value} ${a.renewal_period_unit || ''}` : null)}
          {item('Termination / Non-Renewal Notice Period', a.notice_period_days !== null && a.notice_period_days !== undefined ? `${a.notice_period_days} days` : 'Not applicable')}
          {item('Reminder Date', a.no_expiry ? 'No reminder' : fmtDate(a.reminder_date))}
        </div>
      </section>
      <section className="sa-detail__section sa-detail__section--full">
        <h4>Parties</h4>
        <div className="sa-detail__parties">
          {partyCard('First Party / Company', byRole('first')[0] || a.first_party)}
          {partyCard('Second Party / Counterparty', byRole('second')[0] || a.second_party)}
          {byRole('additional').map((p, i) => <React.Fragment key={i}>{partyCard(`Additional Party ${i + 1}`, p)}</React.Fragment>)}
        </div>
      </section>
      <section className="sa-detail__section sa-detail__section--full">
        <h4>Attachments<span className="sa-detail__count">{docs.length}</span></h4>
        {docs.length === 0 ? <div className="sa-detail__value">No files</div> : (
          <div className="sa-detail__docs">
            {docs.map(d => (
              <div key={d.id} className="sa-detail__doc">
                <Icon iconName="PDF" />
                {d.sharepoint_file_url
                  ? <a href={d.sharepoint_file_url} target="_blank" rel="noopener noreferrer" title={d.filename || ''}>{d.filename || 'File'}</a>
                  : <span>{d.filename || 'File'}</span>}
                <span className="sa-detail__doc-meta">{d.document_type}{d.version ? ` • v${d.version}` : ''} • {fmtDate((d.uploaded_at || '').slice(0, 10))}</span>
                <span className={`sa-folder sa-folder--${d.folder}`}>{d.folder === 'active' ? 'Current' : (a.status === 'terminated' ? 'Terminated' : 'Superseded')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
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
  const [vessels, setVessels] = React.useState<string[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [units, setUnits] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState<string>('');
  const [query, setQuery] = React.useState<string>('');

  const [modal, setModal] = React.useState<{ mode: ServiceAgreementModalMode; agreement: ServiceAgreement | null } | null>(null);
  const [opening, setOpening] = React.useState<number | null>(null);
  const [historyFor, setHistoryFor] = React.useState<ServiceAgreement | null>(null);
  const [closing, setClosing] = React.useState<ServiceAgreement | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Opened rows: the full contract (parties + files) is loaded when a row is opened.
  const [open, setOpen] = React.useState<Record<number, ServiceAgreement | 'loading' | 'error'>>({});

  const toggleRow = async (a: ServiceAgreement): Promise<void> => {
    if (open[a.id]) {
      setOpen(o => { const n = { ...o }; delete n[a.id]; return n; });
      return;
    }
    setOpen(o => ({ ...o, [a.id]: 'loading' }));
    try {
      const res = await fetch(`${host._base()}/api/service-agreements/${a.id}`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`error ${res.status}`);
      const full: ServiceAgreement = await res.json();
      setOpen(o => (o[a.id] ? { ...o, [a.id]: full } : o));
    } catch {
      setOpen(o => (o[a.id] ? { ...o, [a.id]: 'error' } : o));
    }
  };

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
      if (vessels.length) qs.set('vessel_id', vessels.join(','));
      if (categories.length) qs.set('category', categories.join(','));
      if (units.length) qs.set('business_unit', units.join(','));
      if (query) qs.set('q', query);
      const res = await fetch(`${host._base()}/api/service-agreements?${qs.toString()}`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`error ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || {});
      setOpen({});
    } catch (e) {
      setError(`Could not load contracts (${(e as Error).message}).`);
    } finally {
      setLoading(false);
    }
  }, [host, tab, vessels, categories, units, query]);

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
    const wasRenew = modal?.mode === 'renew';
    let verb: string;
    if (saved.status === 'pending_approval') {
      const owner = saved.owner_name || saved.owner_email || 'the Contract Owner';
      verb = wasRenew ? `renewed and sent to ${owner} for approval` : `sent to ${owner} for approval`;
    } else {
      verb = !modal || modal.mode === 'add' ? 'saved' : wasRenew ? 'renewed' : 'updated';
    }
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

  const total = ['draft', 'pending_approval', 'active', 'expiring', 'expired', 'terminated'].reduce((n, k) => n + (counts[k] || 0), 0);
  const tabs: Array<{ id: StatusTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: total },
    { id: 'draft', label: 'Draft', count: counts.draft || 0 },
    { id: 'pending_approval', label: 'Pending Approval', count: counts.pending_approval || 0 },
    { id: 'active', label: 'Active', count: counts.active || 0 },
    { id: 'expiring', label: 'Expiring', count: counts.expiring || 0 },
    { id: 'expired', label: 'Expired', count: counts.expired || 0 },
    { id: 'terminated', label: 'Terminated', count: counts.terminated || 0 },
  ];
  const categoryOptions: CustomDropdownOption[] = React.useMemo(() => [
    ...(options?.categories || []).map(c => ({ key: c, text: c })),
  ], [options?.categories]);

  const unitOptions: CustomDropdownOption[] = React.useMemo(() => [
    ...(options?.business_units || []).map(u => ({ key: u, text: u })),
  ], [options?.business_units]);

  const vesselSelectOptions: CustomDropdownOption[] = React.useMemo(() => [
    ...(options?.vessels || []).map(v => ({ key: String(v.id), text: v.name })),
  ], [options?.vessels]);

  const filtered = !!(query || vessels.length || categories.length || units.length);
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
          <CustomDropdown
            className="sa-filter-dropdown"
            options={categoryOptions}
            multiSelect
            selectedKeys={categories}
            onMultiChange={setCategories}
            placeholder="All categories"
            searchPlaceholder="Search categories..."
            visibleRows={4}
            enableSearch={true}
            height={34}
          />
          <CustomDropdown
            className="sa-filter-dropdown"
            options={unitOptions}
            multiSelect
            selectedKeys={units}
            onMultiChange={setUnits}
            placeholder="All business units"
            searchPlaceholder="Search business units..."
            visibleRows={4}
            enableSearch={true}
            height={34}
          />
          <CustomDropdown
            className="sa-filter-dropdown"
            options={vesselSelectOptions}
            multiSelect
            selectedKeys={vessels}
            onMultiChange={setVessels}
            placeholder="All vessels"
            searchPlaceholder="Search vessels..."
            visibleRows={4}
            enableSearch={true}
            height={34}
          />
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
            <colgroup>
              <col className="sa-col--toggle" />
              <col className="sa-col--no" />
              <col className="sa-col--title" />
              <col className="sa-col--desc" />
              <col className="sa-col--cat" />
              <col className="sa-col--owner" />
              <col className="sa-col--party" />
              <col className="sa-col--party" />
              <col className="sa-col--expiry" />
              <col className="sa-col--status" />
              <col className="sa-col--actions" />
            </colgroup>
            <thead>
              <tr>
                <th aria-label="Details" />
                <th title="Contract No">Contract No</th>
                <th title="Contract Title">Contract Title</th>
                <th title="Brief Description">Brief Description</th>
                <th title="Category">Category</th>
                <th title="Owner / PIC">Owner / PIC</th>
                <th title="First Party">First Party</th>
                <th title="Second Party">Second Party</th>
                <th title="Current Expiry">Current Expiry</th>
                <th title="Status">Status</th>
                <th className="sa-table__actions-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => {
                const state = open[a.id];
                const second = a.second_party?.name || a.vendor || '';
                return (
                  <React.Fragment key={a.id}>
                    <tr className={state ? 'is-open' : ''}>
                      <td className="sa-table__toggle" data-label="">
                        <button type="button" className="sa-expand" aria-expanded={!!state}
                          aria-label={state ? `Hide details of ${a.contract_no}` : `Show all details of ${a.contract_no}`}
                          title={state ? 'Hide details' : 'Show all details'} onClick={() => void toggleRow(a)}>
                          <Icon iconName="ChevronDown" />
                        </button>
                      </td>
                      <td className="sa-table__no" data-label="Contract No">
                        <span className="sa-cell" title={a.contract_no}>{a.contract_no}</span>
                        {a.vendor_reference && <span className="sa-table__sub sa-cell" title={`External Contract No: ${a.vendor_reference}`}>Ext: {a.vendor_reference}</span>}
                        {a.confidentiality && a.confidentiality !== 'General' && (
                          <span className={`sa-conf sa-conf--${a.confidentiality.toLowerCase()}`} title={`Confidentiality: ${a.confidentiality}`}>
                            <Icon iconName="Lock" /> {a.confidentiality}
                          </span>
                        )}
                      </td>
                      <td className="sa-table__name" data-label="Title">
                        <span className="sa-table__name-line">
                          {a.sharepoint_file_url
                            ? <a className="sa-cell" href={a.sharepoint_file_url} target="_blank" rel="noopener noreferrer" title={`${a.agreement_name} (open ${a.filename || 'contract'})`}>{a.agreement_name}</a>
                            : <span className="sa-cell" title={a.agreement_name}>{a.agreement_name}</span>}
                          {a.remarks && <RemarksHint text={a.remarks} />}
                        </span>
                      </td>
                      <td className="sa-table__desc" data-label="Description"><span title={a.description || ''}>{a.description || '-'}</span></td>
                      <td data-label="Category">
                        <span className="sa-cell" title={a.category || ''}>{a.category || '-'}</span>
                        {a.business_unit && <span className="sa-table__sub sa-cell" title={`Business Unit: ${a.business_unit}`}>{a.business_unit}</span>}
                      </td>
                      <td data-label="Owner / PIC"><span className="sa-cell" title={a.owner_email || ''}>{a.owner_name || a.owner_email || '-'}</span></td>
                      <td data-label="First Party"><span className="sa-cell" title={a.first_party?.name || ''}>{a.first_party?.name || '-'}</span></td>
                      <td data-label="Second Party"><span className="sa-cell" title={second}>{second || '-'}</span></td>
                      <td className="sa-table__date" data-label="Current Expiry">
                        <span className="sa-cell">{a.no_expiry ? 'No expiry' : fmtDate(a.expiry_date)}</span>
                        <span className={`sa-table__sub sa-cell sa-days sa-days--${a.status}`}>{expiryHint(a)}</span>
                        {a.reminder_date && a.status !== 'terminated' && (
                          <span className="sa-table__sub sa-cell" title={`Reminder Date: ${fmtDate(a.reminder_date)} (Current Expiry minus Notice Period)`}>Reminder: {fmtDate(a.reminder_date)}</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`sa-status sa-status--${a.status}`}>{STATUS_LABEL[a.status]}</span>
                        {a.status === 'pending_approval' && (
                          <span className="sa-table__sub sa-cell" title="Waiting for the Contract Owner to approve or reject via email">
                            {a.approval_kind === 'renewal' ? 'Renewal awaiting' : 'Awaiting'} {a.owner_name || a.owner_email || 'owner'}
                          </span>
                        )}
                      </td>
                      <td className="sa-table__actions" data-label="">
                        <button type="button" className="sa-row-btn sa-row-btn--icon" disabled={opening === a.id} onClick={() => void openFull(a, 'edit')} title="Edit" aria-label="Edit">
                          <Icon iconName="Edit" />
                        </button>
                        {(a.status === 'active' || a.status === 'expiring' || a.status === 'expired') && (
                          <button type="button" className="sa-row-btn sa-row-btn--icon sa-row-btn--accent" disabled={opening === a.id} onClick={() => void openFull(a, 'renew')} title="Renew: upload the renewed contract (the Contract Owner must approve it by email before it's final)" aria-label="Renew">
                            <Icon iconName="Sync" />
                          </button>
                        )}
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
                    {state && (
                      <tr className="sa-detail-row">
                        <td colSpan={11}>
                          {state === 'loading' ? <div className="sa-detail__msg">Loading details…</div>
                            : state === 'error' ? <div className="sa-detail__msg">Could not load the details. Close and open the row again.</div>
                              : <ContractDetails a={state} />}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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
