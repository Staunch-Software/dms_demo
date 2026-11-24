import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import {
  dmsBtn,
  dmsTone,
  DMS_FONT_DISPLAY,
  DMS_ON_ACCENT,
} from '../dmsDesignSystem';
import { SearchableSelect, SearchableSelectOption } from '../SearchableSelect';
import { CreateCertificateTypeModal } from '../modals/CreateCertificateTypeModal';

interface ApplicabilityRule {
  id?: number;
  certificate_master_id: number;
  scope: string; // 'all_ships' | 'ship_type' | 'vessel'
  ship_type?: string | null;
  vessel_id?: number | null;
  is_required: boolean;
  remove?: boolean; // 'None selected': ask the backend to delete this rule
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

// 'none' = no rule for this ship type / vessel (optional, added manually only)
type RequirementLevel = 'none' | 'mandatory' | 'optional' | 'not_applicable';

const CATEGORY_ICONS: Record<string, string> = {
  Safety: 'ShieldAlert',
  Environment: 'World',
  'Hull & Machinery': 'Engineering',
  'Registry & Flag': 'Flag',
  'Trading & Statutory': 'Certificate',
};

export function CertificateMappingSection({ host, embedded }: { host: VesselEmail; embedded?: boolean }): React.ReactElement {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');
  const [successMsg, setSuccessMsg] = React.useState<string>('');
  const [mappingData, setMappingData] = React.useState<MappingData | null>(null);

  // Selected Scope: 'ship_type' or 'vessel'
  const [scopeMode, setScopeMode] = React.useState<'ship_type' | 'vessel'>('ship_type');
  const [selectedShipType, setSelectedShipType] = React.useState<string>('all_ships');
  const [selectedVesselId, setSelectedVesselId] = React.useState<number | null>(null);

  // Modal for creating a new Certificate Type
  const [showCreateTypeModal, setShowCreateTypeModal] = React.useState<boolean>(false);

  // Search & category tab
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeCategoryTab, setActiveCategoryTab] = React.useState<string>('all');

  // Requirement level per cert ID: 'mandatory' | 'optional' | 'not_applicable'
  const [certLevels, setCertLevels] = React.useState<Record<number, RequirementLevel>>({});
  const [initialLevels, setInitialLevels] = React.useState<Record<number, RequirementLevel>>({});

  // Vessels from host state
  const vesselList = host.state.vessels || [];

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

  // Recalculate levels whenever scope selection or data changes
  React.useEffect(() => {
    if (!mappingData) return;
    const levels: Record<number, RequirementLevel> = {};

    mappingData.certificates.forEach(c => {
      let lvl: RequirementLevel = 'none';

      if (scopeMode === 'ship_type') {
        if (selectedShipType === 'all_ships') {
          const rule = c.applicability.find(r => r.scope === 'all_ships');
          if (rule) {
            lvl = rule.is_required ? 'mandatory' : 'not_applicable';
          }
        } else {
          const stRule = c.applicability.find(
            r => r.scope === 'ship_type' && (r.ship_type || '').toLowerCase() === selectedShipType.toLowerCase()
          );
          if (stRule) {
            lvl = stRule.is_required ? 'mandatory' : 'not_applicable';
          } else {
            const allRule = c.applicability.find(r => r.scope === 'all_ships');
            if (allRule) {
              lvl = allRule.is_required ? 'mandatory' : 'not_applicable';
            }
          }
        }
      } else if (scopeMode === 'vessel' && selectedVesselId !== null) {
        const vRule = c.applicability.find(r => r.scope === 'vessel' && r.vessel_id === selectedVesselId);
        if (vRule) {
          lvl = vRule.is_required ? 'mandatory' : 'not_applicable';
        } else {
          const vObj = vesselList.find(v => Number(v.id) === selectedVesselId);
          const vType = (vObj?.vessel_type || '').toLowerCase();
          const stRule = c.applicability.find(
            r => r.scope === 'ship_type' && (r.ship_type || '').toLowerCase() === vType
          );
          if (stRule) {
            lvl = stRule.is_required ? 'mandatory' : 'not_applicable';
          } else {
            const allRule = c.applicability.find(r => r.scope === 'all_ships');
            if (allRule) {
              lvl = allRule.is_required ? 'mandatory' : 'not_applicable';
            }
          }
        }
      }

      levels[c.id] = lvl;
    });

    setCertLevels(levels);
    setInitialLevels(levels);
  }, [mappingData, scopeMode, selectedShipType, selectedVesselId, vesselList]);

  // Check if there are unsaved changes
  const hasChanges = React.useMemo(() => {
    return Object.keys(certLevels).some(
      id => certLevels[Number(id)] !== initialLevels[Number(id)]
    );
  }, [certLevels, initialLevels]);

  // Change individual certificate level
  const setLevel = (certId: number, level: RequirementLevel): void => {
    setCertLevels(prev => ({ ...prev, [certId]: level }));
  };

  // Bulk action: Mark all in category as mandatory
  const handleBulkSetCategory = (cat: string, level: RequirementLevel): void => {
    if (!mappingData) return;
    setCertLevels(prev => {
      const next = { ...prev };
      mappingData.certificates.forEach(c => {
        if (c.category === cat) {
          next[c.id] = level;
        }
      });
      return next;
    });
  };

  // Reset to SOLAS Standard defaults
  const handleResetToStandard = (): void => {
    if (!mappingData) return;
    const defaults: Record<number, RequirementLevel> = {};
    mappingData.certificates.forEach(c => {
      defaults[c.id] = c.is_mandatory ? 'mandatory' : 'optional';
    });
    setCertLevels(defaults);
  };

  // Save changes
  const handleSave = async (): Promise<void> => {
    if (!mappingData) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const rulesPayload: ApplicabilityRule[] = [];

      // Send only the certificates changed for the selected ship type / vessel.
      mappingData.certificates.forEach(c => {
        const lvl = certLevels[c.id] || 'none';
        if (lvl === (initialLevels[c.id] || 'none')) return;
        const isReq = lvl === 'mandatory';
        const remove = lvl === 'none';

        if (scopeMode === 'ship_type') {
          if (selectedShipType === 'all_ships') {
            rulesPayload.push({
              certificate_master_id: c.id,
              scope: 'all_ships',
              is_required: isReq,
              remove,
            });
          } else {
            rulesPayload.push({
              certificate_master_id: c.id,
              scope: 'ship_type',
              ship_type: selectedShipType,
              is_required: isReq,
              remove,
            });
          }
        } else if (scopeMode === 'vessel' && selectedVesselId !== null) {
          rulesPayload.push({
            certificate_master_id: c.id,
            scope: 'vessel',
            vessel_id: selectedVesselId,
            is_required: isReq,
            remove,
          });
        }
      });

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

      setInitialLevels({ ...certLevels });
      setSuccessMsg('Certificate applicability rules successfully updated.');
      setTimeout(() => setSuccessMsg(''), 4000);
      void loadMapping();
    } catch (err: any) {
      setError(err?.message || 'Error saving rules');
    } finally {
      setSaving(false);
    }
  };

  // Ship type options for SearchableSelect
  const shipTypeOptions: SearchableSelectOption[] = React.useMemo(() => {
    const list: SearchableSelectOption[] = [
      { key: 'all_ships', text: 'All Ships (Global SOLAS Standard)', subtext: 'Base baseline for entire fleet', iconName: 'ViewAll' },
    ];
    if (mappingData?.ship_types) {
      mappingData.ship_types.forEach(st => {
        list.push({ key: st, text: st, subtext: 'Ship type specific rules', iconName: 'Ferry' });
      });
    }
    return list;
  }, [mappingData]);

  // Vessel options for SearchableSelect
  const vesselOptions: SearchableSelectOption[] = React.useMemo(() => {
    return vesselList.map(v => ({
      key: v.id,
      text: v.name,
      subtext: v.imo ? `IMO ${v.imo} • ${v.vessel_type || 'General'}` : (v.vessel_type || 'General'),
      iconName: 'Ferry',
    }));
  }, [vesselList]);

  // Categories list
  const categories = React.useMemo(() => {
    if (!mappingData) return [];
    const set = new Set<string>();
    mappingData.certificates.forEach(c => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set).sort();
  }, [mappingData]);

  // Count stats
  const stats = React.useMemo(() => {
    let mandatory = 0;
    let optional = 0;
    let notApplicable = 0;
    Object.values(certLevels).forEach(lvl => {
      if (lvl === 'mandatory') mandatory++;
      else if (lvl === 'optional') optional++;
      else if (lvl === 'not_applicable') notApplicable++;
    });
    return { mandatory, optional, notApplicable, total: Object.keys(certLevels).length };
  }, [certLevels]);

  // Filtered certificates
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
        if (!matchName && !matchAuth && !matchSub) return false;
      }
      return true;
    });
  }, [mappingData, activeCategoryTab, searchQuery]);

  // Group certificates by category
  const groupedCerts = React.useMemo(() => {
    const map = new Map<string, CertificateMasterItem[]>();
    filteredCertificates.forEach(c => {
      const cat = c.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    });
    return map;
  }, [filteredCertificates]);

  // Remove a certificate type from the catalog (admin). The server refuses while any vessel still holds a live
  // certificate of this type; deleted/superseded ones don't block it.
  const handleDeleteType = async (c: CertificateMasterItem): Promise<void> => {
    if (!window.confirm(`Delete the certificate type "${c.name}"? Its applicability rules are removed too. This cannot be undone.`)) return;
    setError('');
    try {
      const res = await fetch(`${host._base()}/api/certificates/masters/${c.id}`, {
        method: 'DELETE',
        headers: host._headers(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || (res.status === 403 ? 'Only administrators can delete certificate types.' : `Failed to delete certificate type (HTTP ${res.status})`));
      }
      await loadMapping();
    } catch (err: any) {
      setError(err?.message || 'Error deleting certificate type');
    }
  };

  const renderRow = (c: CertificateMasterItem, showDept: boolean): React.ReactElement => {
    const currentLvl = certLevels[c.id] || 'none';
    return (
    <div
      key={c.id}
      className="certificate-mapping-section-i1" style={{ background: currentLvl === 'mandatory' ? 'transparent' : 'var(--vdms-surface-alt)' }}
    >
      {/* Certificate Info */}
      <div style={showDept ? { flex: '1 1 0', minWidth: 0 } : { flex: '1 1 300px', minWidth: 'min(260px, 100%)' }}>
        <div className="certificate-mapping-section-i2">
          <span className="certificate-mapping-section-i3">
            {c.name}
          </span>
          {c.sub_category && (
            <span
              className="certificate-mapping-section-i4" style={{ color: 'var(--vdms-text-muted)', background: 'var(--vdms-surface)' }}
            >
              {c.sub_category}
            </span>
          )}
        </div>
        <div className="certificate-mapping-section-i5">
          Issuing: <strong>{c.issuing_authority || 'Flag / Class Society'}</strong> • Standard Validity:{' '}
          {(() => {
            const y = c.default_validity_years;
            const m = c.default_validity_months;
            if (c.has_no_expiry) return 'Permanent';
            if (!y && !m) return c.has_no_expiry === false ? 'From document' : 'Permanent';
            const parts: string[] = [];
            if (y) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
            if (m) parts.push(`${m} ${m === 1 ? 'month' : 'months'}`);
            return parts.join(' ');
          })()}
        </div>
      </div>

      {showDept && (
      <div className="certificate-mapping-section-i6" style={{ width: 150 }}>
        <span className="certificate-mapping-section-i7" style={{ borderRadius: 12, background: clay.accentSoft, color: clay.accent, maxWidth: '100%' }}>
          <Icon iconName={CATEGORY_ICONS[c.category] || 'Certificate'} className="certificate-mapping-section-i8" />
          <span className="certificate-mapping-section-i9">{c.category || 'General'}</span>
        </span>
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, ...(showDept ? { width: 470, justifyContent: 'flex-end' } : {}) }}>
      {/* 3-Way Requirement Status Selector (Clear, Intuitive, No Guesswork) */}
      <div
        className="certificate-mapping-section-i10" style={{ background: 'var(--vdms-surface)', borderRadius: 8 }}
      >
        <button
          type="button"
          onClick={() => setLevel(c.id, 'none')}
          title="Not mapped to this ship type. Optional, added manually only."
          className="certificate-mapping-section-i11" style={{ borderRadius: 6, background: currentLvl === 'none' ? 'var(--vdms-surface-alt)' : 'transparent', color: currentLvl === 'none' ? 'var(--vdms-text)' : 'var(--vdms-text-muted)', boxShadow: currentLvl === 'none' ? 'inset 0 0 0 1px var(--vdms-line-strong, var(--vdms-line))' : 'none', fontWeight: currentLvl === 'none' ? 700 : 600, transition: 'all 0.12s ease' }}
        >
          None selected
        </button>

        <button
          type="button"
          onClick={() => setLevel(c.id, 'mandatory')}
          className="certificate-mapping-section-i12" style={{ borderRadius: 6, background: currentLvl === 'mandatory' ? '#15803d' : 'transparent', color: currentLvl === 'mandatory' ? '#ffffff' : 'var(--vdms-text)', transition: 'all 0.12s ease' }}
        >
          <Icon iconName="CheckMark" className="certificate-mapping-section-i13" /> Mandatory
        </button>

        <button
          type="button"
          onClick={() => setLevel(c.id, 'optional')}
          className="certificate-mapping-section-i12" style={{ borderRadius: 6, background: currentLvl === 'optional' ? clay.accent : 'transparent', color: currentLvl === 'optional' ? DMS_ON_ACCENT : 'var(--vdms-text)', transition: 'all 0.12s ease' }}
        >
          <Icon iconName="Info" className="certificate-mapping-section-i13" /> Optional
        </button>

        <button
          type="button"
          onClick={() => setLevel(c.id, 'not_applicable')}
          className="certificate-mapping-section-i14" style={{ borderRadius: 6, background: currentLvl === 'not_applicable' ? 'rgba(148,163,184,0.3)' : 'transparent', color: currentLvl === 'not_applicable' ? 'var(--vdms-text)' : 'var(--vdms-text-muted)', transition: 'all 0.12s ease' }}
        >
          <Icon iconName="Cancel" className="certificate-mapping-section-i15" /> Not Required
        </button>
      </div>
      <button
        type="button"
        onClick={() => { void handleDeleteType(c); }}
        title={`Delete certificate type "${c.name}"`}
        aria-label={`Delete certificate type ${c.name}`}
        style={{ ...dmsBtn('ghost'), height: 30, width: 30, padding: 0, color: '#b91c1c', justifyContent: 'center' }}
      >
        <Icon iconName="Delete" className="certificate-mapping-section-i16" />
      </button>
      </div>
    </div>
    );
  };

  return (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', flex: '1 1 0', minHeight: 0 }
      : { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1100 }}>
      {/* ── Header Scope Card ── */}
      <div
        className="certificate-mapping-section-i17" style={{ background: 'var(--vdms-surface)', boxShadow: clay.shadowRaised }}
      >
        {!embedded && <div className="certificate-mapping-section-i18">
          <div>
            <div className="certificate-mapping-section-i2">
              <span
                className="certificate-mapping-section-i19" style={{ borderRadius: 8, background: clay.accentSoft, color: clay.accent }}
              >
                <Icon iconName="Certificate" className="certificate-mapping-section-i20" />
              </span>
              <h3 className="certificate-mapping-section-i21" style={{ fontFamily: DMS_FONT_DISPLAY }}>
                Certificate Applicability & Rules
              </h3>
            </div>
            <div className="certificate-mapping-section-i22">
              Define statutory and company certificates required for vessel clearance, drydock, and compliance monitoring.
            </div>
          </div>
        </div>}

        {/* Single Row: Mode Switcher (Left) | Target Ship Type / Vessel (In Between) | Add Certificate Type (Right) */}
        <div
          className="certificate-mapping-section-i23"
        >
          {/* 1. Left: Scope Mode Switcher */}
          <div
            className="certificate-mapping-section-i24"
          >
            <button
              type="button"
              onClick={() => setScopeMode('ship_type')}
              className="certificate-mapping-section-i25" style={{ background: scopeMode === 'ship_type' ? clay.accent : 'transparent', color: scopeMode === 'ship_type' ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: scopeMode === 'ship_type' ? clay.shadowButton : 'none' }}
            >
              <Icon iconName="ViewAll" className="certificate-mapping-section-i8" /> By Ship Type
            </button>
            <button
              type="button"
              onClick={() => {
                setScopeMode('vessel');
                if (selectedVesselId === null && vesselList.length > 0) {
                  setSelectedVesselId(Number(vesselList[0].id));
                }
              }}
              className="certificate-mapping-section-i25" style={{ background: scopeMode === 'vessel' ? clay.accent : 'transparent', color: scopeMode === 'vessel' ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: scopeMode === 'vessel' ? clay.shadowButton : 'none' }}
            >
              <Icon iconName="Ferry" className="certificate-mapping-section-i8" /> Specific Vessel Override
            </button>
          </div>

          {/* 2. Middle (In Between): Target Ship Type / Vessel Dropdown */}
          <div
            className="certificate-mapping-section-i26" style={{ minWidth: 200 }}
          >
            <span
              className="certificate-mapping-section-i27"
            >
              {scopeMode === 'ship_type' ? 'Ship Type:' : 'Vessel:'}
            </span>
            <div className="certificate-mapping-section-i28" style={{ minWidth: 0 }}>
              {scopeMode === 'ship_type' ? (
                <SearchableSelect
                  options={shipTypeOptions}
                  selectedKey={selectedShipType}
                  onChange={key => setSelectedShipType(String(key))}
                  placeholder="Choose ship type..."
                  width="100%"
                />
              ) : (
                <SearchableSelect
                  options={vesselOptions}
                  selectedKey={selectedVesselId}
                  onChange={key => setSelectedVesselId(Number(key))}
                  placeholder="Choose vessel to override..."
                  width="100%"
                />
              )}
            </div>
          </div>

          {/* 3. Right: Add Certificate Type Button */}
          <button
            type="button"
            onClick={() => setShowCreateTypeModal(true)}
            className="certificate-mapping-section-i29" style={{ borderRadius: 8, border: `1.5px solid ${clay.accent}`, background: clay.accentSoft, color: clay.accent, boxShadow: clay.shadowButton }}
            title="Add a new statutory or company compliance certificate to the catalog"
          >
            <Icon iconName="Add" className="certificate-mapping-section-i16" /> Add Certificate Type
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="certificate-mapping-section-i30" style={{ borderRadius: 10, background: clay.pillDangerBg, color: clay.pillDangerText }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div className="certificate-mapping-section-i30" style={{ borderRadius: 10, background: clay.pillActiveBg, color: clay.pillActiveText }}>
          {successMsg}
        </div>
      )}

      {/* ── Two-Row Control Bar: Category Tabs (Row 1) & Search Bar (Row 2) ── */}
      <div
        className="certificate-mapping-section-i31" style={{ background: 'var(--vdms-surface)', borderBottom: '1px solid var(--vdms-line, #cbd5e1)' }}
      >
        {/* Row 1: All Department Filter Pills in a SINGLE clean row */}
        <div className="certificate-mapping-section-i32" style={{ width: '100%' }}>
        <div
          className="vdms-scroll-clean"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            padding: '2px 2px 4px',
            flex: '1 1 0',
            minWidth: 0,
          }}
        >
          <button
            type="button"
            className="vdms-dept-pill"
            onClick={() => setActiveCategoryTab('all')}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeCategoryTab === 'all' ? clay.accent : 'var(--vdms-surface-alt)',
              color: activeCategoryTab === 'all' ? DMS_ON_ACCENT : 'var(--vdms-text)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.12s ease',
            }}
          >
            All Departments ({mappingData?.certificates.length || 0})
          </button>
          {categories.map(cat => {
            const count = mappingData?.certificates.filter(c => c.category === cat).length || 0;
            const active = activeCategoryTab === cat;
            return (
              <button
                key={cat}
                type="button"
                className="vdms-dept-pill"
                onClick={() => setActiveCategoryTab(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: active ? clay.accent : 'var(--vdms-surface-alt)',
                  color: active ? DMS_ON_ACCENT : 'var(--vdms-text)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.12s ease',
                }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

          {/* Certificate Search Input (Well-spaced with 38px left padding) */}
          <div className="certificate-mapping-section-i33" style={{ minWidth: 200 }}>
            <Icon
              iconName="Search"
              className="certificate-mapping-section-i34"
            />
            <input
              type="text"
              className="vdms-single-border-search"
              placeholder="Search certificate name or authority..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: 36,
                paddingLeft: 40,
                paddingRight: searchQuery ? 32 : 12,
                borderRadius: 8,
                border: '1px solid var(--vdms-line, #cbd5e1)',
                background: 'var(--vdms-surface, #ffffff)',
                color: 'var(--vdms-text)',
                fontSize: 12.5,
                fontFamily: DMS_FONT_DISPLAY,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            />
            {searchQuery && (
              <Icon
                iconName="Clear"
                className="certificate-mapping-section-i35"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Category Groups Cards & Intuitive 3-Way Selector ── */}
      <div className="vdms-map-scroll" style={embedded ? { flex: '1 1 0', minHeight: 0, overflowY: 'scroll', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 } : { display: 'contents' }}>
      {loading ? (
        <div className="certificate-mapping-section-i36">
          Loading statutory applicability matrix...
        </div>
      ) : activeCategoryTab === 'all' ? (
        <div className="certificate-mapping-section-i37" style={{ background: 'var(--vdms-surface)', boxShadow: clay.shadowRaised }}>
          <div className="certificate-mapping-section-i38">
            <span className="certificate-mapping-section-i39" style={{ minWidth: 0 }}>Certificate</span>
            <span className="certificate-mapping-section-i6" style={{ width: 150 }}>Department</span>
            <span className="certificate-mapping-section-i40">Requirement</span>
          </div>
          <div className="certificate-mapping-section-i41">
            {filteredCertificates.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => renderRow(c, true))}
            {filteredCertificates.length === 0 && (
              <div className="certificate-mapping-section-i42">No certificates match.</div>
            )}
          </div>
        </div>
      ) : Array.from(groupedCerts.entries()).map(([catName, certs]) => (
        <div
          key={catName}
          className="certificate-mapping-section-i43" style={{ background: 'var(--vdms-surface)', boxShadow: clay.shadowRaised }}
        >
          {/* Category Section Header */}
          <div
            className="certificate-mapping-section-i44"
          >
            <div className="certificate-mapping-section-i2">
              <Icon
                iconName={CATEGORY_ICONS[catName] || 'Certificate'}
                className="certificate-mapping-section-i20" style={{ color: clay.accent }}
              />
              <span className="certificate-mapping-section-i45" style={{ fontFamily: DMS_FONT_DISPLAY }}>
                {catName}
              </span>
              <span
                className="certificate-mapping-section-i46" style={{ borderRadius: 12, background: clay.accentSoft, color: clay.accent }}
              >
                {certs.length} {certs.length === 1 ? 'certificate' : 'certificates'}
              </span>
            </div>

            {/* Bulk Category Action */}
            <div className="certificate-mapping-section-i47">
              <span className="certificate-mapping-section-i48">Quick set category:</span>
              <button
                type="button"
                onClick={() => handleBulkSetCategory(catName, 'mandatory')}
                style={{ ...dmsBtn('ghost'), height: 26, fontSize: 11, padding: '0 8px' }}
              >
                All Mandatory
              </button>
              <button
                type="button"
                onClick={() => handleBulkSetCategory(catName, 'not_applicable')}
                style={{ ...dmsBtn('ghost'), height: 26, fontSize: 11, padding: '0 8px' }}
              >
                All N/A
              </button>
            </div>
          </div>

          {/* Certificates List in Category */}
          <div className="certificate-mapping-section-i41">
            {certs.map(c => renderRow(c, false))}
          </div>
        </div>
      ))}
      </div>

      {/* Results count sits under the list */}
      <div className="certificate-mapping-section-i49">
    <div className="certificate-mapping-section-i50">
      <span>
        Showing <strong className="certificate-mapping-section-i51">{filteredCertificates.length}</strong> of{' '}
        <strong className="certificate-mapping-section-i51">{mappingData?.certificates.length || 0}</strong> certificates
      </span>
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="certificate-mapping-section-i52" style={{ color: clay.accent }}
        >
          Clear filter
        </button>
      )}
    </div>
      </div>

      {/* ── Sticky Save Changes Bar ── */}
      {hasChanges && (
        <div
          className="certificate-mapping-section-i53" style={{ bottom: embedded ? 0 : 20, background: 'var(--vdms-surface)', borderRadius: 12, border: `2px solid ${clay.accent}` }}
        >
          <div className="certificate-mapping-section-i54">
            <Icon iconName="Edit" className="certificate-mapping-section-i55" style={{ color: clay.accent }} />
            <div>
              <div className="certificate-mapping-section-i3">
                You have unsaved mapping changes
              </div>
              <div className="certificate-mapping-section-i56">
                Apply these changes to update statutory compliance monitoring for {scopeMode === 'ship_type' ? selectedShipType : 'this vessel'}.
              </div>
            </div>
          </div>

          <div className="certificate-mapping-section-i54">
            <button
              type="button"
              onClick={() => setCertLevels({ ...initialLevels })}
              disabled={saving}
              style={{ ...dmsBtn('secondary'), height: 36, padding: '0 18px' }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ ...dmsBtn('primary', !saving), height: 36, padding: '0 24px', gap: 8 }}
            >
              <Icon iconName={saving ? 'Sync' : 'Save'} className="certificate-mapping-section-i16" />
              {saving ? 'Saving Changes...' : 'Save Mapping Rules'}
            </button>
          </div>
        </div>
      )}

      {/* Modal for Creating New Certificate Type */}
      <CreateCertificateTypeModal
        host={host}
        isOpen={showCreateTypeModal}
        onClose={() => setShowCreateTypeModal(false)}
        initialCategory={activeCategoryTab !== 'all' ? activeCategoryTab : undefined}
        onSuccess={newMaster => {
          void loadMapping();
          setSuccessMsg(`Certificate Type "${newMaster.name}" was successfully added to the statutory catalog!`);
          if (newMaster.category) {
            setActiveCategoryTab(newMaster.category);
          }
        }}
      />
    </div>
  );
}
