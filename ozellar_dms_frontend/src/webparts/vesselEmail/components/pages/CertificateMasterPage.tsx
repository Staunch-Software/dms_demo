import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import {
  dmsBtn,
  dmsControlStyle,
  DmsPageHeader,
  DMS_SECTION_CARD,
  DMS_TABLE_CARD,
  dmsTone,
} from '../dmsDesignSystem';
import { CreateCertificateTypeModal } from '../modals/CreateCertificateTypeModal';
import { EditCertificateTypeModal } from '../modals/EditCertificateTypeModal';
import { SearchableSelect } from '../SearchableSelect';
import { VESSEL_TYPES } from '../constants';

interface ApplicabilityRule {
  id?: number;
  certificate_master_id: number;
  scope: string; // 'all_ships' | 'ship_type' | 'vessel'
  ship_type?: string | null;
  vessel_id?: number | null;
  is_required: boolean;
  remove?: boolean;
}

interface CertificateMasterItem {
  id: number;
  name: string;
  category: string;
  sub_category?: string | null;
  issuing_authority?: string | null;
  default_validity_years?: number | null;
  default_validity_months?: number | null;
  has_no_expiry?: boolean;
  remarks?: string | null;
  validity_note?: string | null;
  is_mandatory: boolean;
  applicability: ApplicabilityRule[];
}

interface MappingData {
  ship_types: string[];
  certificates: CertificateMasterItem[];
}

type RequirementLevel = 'none' | 'mandatory' | 'optional' | 'not_applicable';

const CATEGORY_ORDER = [
  'Safety',
  'Environment',
  'Hull & Machinery',
  'Registry & Flag',
  'Trading & Statutory',
  'Management & Crew',
  'Class',
  'General',
];

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  Safety: { label: 'Safety & Navigation (SOLAS / STCW)', icon: 'ShieldAlert' },
  Environment: { label: 'Environmental Protection (MARPOL / BWM / AFS)', icon: 'World' },
  'Hull & Machinery': { label: 'Hull, Machinery & Classification', icon: 'Engineering' },
  'Registry & Flag': { label: 'Registry, Flag & Statutory Articles', icon: 'Flag' },
  'Trading & Statutory': { label: 'Trading & Statutory Permits', icon: 'Certificate' },
  'Management & Crew': { label: 'Management, Security & Crew (ISM / ISPS / MLC)', icon: 'People' },
  Class: { label: 'Classification Society Certificates', icon: 'Certificate' },
  General: { label: 'General & Miscellaneous Statutory Documents', icon: 'DocLibrary' },
};

const CERT_COL_WIDTH = 250;
const MIN_VESSEL_COL_WIDTH = 85;

export function CertificateMasterPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');
  const [successMsg, setSuccessMsg] = React.useState<string>('');
  const [mappingData, setMappingData] = React.useState<MappingData | null>(null);

  // Modal for creating a new Certificate Type
  const [showCreateTypeModal, setShowCreateTypeModal] = React.useState<boolean>(false);
  // Modal for editing an existing Certificate Type
  const [editingMaster, setEditingMaster] = React.useState<CertificateMasterItem | null>(null);

  // Admin access check (Edit certificate type is strictly visible to admins)
  const isAdmin = React.useMemo(() => {
    if (typeof host._isAdmin === 'function') {
      return host._isAdmin();
    }
    return (host.state as any)?.userRole === 'Admin';
  }, [host, (host.state as any)?.userRole]);

  // Search & category tab
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeCategoryTab, setActiveCategoryTab] = React.useState<string>('all');

  // Matrix cell state keyed by `${certId}:${shipTypeKey}`
  // shipTypeKey can be 'all_ships' or the exact ship type string (e.g. 'Bulk Carrier')
  const [matrixLevels, setMatrixLevels] = React.useState<Record<string, RequirementLevel>>({});
  const [initialMatrixLevels, setInitialMatrixLevels] = React.useState<Record<string, RequirementLevel>>({});

  const loadMapping = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${host._base()}/api/certificates/mapping`, {
        headers: host._headers(),
      });
      if (!res.ok) {
        throw new Error(`Failed to load certificate mappings (HTTP ${res.status})`);
      }
      const data: MappingData = await res.json();
      setMappingData(data);
    } catch (err: any) {
      setError(err?.message || 'Error loading certificate mappings');
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => {
    void loadMapping();
  }, [loadMapping]);

  // Available ship types (from backend or fallback to constants)
  const shipTypesList = React.useMemo(() => {
    if (mappingData?.ship_types && mappingData.ship_types.length > 0) {
      return mappingData.ship_types;
    }
    return VESSEL_TYPES;
  }, [mappingData]);

  // Build the flat matrix state from fetched certificates and applicability rules
  React.useEffect(() => {
    if (!mappingData) return;

    const levels: Record<string, RequirementLevel> = {};

    mappingData.certificates.forEach(c => {
      // 1. All Ships universal baseline rule
      const allRule = c.applicability.find(r => r.scope === 'all_ships');
      const allLevel: RequirementLevel = allRule
        ? (allRule.is_required ? 'mandatory' : 'not_applicable')
        : (c.is_mandatory ? 'mandatory' : 'none');
      levels[`${c.id}:all_ships`] = allLevel;

      // 2. Per-ship-type rules
      shipTypesList.forEach(st => {
        const key = `${c.id}:${st}`;
        const stRule = c.applicability.find(
          r => r.scope === 'ship_type' && (r.ship_type || '').toLowerCase() === st.toLowerCase()
        );

        if (stRule) {
          levels[key] = stRule.is_required ? 'mandatory' : 'not_applicable';
        } else if (allRule) {
          // Inherits universal baseline
          levels[key] = allRule.is_required ? 'mandatory' : 'not_applicable';
        } else {
          levels[key] = 'none';
        }
      });
    });

    setMatrixLevels(levels);
    setInitialMatrixLevels(levels);
  }, [mappingData, shipTypesList]);

  // Track if any matrix cells were modified
  const hasChanges = React.useMemo(() => {
    return Object.keys(matrixLevels).some(
      key => matrixLevels[key] !== initialMatrixLevels[key]
    );
  }, [matrixLevels, initialMatrixLevels]);

  const changedCount = React.useMemo(() => {
    return Object.keys(matrixLevels).filter(
      key => matrixLevels[key] !== initialMatrixLevels[key]
    ).length;
  }, [matrixLevels, initialMatrixLevels]);

  // Toggle cell through: mandatory -> optional -> not_applicable -> mandatory
  const toggleCell = (certId: number, shipTypeKey: string): void => {
    const key = `${certId}:${shipTypeKey}`;
    const current = matrixLevels[key] || 'none';

    let next: RequirementLevel;
    if (current === 'mandatory') {
      next = 'optional';
    } else if (current === 'optional') {
      next = 'not_applicable';
    } else {
      next = 'mandatory';
    }

    setMatrixLevels(prev => ({ ...prev, [key]: next }));
  };

  // Reset to original fetched values
  const handleReset = (): void => {
    setMatrixLevels({ ...initialMatrixLevels });
    setError('');
    setSuccessMsg('');
  };

  const tableScrollRef = React.useRef<HTMLDivElement>(null);

  const minTotalTableWidth = React.useMemo(() => {
    return CERT_COL_WIDTH + (shipTypesList.length * MIN_VESSEL_COL_WIDTH);
  }, [shipTypesList.length]);

  const [hasHorizontalScroll, setHasHorizontalScroll] = React.useState<boolean>(false);

  const checkScroll = React.useCallback(() => {
    if (tableScrollRef.current) {
      const el = tableScrollRef.current;
      setHasHorizontalScroll(el.scrollWidth > el.clientWidth + 4);
    }
  }, []);

  React.useEffect(() => {
    checkScroll();
    const el = tableScrollRef.current;
    if (!el) return;
    window.addEventListener('resize', checkScroll);
    return () => {
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, loading, mappingData, shipTypesList.length]);

  // Keep scroll position at start (0) on load/filter change so table never scrolls unexpectedly
  React.useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = 0;
    }
  }, [loading, mappingData, activeCategoryTab]);

  const scrollLeft = (): void => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({ left: -(MIN_VESSEL_COL_WIDTH * 2), behavior: 'smooth' });
    }
  };

  const scrollRight = (): void => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({ left: (MIN_VESSEL_COL_WIDTH * 2), behavior: 'smooth' });
    }
  };


  // Save changes to backend
  const handleSave = async (): Promise<void> => {
    if (!mappingData) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const rulesPayload: ApplicabilityRule[] = [];

      Object.keys(matrixLevels).forEach(key => {
        if (matrixLevels[key] === initialMatrixLevels[key]) return;

        const parts = key.split(':');
        const certId = Number(parts[0]);
        const shipTypeKey = parts[1];
        const lvl = matrixLevels[key];

        const isReq = lvl === 'mandatory';
        const remove = lvl === 'none';

        if (shipTypeKey === 'all_ships') {
          rulesPayload.push({
            certificate_master_id: certId,
            scope: 'all_ships',
            is_required: isReq,
            remove,
          });
        } else {
          rulesPayload.push({
            certificate_master_id: certId,
            scope: 'ship_type',
            ship_type: shipTypeKey,
            is_required: isReq,
            remove,
          });
        }
      });

      if (rulesPayload.length === 0) {
        setSaving(false);
        return;
      }

      const res = await fetch(`${host._base()}/api/certificates/mapping`, {
        method: 'POST',
        headers: {
          ...host._headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rules: rulesPayload }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Failed to save mapping (HTTP ${res.status})`);
      }

      setInitialMatrixLevels({ ...matrixLevels });
      setSuccessMsg(`Successfully saved ${rulesPayload.length} certificate mapping rule${rulesPayload.length === 1 ? '' : 's'}.`);
      await loadMapping();
    } catch (err: any) {
      setError(err?.message || 'Error saving certificate mappings');
    } finally {
      setSaving(false);
    }
  };

  // Delete a certificate type from catalog
  const handleDeleteMaster = async (c: CertificateMasterItem): Promise<void> => {
    if (!window.confirm(`Permanently delete certificate type "${c.name}"? This will remove all its applicability rules. Active certificates linked to it must be deleted first.`)) {
      return;
    }
    setError('');
    try {
      const res = await fetch(`${host._base()}/api/certificates/masters/${c.id}`, {
        method: 'DELETE',
        headers: host._headers(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || `Failed to delete certificate type (HTTP ${res.status})`);
      }
      setSuccessMsg(`Deleted certificate type "${c.name}".`);
      await loadMapping();
    } catch (err: any) {
      setError(err?.message || 'Error deleting certificate type');
    }
  };

  // Filtered certificates list
  const filteredCertificates = React.useMemo(() => {
    if (!mappingData) return [];
    return mappingData.certificates.filter(c => {
      if (activeCategoryTab !== 'all' && c.category !== activeCategoryTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchAuth = (c.issuing_authority || '').toLowerCase().includes(q);
        const matchSub = (c.sub_category || '').toLowerCase().includes(q);
        const matchCat = (c.category || '').toLowerCase().includes(q);
        if (!matchName && !matchAuth && !matchSub && !matchCat) return false;
      }
      return true;
    });
  }, [mappingData, activeCategoryTab, searchQuery]);

  // Group certificates by category in standard order
  const groupedCertificates = React.useMemo(() => {
    const map = new Map<string, CertificateMasterItem[]>();
    filteredCertificates.forEach(c => {
      const cat = c.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    });

    // Sort categories per standard maritime order
    const orderedMap = new Map<string, CertificateMasterItem[]>();
    CATEGORY_ORDER.forEach(cat => {
      if (map.has(cat)) {
        orderedMap.set(cat, map.get(cat)!);
        map.delete(cat);
      }
    });
    // Append any custom categories remaining
    map.forEach((items, cat) => orderedMap.set(cat, items));

    return orderedMap;
  }, [filteredCertificates]);

  // Unique categories from loaded certificates
  const availableCategories = React.useMemo(() => {
    if (!mappingData) return [];
    const set = new Set<string>();
    mappingData.certificates.forEach(c => {
      if (c.category) set.add(c.category);
    });
    const list = Array.from(set);
    return list.sort((a, b) => {
      const idxA = CATEGORY_ORDER.indexOf(a);
      const idxB = CATEGORY_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [mappingData]);

  // Certificate count per category
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    if (!mappingData) return counts;
    mappingData.certificates.forEach(c => {
      const cat = c.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [mappingData]);

  // Calculate mandatory count per ship type
  const shipTypeStats = React.useMemo(() => {
    const stats: Record<string, { mandatory: number; total: number }> = {};
    const totalCerts = mappingData?.certificates.length || 0;

    shipTypesList.forEach(st => {
      stats[st] = { mandatory: 0, total: totalCerts };
    });

    if (!mappingData) return stats;

    mappingData.certificates.forEach(c => {
      shipTypesList.forEach(st => {
        if (matrixLevels[`${c.id}:${st}`] === 'mandatory') {
          stats[st].mandatory++;
        }
      });
    });

    return stats;
  }, [mappingData, matrixLevels, shipTypesList]);

  // Render a cell badge
  const renderCellBadge = (certId: number, shipTypeKey: string): React.ReactElement => {
    const key = `${certId}:${shipTypeKey}`;
    const level = matrixLevels[key] || 'none';

    let bg = 'transparent';
    let color = 'var(--vdms-text-muted)';
    let border = '1px solid var(--vdms-line)';
    let label = '—';
    let tooltip = 'Not applicable / exempt. Click to make Mandatory.';

    if (level === 'mandatory') {
      bg = clay.pillActiveBg;
      color = clay.pillActiveText;
      border = `1px solid ${clay.pillActiveText}40`;
      label = '✓';
      tooltip = 'Mandatory statutory requirement. Click to make Conditional.';
    } else if (level === 'optional') {
      bg = clay.pillWarnBg;
      color = clay.pillWarnText;
      border = `1px solid ${clay.pillWarnText}40`;
      label = 'C';
      tooltip = 'Conditional / trade-specific requirement. Click to make Exempt.';
    }

    return (
      <button
        type="button"
        onClick={() => toggleCell(certId, shipTypeKey)}
        title={tooltip}
        style={{
          width: 32,
          height: 28,
          borderRadius: 6,
          background: bg,
          color,
          border,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.12s ease',
          boxShadow: level === 'mandatory' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      
      className="vdms-certificate-master-page certificate-master-page-i1" style={{ width: '100%' }}
    >
      {/* Top Page Header */}
      <DmsPageHeader
        title="Certificate Master & Applicability Matrix"
        subtitle="Manage master certificates, statutory authority rules, and universal baseline inheritance across fleet vessel types."
      />

      {/* Action and Filter Toolbar - Solid Surface Card, Elevated zIndex so dropdown floats above table */}
      <div
        className="certificate-master-page-i2 vdms-cert-master__toolbar" style={{ background: 'var(--vdms-surface)', borderRadius: 12, boxShadow: clay.shadowRaised }}
      >
        {/* Left: Search input & Sleek Category SearchableSelect */}
        <div className="certificate-master-page-i3 vdms-cert-master__filters" style={{ minWidth: 0 }}>
          <div className="certificate-master-page-i4 vdms-cert-master__search" style={{ width: 240 }}>
            <input
              type="text"
              placeholder="Search certificates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ ...dmsControlStyle(), padding: '6px 12px 6px 32px', fontSize: 13, width: '100%', height: 36, borderRadius: 8 }}
            />
            <Icon
              iconName="Search"
              className="certificate-master-page-i5"
            />
          </div>

          <div className="certificate-master-page-i6 vdms-cert-master__category">
            <SearchableSelect
              options={[
                { key: 'all', text: `All Categories (${mappingData?.certificates.length || 0})`, iconName: 'ViewAll' },
                ...availableCategories.map(cat => ({
                  key: cat,
                  text: `${cat} (${categoryCounts[cat] || 0})`,
                  iconName: CATEGORY_META[cat]?.icon || 'Certificate',
                })),
              ]}
              selectedKey={activeCategoryTab}
              onChange={key => setActiveCategoryTab(String(key))}
              width={260}
              fitPanelToTrigger={true}
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="certificate-master-page-i7 vdms-cert-master__actions">
          <button
            type="button"
            onClick={() => setShowCreateTypeModal(true)}
            style={{
              ...dmsBtn('primary'),
              height: 36,
              padding: '0 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              borderRadius: 8,
            }}
          >
            <Icon iconName="Add" className="certificate-master-page-i8" />
            Create Certificate Type
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div
          className="certificate-master-page-i9" style={{ background: clay.pillDangerBg, color: clay.pillDangerText, borderRadius: 8 }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="certificate-master-page-i10" style={{ color: clay.pillDangerText }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          className="certificate-master-page-i9" style={{ background: clay.pillActiveBg, color: clay.pillActiveText, borderRadius: 8 }}
        >
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="certificate-master-page-i10" style={{ color: clay.pillActiveText }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Legend & Navigation bar with Vessel Columns Controls */}
      <div
        className="certificate-master-page-i11 vdms-cert-master__legend" style={{ borderRadius: 8 }}
      >
        <div className="certificate-master-page-i12">
          <span className="certificate-master-page-i13">Legend:</span>
          <span className="certificate-master-page-i14">
            <span
              className="certificate-master-page-i15" style={{ width: 20, background: clay.pillActiveBg, color: clay.pillActiveText }}
            >
              ✓
            </span>
            <span>Mandatory (Required)</span>
          </span>
          <span className="certificate-master-page-i14">
            <span
              className="certificate-master-page-i15" style={{ width: 20, background: clay.pillWarnBg, color: clay.pillWarnText }}
            >
              C
            </span>
            <span>Conditional (Optional / Trade-specific)</span>
          </span>
          <span className="certificate-master-page-i14">
            <span
              className="certificate-master-page-i16" style={{ width: 20 }}
            >
              —
            </span>
            <span>Exempt (Not Applicable)</span>
          </span>
        </div>

        {/* Vessel Columns Count & Scroll Navigation (only shown when table overflows) */}
        <div className="certificate-master-page-i17">
          <span className="certificate-master-page-i18">
            {shipTypesList.length} Vessel Types
          </span>
          {hasHorizontalScroll && (
            <div className="certificate-master-page-i19">
              <button
                type="button"
                onClick={scrollLeft}
                title="Scroll left across vessel columns"
                className="certificate-master-page-i20" style={{ width: 26, borderRadius: 6, background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}
              >
                <Icon iconName="ChevronLeft" className="certificate-master-page-i21" />
              </button>
              <button
                type="button"
                onClick={scrollRight}
                title="Scroll right across vessel columns"
                className="certificate-master-page-i20" style={{ width: 26, borderRadius: 6, background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}
              >
                <Icon iconName="ChevronRight" className="certificate-master-page-i21" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Master Matrix Grid Table Card with Inner Scroll Container */}
      <div
        className="vdms-cert-master__pane"
        style={{
          ...DMS_TABLE_CARD,
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div
          ref={tableScrollRef}
          className="vdms-scroll-clean"
          style={{
            flex: '1 1 0',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'auto',
            width: '100%',
            height: '100%',
          }}
        >
          {loading && (
            <div className="certificate-master-page-i22">
              Loading certificate master catalog and applicability rules...
            </div>
          )}

          {!loading && (
            <table
              className="certificate-master-page-i23" style={{ width: '100%', minWidth: minTotalTableWidth }}
            >
              {/* Responsive columns: Certificate Name pinned, vessel columns share 100% space equally */}
              <colgroup>
                <col style={{ width: CERT_COL_WIDTH }} />
                {shipTypesList.map(st => (
                  <col key={st} style={{ minWidth: MIN_VESSEL_COL_WIDTH }} />
                ))}
              </colgroup>

              {/* Table Header */}
              <thead>
                <tr className="certificate-master-page-i24" style={{ background: 'var(--vdms-surface)' }}>
                  {/* Pinned Left: Certificate Name (left: 0) */}
                  <th
                    className="certificate-master-page-i25" style={{ background: 'var(--vdms-surface)', width: CERT_COL_WIDTH, minWidth: CERT_COL_WIDTH, maxWidth: CERT_COL_WIDTH, color: 'var(--vdms-text)' }}
                  >
                    <div className="certificate-master-page-i26">
                      <span>Certificate Name</span>
                      <span className="certificate-master-page-i27">
                        Authority & Term
                      </span>
                    </div>
                  </th>

                  {/* All Vessel Type Columns (Responsive: fills 100% width on wide screens, minimum 85px on small screens) */}
                  {shipTypesList.map(st => {
                    const stats = shipTypeStats[st];
                    return (
                      <th
                        key={st}
                        className="certificate-master-page-i28" style={{ background: 'var(--vdms-surface)', minWidth: MIN_VESSEL_COL_WIDTH }}
                      >
                        <div
                          className="certificate-master-page-i29"
                        >
                          {st}
                        </div>
                        <div className="certificate-master-page-i30">
                          {stats?.mandatory || 0} Req
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {Array.from(groupedCertificates.entries()).map(([cat, certs]) => {
                  const meta = CATEGORY_META[cat] || { label: cat, icon: 'Certificate' };
                  return (
                    <React.Fragment key={cat}>
                      {/* Category Divider Row - Clean section banner, no vertical sticking to prevent overlap/cutoff */}
                      <tr
                        className="certificate-master-page-i31"
                      >
                        <td
                          colSpan={shipTypesList.length + 1}
                          className="certificate-master-page-i32" style={{ fontSize: 11.5, color: clay.accent }}
                        >
                          <span
                            className="certificate-master-page-i33"
                          >
                            <Icon iconName={meta.icon} className="certificate-master-page-i34" />
                            <span>{meta.label}</span>
                            <span
                              className="certificate-master-page-i35" style={{ borderRadius: 10, background: 'var(--vdms-surface)', color: 'var(--vdms-text-muted)' }}
                            >
                              {certs.length}
                            </span>
                          </span>
                        </td>
                      </tr>

                      {/* Certificate Rows */}
                      {certs.map(c => {
                        return (
                          <tr
                            key={c.id}
                            className="certificate-master-page-i36" style={{ background: 'var(--vdms-surface)' }}
                          >
                            {/* Pinned Left: Certificate Column */}
                            <td
                              className="certificate-master-page-i37" style={{ background: 'var(--vdms-surface)', width: CERT_COL_WIDTH, minWidth: CERT_COL_WIDTH, maxWidth: CERT_COL_WIDTH }}
                            >
                              <div className="certificate-master-page-i38">
                                <div className="certificate-master-page-i39" style={{ minWidth: 0 }}>
                                  <div
                                    className="certificate-master-page-i40"
                                    title={c.remarks ? `${c.name}\nRemarks: ${c.remarks}` : c.name}
                                  >
                                    {c.name}
                                  </div>
                                  <div
                                    className="certificate-master-page-i41"
                                  >
                                    <span>{c.issuing_authority || 'Flag / Class'}</span>
                                    <span>•</span>
                                    <span title={c.validity_note || undefined}>
                                      {(() => {
                                        const y = c.default_validity_years;
                                        const m = c.default_validity_months;
                                        if (c.has_no_expiry) return 'Permanent';
                                        if (!y && !m) return c.has_no_expiry === false ? 'From document' : 'Permanent';
                                        const parts: string[] = [];
                                        if (y) parts.push(`${y}y`);
                                        if (m) parts.push(`${m}m`);
                                        return parts.join(' ') || 'Permanent';
                                      })()}
                                    </span>
                                    {c.sub_category && (
                                      <>
                                        <span>•</span>
                                        <span
                                          className="certificate-master-page-i42"
                                        >
                                          {c.sub_category}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Admin edit certificate master type (strictly visible to admins) */}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    title={`Edit certificate type "${c.name}"`}
                                    onClick={() => setEditingMaster(c)}
                                    className="certificate-master-page-i43" style={{ color: clay.accent, opacity: 0.75, transition: 'all 0.15s ease' }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.opacity = '1';
                                      e.currentTarget.style.background = clay.accentSoft;
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.opacity = '0.75';
                                      e.currentTarget.style.background = 'none';
                                    }}
                                  >
                                    <Icon iconName="Edit" className="certificate-master-page-i8" />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* All Vessel Type Cells - Responsive: expands equally on wide screens, minimum 115px on small screens */}
                            {shipTypesList.map(st => (
                              <td
                                key={st}
                                className="certificate-master-page-i44" style={{ minWidth: MIN_VESSEL_COL_WIDTH }}
                              >
                                {renderCellBadge(c.id, st)}
                              </td>
                            ))}

                            {/* Trailing Spacer Removed */}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {filteredCertificates.length === 0 && (
                  <tr>
                    <td
                      colSpan={shipTypesList.length + 1}
                      className="certificate-master-page-i45"
                    >
                      No certificates found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Floating Unsaved Changes Card (only appears when edits have been made) */}
      {hasChanges && (
        <div
          className="certificate-master-page-i46" style={{ zIndex: 1000, background: 'var(--vdms-surface)', borderRadius: 12, minWidth: 440 }}
        >
          <div className="certificate-master-page-i47">
            <span
              className="certificate-master-page-i48" style={{ borderRadius: 8, background: clay.pillWarnBg, color: clay.pillWarnText }}
            >
              <Icon iconName="Edit" className="certificate-master-page-i49" />
            </span>
            <div>
              <div className="certificate-master-page-i50">
                Unsaved Matrix Changes
              </div>
              <div className="certificate-master-page-i51">
                {changedCount} {changedCount === 1 ? 'rule' : 'rules'} modified in this session. Click Save to persist.
              </div>
            </div>
          </div>

          <div className="certificate-master-page-i52">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              style={{
                ...dmsBtn('secondary'),
                height: 34,
                padding: '0 14px',
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                ...dmsBtn('primary'),
                height: 34,
                padding: '0 18px',
                fontSize: 12.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                borderRadius: 8,
                boxShadow: clay.shadowButton,
              }}
            >
              <Icon iconName={saving ? 'Sync' : 'Save'} className="certificate-master-page-i34" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Create Certificate Type */}
      {showCreateTypeModal && (
        <CreateCertificateTypeModal
          host={host}
          isOpen={showCreateTypeModal}
          onClose={() => setShowCreateTypeModal(false)}
          onSuccess={() => {
            setShowCreateTypeModal(false);
            setSuccessMsg('New certificate type created successfully.');
            void loadMapping();
          }}
        />
      )}

      {/* Modal: Edit Certificate Type */}
      {editingMaster && (
        <EditCertificateTypeModal
          host={host}
          isOpen={!!editingMaster}
          master={editingMaster}
          onClose={() => setEditingMaster(null)}
          onSuccess={(updated) => {
            setEditingMaster(null);
            setSuccessMsg(`Certificate type "${updated.name}" updated successfully.`);
            void loadMapping();
          }}
        />
      )}
    </div>
  );
}
