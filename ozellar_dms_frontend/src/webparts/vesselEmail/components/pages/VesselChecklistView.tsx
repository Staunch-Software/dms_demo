import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, DMS_TABLE_CARD, DMS_TABLE, DMS_TH, DMS_TR, DMS_TD } from '../dmsDesignSystem';

interface ChecklistCertificate {
  id: number;
  certificate_number?: string | null;
  issuing_authority?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  has_no_expiry?: boolean;
  responsible_person?: string | null;
  filename?: string | null;
  sharepoint_file_url?: string | null;
}

interface ChecklistItem {
  certificate_master_id: number;
  certificate_name: string;
  category: string;
  status: 'valid' | 'due_soon' | 'overdue' | 'missing';
  certificate: ChecklistCertificate | null;
}

interface ChecklistData {
  vessel: { id: number; name: string; imo?: string | null; vessel_type?: string | null };
  required_count: number;
  missing_count: number;
  items: ChecklistItem[];
}

export interface VesselChecklistViewProps {
  host: VesselEmail;
  refreshKey: number;
  /** Vessels to show, one collapsible section each (chosen in the Certificates toolbar). */
  vesselIds: number[];
  searchQuery?: string;
  categoryFilter?: string;
  onAdd: (vesselId: number, masterId: number) => void;
  /** Edit / Renew receive a row shaped like the Certificates list items. */
  onEdit: (cert: any, mode?: 'view' | 'edit') => void;
  onRenew: (cert: any) => void;
  onHistory?: (cert: any) => void;
}

interface SectionProps {
  host: VesselEmail;
  vesselId: number;
  vesselName: string;
  open: boolean;
  onToggle: () => void;
  refreshKey: number;
  searchQuery?: string;
  categoryFilter?: string;
  onAdd: VesselChecklistViewProps['onAdd'];
  onEdit: VesselChecklistViewProps['onEdit'];
  onRenew: VesselChecklistViewProps['onRenew'];
  onHistory?: VesselChecklistViewProps['onHistory'];
}

function VesselChecklistSection({
  host,
  vesselId,
  vesselName,
  open,
  onToggle,
  refreshKey,
  searchQuery,
  categoryFilter,
  onAdd,
  onEdit,
  onRenew,
  onHistory,
}: SectionProps): React.ReactElement {
  const [data, setData] = React.useState<ChecklistData | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'missing' | 'valid'>('all');
  const [openActionMenuId, setOpenActionMenuId] = React.useState<number | null>(null);

  // Close action dropdown on outside click
  React.useEffect(() => {
    if (!openActionMenuId) return;
    const handleOutsideClick = () => setOpenActionMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [openActionMenuId]);

  // Loaded when the section is open (so a long fleet doesn't fetch every checklist up front).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${host._base()}/api/certificates/vessel/${vesselId}/checklist`, { headers: host._headers(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Failed to load checklist (HTTP ${r.status})`))))
      .then((d: ChecklistData) => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load checklist'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [host, vesselId, refreshKey, open]);

  // A row in the same shape the Certificates list uses, for the Edit / Renew dialogs.
  const asListItem = (item: ChecklistItem): any => ({
    ...item.certificate,
    vessel_id: data?.vessel.id,
    vessel_name: data?.vessel.name,
    vessel_imo: data?.vessel.imo,
    vessel_type: data?.vessel.vessel_type,
    certificate_master_id: item.certificate_master_id,
    certificate_name: item.certificate_name,
    category: item.category,
    status: item.status,
  });

  // Records-style circular status badge
  const renderStatusBadge = (status: string, cert?: ChecklistCertificate | null): React.ReactElement => {
    const daysLeft = cert && cert.expiry_date && !cert.has_no_expiry
      ? Math.ceil((new Date(cert.expiry_date).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
      : null;

    if (status === 'overdue' || (daysLeft !== null && daysLeft < 0)) {
      return (
        <span
          title="Overdue - Immediate action required"
          aria-label="Overdue"
          className="vessel-checklist-view-i1" style={{ width: 26, background: clay.pillDangerBg, color: clay.pillDangerText }}
        >
          <Icon iconName="StatusErrorFull" className="vessel-checklist-view-i2" />
        </span>
      );
    }
    if (daysLeft !== null && daysLeft <= 7) {
      return (
        <span
          title={`Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} - Urgent survey required`}
          aria-label="Due in 7 days"
          className="vessel-checklist-view-i3" style={{ width: 26, background: '#ffedd5', color: '#ea580c' }}
        >
          <Icon iconName="Warning" className="vessel-checklist-view-i2" />
        </span>
      );
    }
    if (status === 'due_soon' || (daysLeft !== null && daysLeft <= 30)) {
      return (
        <span
          title="Expiring Soon - Renewal window open"
          aria-label="Expiring Soon"
          className="vessel-checklist-view-i4" style={{ width: 26, background: clay.pillWarnBg, color: clay.pillWarnText }}
        >
          <Icon iconName="Clock" className="vessel-checklist-view-i2" />
        </span>
      );
    }
    if (daysLeft !== null && daysLeft <= 90) {
      return (
        <span
          title={`Due in ${daysLeft} days - Planning & preparation`}
          aria-label="Due in 90 days"
          className="vessel-checklist-view-i5" style={{ width: 26, background: '#e0f2fe', color: '#0284c7' }}
        >
          <Icon iconName="HourGlass" className="vessel-checklist-view-i2" />
        </span>
      );
    }
    if (status === 'missing') {
      return (
        <span
          title="Missing - Unfulfilled mandatory certificate"
          aria-label="Missing"
          className="vessel-checklist-view-i6" style={{ width: 26 }}
        >
          <Icon iconName="DocumentSearch" className="vessel-checklist-view-i2" />
        </span>
      );
    }
    return (
      <span
        title="Valid - Statutory compliance verified"
        aria-label="Valid"
        className="vessel-checklist-view-i7" style={{ width: 26, background: clay.pillActiveBg, color: clay.pillActiveText }}
      >
        <Icon iconName="StatusCircleCheckmark" className="vessel-checklist-view-i2" />
      </span>
    );
  };

  // Filtered items based on Top Search, Category Dropdown, and Section Status Pills
  const filteredItems = React.useMemo(() => {
    if (!data) return [];
    let items = data.items;

    // Filter by Top Category dropdown
    if (categoryFilter && categoryFilter !== 'all') {
      const cats = categoryFilter.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (cats.length > 0) {
        items = items.filter(it => it.category && cats.indexOf(it.category.toLowerCase()) !== -1);
      }
    }

    // Filter by Top Search query (cert name or cert number)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(it =>
        (it.certificate_name || '').toLowerCase().includes(q) ||
        (it.certificate?.certificate_number || '').toLowerCase().includes(q)
      );
    }

    // Filter by Section Status Pill
    if (statusFilter === 'missing') {
      items = items.filter(it => it.status === 'missing');
    } else if (statusFilter === 'valid') {
      items = items.filter(it => it.status === 'valid');
    }

    return items;
  }, [data, categoryFilter, searchQuery, statusFilter]);

  const validCount = data ? data.required_count - data.missing_count : 0;
  const missingCount = data ? data.missing_count : 0;

  return (
    <div className="vessel-checklist-view-i8" style={{ borderRadius: 12, background: 'var(--vdms-surface)' }}>

      {/* Accordion Header */}
      <div
        className="vdms-chk-head"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 46,
          padding: '8px 14px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          background: 'var(--vdms-surface-alt)',
          color: 'var(--vdms-text)',
          borderBottom: open ? '1px solid var(--vdms-line)' : 'none',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div className="vessel-checklist-view-i9">
          <Icon iconName={open ? 'ChevronDown' : 'ChevronRight'} className="vessel-checklist-view-i10" style={{ width: 12 }} />
          <Icon iconName="Ferry" className="vessel-checklist-view-i11" style={{ color: clay.accent }} />
          <span className="vessel-checklist-view-i12">{vesselName}</span>
          {data?.vessel.vessel_type && (
            <span className="vessel-checklist-view-i13" style={{ borderRadius: 6, background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}>
              {data.vessel.vessel_type}
            </span>
          )}
          {data?.vessel.imo && (
            <span className="vessel-checklist-view-i14">
              IMO {data.vessel.imo}
            </span>
          )}
        </div>

        {/* In-Vessel Quick Filter Pills (All / Missing / Valid) */}
        {data && (
          <div
            className="vessel-checklist-view-i15"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="vessel-checklist-view-i16" style={{ borderRadius: 12, border: `1px solid ${statusFilter === 'all' ? clay.accent : 'var(--vdms-line)'}`, background: statusFilter === 'all' ? clay.accentSoft : 'var(--vdms-surface)', color: statusFilter === 'all' ? clay.accent : 'var(--vdms-text-muted)' }}
            >
              All ({data.items.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('missing')}
              className="vessel-checklist-view-i16" style={{ borderRadius: 12, border: `1px solid ${statusFilter === 'missing' ? '#b91c1c' : '#fecdd3'}`, background: statusFilter === 'missing' ? '#b91c1c' : clay.pillDangerBg, color: statusFilter === 'missing' ? '#ffffff' : clay.pillDangerText }}
            >
              {missingCount} Missing
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('valid')}
              className="vessel-checklist-view-i16" style={{ borderRadius: 12, border: `1px solid ${statusFilter === 'valid' ? '#15803d' : '#bbf7d0'}`, background: statusFilter === 'valid' ? '#15803d' : clay.pillActiveBg, color: statusFilter === 'valid' ? '#ffffff' : clay.pillActiveText }}
            >
              {validCount} Valid
            </button>
            <span className="vessel-checklist-view-i17">
              ({data.required_count} total required)
            </span>
          </div>
        )}
      </div>

      {open && error && (
        <div className="vessel-checklist-view-i18" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}>
          {error}
        </div>
      )}
      {open && loading && <div className="vessel-checklist-view-i19">Loading checklist...</div>}

      {open && data && !loading && (
        <div className="vessel-checklist-view-i20">
          {filteredItems.length === 0 ? (
            <div className="vessel-checklist-view-i21">
              {data.items.length === 0
                ? 'No certificates are marked as required for this vessel.'
                : 'No certificates match the selected filters.'}
            </div>
          ) : (
            <table className="vdms-chk-table" style={{ ...{ ...DMS_TABLE, borderCollapse: 'separate', borderSpacing: 0 }, tableLayout: 'fixed', minWidth: 920 }}>
              <colgroup>
                <col className="vessel-checklist-view-i22" />
                <col style={{ width: '18%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col className="vessel-checklist-view-i23" />
                <col className="vessel-checklist-view-i24" />
                <col className="vessel-checklist-view-i25" />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)' }}>Certificate Name</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)' }}>Cert Number</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)' }}>Issue Date</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)' }}>Expiry Date</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)', textAlign: 'center' }}>Doc</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)', textAlign: 'center' }}>Status</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--vdms-surface-alt)', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const c = item.certificate;
                  return (
                    <tr key={item.certificate_master_id} style={{ ...DMS_TR, background: c ? undefined : 'rgba(254, 242, 242, 0.35)' }}>
                      <td style={DMS_TD}>
                        <div className="vessel-checklist-view-i26">{item.certificate_name}</div>
                        <div className="vessel-checklist-view-i27">{item.category}</div>
                      </td>
                      {c ? (
                        <>
                          <td style={{ ...DMS_TD, fontVariantNumeric: 'tabular-nums' }}>
                            {c.certificate_number ? (
                              <span
                                className="vdms-cert-no-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(asListItem(item), 'view');
                                }}
                                title={`View certificate ${c.certificate_number}`}
                                style={{
                                  cursor: 'pointer',
                                  color: 'var(--vdms-text)',
                                  fontWeight: 600,
                                  fontSize: 'inherit',
                                  fontFamily: 'inherit',
                                  fontVariantNumeric: 'tabular-nums',
                                  textAlign: 'left',
                                  display: 'inline-block',
                                  border: 'none',
                                  outline: 'none',
                                  boxShadow: 'none',
                                  background: 'transparent',
                                  userSelect: 'none',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#0284c7';
                                  e.currentTarget.style.outline = 'none';
                                  e.currentTarget.style.border = 'none';
                                  e.currentTarget.style.boxShadow = 'none';
                                  e.currentTarget.style.background = 'transparent';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'var(--vdms-text)';
                                  e.currentTarget.style.outline = 'none';
                                  e.currentTarget.style.border = 'none';
                                  e.currentTarget.style.boxShadow = 'none';
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <span>{c.certificate_number}</span>
                              </span>
                            ) : (
                              <span className="vessel-checklist-view-i28">—</span>
                            )}
                          </td>
                          <td style={{ ...DMS_TD, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.issue_date ? c.issue_date.slice(0, 10) : '—'}</td>
                          <td style={{ ...DMS_TD, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {c.has_no_expiry ? (
                              <span className="vessel-checklist-view-i29" style={{ color: clay.accent }}>Permanent</span>
                            ) : (
                              c.expiry_date ? c.expiry_date.slice(0, 10) : '—'
                            )}
                          </td>
                          <td style={{ ...DMS_TD, textAlign: 'center' }}>
                            {c.sharepoint_file_url ? (
                              <a
                                href={c.sharepoint_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open Certificate in SharePoint"
                                className="vessel-checklist-view-i30" style={{ color: '#0284c7' }}
                              >
                                <Icon iconName="PDF" className="vessel-checklist-view-i31" style={{ color: '#0284c7' }} />
                              </a>
                            ) : (
                              <span className="vessel-checklist-view-i32">—</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td style={{ ...DMS_TD, color: '#e11d48', fontSize: 12, fontWeight: 500 }} colSpan={4}>
                          <div className="vessel-checklist-view-i15">
                            <Icon iconName="Warning" className="vessel-checklist-view-i33" />
                            <span>No certificate on record &mdash; Required for statutory vetting</span>
                          </div>
                        </td>
                      )}
                      <td style={{ ...DMS_TD, textAlign: 'center' }}>{renderStatusBadge(item.status, c)}</td>
                      <td style={{ ...DMS_TD, textAlign: 'center' }}>
                        {c ? (
                          <div className="vessel-checklist-view-i34">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuId(openActionMenuId === item.certificate_master_id ? null : item.certificate_master_id);
                              }}
                              title="Actions menu"
                              style={{
                                ...dmsBtn('ghost'),
                                width: 30,
                                height: 28,
                                padding: 0,
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--vdms-text-muted)',
                                border: '1px solid var(--vdms-line)',
                                cursor: 'pointer',
                              }}
                            >
                              <Icon iconName="MoreVertical" className="vessel-checklist-view-i2" />
                            </button>
                            {openActionMenuId === item.certificate_master_id && (
                              <div
                                role="menu"
                                className="vessel-checklist-view-i35" style={{ minWidth: 155, borderRadius: 8, border: '1px solid var(--vdms-line, #e2e8f0)' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="vdms-chk-action-dropdown-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onRenew(asListItem(item));
                                  }}
                                >
                                  <Icon iconName="RenewalCurrent" className="vessel-checklist-view-i36" style={{ color: clay.accent, width: 16 }} />
                                  <span>Renew</span>
                                </button>
                                <button
                                  type="button"
                                  className="vdms-chk-action-dropdown-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onEdit(asListItem(item), 'edit');
                                  }}
                                >
                                  <Icon iconName="Edit" className="vessel-checklist-view-i37" style={{ width: 16 }} />
                                  <span>Edit</span>
                                </button>
                                {onHistory && (
                                  <button
                                    type="button"
                                    className="vdms-chk-action-dropdown-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onHistory(asListItem(item));
                                    }}
                                  >
                                    <Icon iconName="History" className="vessel-checklist-view-i37" style={{ width: 16 }} />
                                    <span>Version History</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAdd(data.vessel.id, item.certificate_master_id)}
                            style={{
                              ...dmsBtn('primary'),
                              height: 28,
                              padding: '0 10px',
                              fontSize: 11.5,
                              gap: 4,
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Add missing certificate"
                          >
                            <Icon iconName="Add" className="vessel-checklist-view-i38" />
                            <span>Add</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function VesselChecklistView({
  host,
  refreshKey,
  vesselIds,
  searchQuery,
  categoryFilter,
  onAdd,
  onEdit,
  onRenew,
  onHistory,
}: VesselChecklistViewProps): React.ReactElement {
  // Which sections are expanded: with a few vessels all open, with many only the first three.
  const [openMap, setOpenMap] = React.useState<Record<number, boolean>>({});
  const isOpen = (id: number, idx: number): boolean => (openMap[id] !== undefined ? openMap[id] : idx < 3);

  // When filtered to a single vessel (e.g. redirected from Matrix View), ensure it is expanded
  React.useEffect(() => {
    if (vesselIds.length === 1) {
      setOpenMap({ [vesselIds[0]]: true });
    }
  }, [vesselIds.join(',')]);

  const nameOf = (id: number): string => {
    const v: any = (host.state.vessels || []).filter((x: any) => String(x.id) === String(id))[0];
    return v ? v.name : `Vessel ${id}`;
  };

  return (
    <div
      className="vdms-chk-scroll"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingRight: 4 }}
    >
      {vesselIds.length === 0 && (
        <div className="vessel-checklist-view-i39">
          Select one or more vessels to see the certificates they need.
        </div>
      )}
      {vesselIds.map((id, idx) => (
        <VesselChecklistSection
          key={id}
          host={host}
          vesselId={id}
          vesselName={nameOf(id)}
          open={isOpen(id, idx)}
          onToggle={() => setOpenMap(m => ({ ...m, [id]: !isOpen(id, idx) }))}
          refreshKey={refreshKey}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
          onAdd={onAdd}
          onEdit={onEdit}
          onRenew={onRenew}
          onHistory={onHistory}
        />
      ))}
    </div>
  );
}
