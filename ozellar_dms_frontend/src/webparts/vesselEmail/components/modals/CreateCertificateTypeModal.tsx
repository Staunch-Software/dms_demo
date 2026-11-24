import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { DmsSelect } from '../DmsSelect';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY, DMS_ON_ACCENT } from '../dmsDesignSystem';
import { isMobileWidth } from '../responsive';

export interface CreateCertificateTypeModalProps {
  host: VesselEmail;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newMaster: any) => void;
  initialCategory?: string;
  initialName?: string;
}

// Preset categories removed - categories are dynamically loaded from existing catalog records or user input.

type ShipMode = 'none' | 'some' | 'all';
// 'doc' = no fixed period: the expiry date is taken from each uploaded certificate.
type ValidityMode = 'five' | 'perm' | 'custom' | 'doc';

// Single-column form controls: tall enough that text and descenders are never clipped.
const FIELD_LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--vdms-text)' };
const requiredMark = <span className="create-certificate-type-modal-i1"> *</span>;
const ctrl = (): React.CSSProperties => ({
  ...dmsControlStyle(),
  height: 38,
  fontSize: 14,
  lineHeight: '20px',
  padding: '0 12px',
  boxSizing: 'border-box',
  width: '100%',
});
// Segmented choice buttons start unselected; the user must pick one.
const choiceBtn = (active: boolean): React.CSSProperties => ({
  padding: '7px 6px',
  borderRadius: 8,
  border: active ? `2px solid ${clay.accent}` : '1px solid var(--vdms-line)',
  background: active ? clay.accentSoft : 'var(--vdms-surface-alt)',
  color: active ? clay.accent : 'var(--vdms-text)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s ease',
});

export function CreateCertificateTypeModal({
  host,
  isOpen,
  onClose,
  onSuccess,
  initialCategory,
  initialName,
}: CreateCertificateTypeModalProps): React.ReactElement | null {
  const [name, setName] = React.useState<string>(initialName || '');
  const [category, setCategory] = React.useState<string>(initialCategory && initialCategory !== 'all' ? initialCategory : '');
  const [isCustomCategory, setIsCustomCategory] = React.useState<boolean>(false);
  const [savedCategories, setSavedCategories] = React.useState<string[]>([]);
  const [customCategory, setCustomCategory] = React.useState<string>('');
  const [categorySearch, setCategorySearch] = React.useState<string>('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = React.useState<boolean>(false);
  const [referenceNo, setReferenceNo] = React.useState<string>('');
  const [responsiblePerson, setResponsiblePerson] = React.useState<string>('');
  const [customResponsiblePerson, setCustomResponsiblePerson] = React.useState<string>('');
  const [isCustomResponsible, setIsCustomResponsible] = React.useState<boolean>(false);
  const [enableEmailAutomation, setEnableEmailAutomation] = React.useState<boolean | null>(null);
  const [issuingAuthority, setIssuingAuthority] = React.useState<string>('');
  const [validityMode, setValidityMode] = React.useState<ValidityMode | null>(null);
  const [customYears, setCustomYears] = React.useState<string>('0');
  const [customMonths, setCustomMonths] = React.useState<string>('0');
  const [remarks, setRemarks] = React.useState<string>('');

  const handleYearsChange = (val: string): void => {
    if (val === '') {
      setCustomYears('');
      return;
    }
    const clean = val.replace(/[^0-9]/g, '');
    if (clean === '') {
      setCustomYears('');
      return;
    }
    const n = parseInt(clean, 10);
    if (n > 50) {
      setCustomYears('50');
    } else {
      setCustomYears(String(n));
    }
  };

  const handleMonthsChange = (val: string): void => {
    if (val.indexOf('-') !== -1) {
      return;
    }
    if (val === '') {
      setCustomMonths('');
      return;
    }

    const clean = val.replace(/[^0-9]/g, '');
    if (clean === '') {
      setCustomMonths('');
      return;
    }

    const total = parseInt(clean, 10);
    if (total >= 12) {
      const extraYears = Math.floor(total / 12);
      const remMonths = total % 12;
      const curY = parseInt(customYears, 10) || 0;
      setCustomYears(String(Math.min(50, curY + extraYears)));
      setCustomMonths(String(remMonths));
    } else {
      setCustomMonths(String(total));
    }
  };
  const [isMandatory, setIsMandatory] = React.useState<boolean | null>(null);
  const [shipMode, setShipMode] = React.useState<ShipMode | null>(null);
  const [shipTypes, setShipTypes] = React.useState<string[]>([]);
  const [pickedTypes, setPickedTypes] = React.useState<Record<string, boolean>>({});
  const [shipMenuOpen, setShipMenuOpen] = React.useState<boolean>(false);

  const formRef = React.useRef<HTMLFormElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when opened
  React.useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      const initCat = initialCategory && initialCategory !== 'all' ? initialCategory : '';
      setCategory(initCat);
      setIsCustomCategory(false);
      setCustomCategory('');
      setCategorySearch('');
      setCategoryDropdownOpen(false);
      setReferenceNo('');
      setResponsiblePerson('');
      setCustomResponsiblePerson('');
      setIsCustomResponsible(false);
      setEnableEmailAutomation(null);
      setIssuingAuthority('');
      setValidityMode(null);
      setCustomYears('0');
      setCustomMonths('0');
      setShipMode(null);
      setIsMandatory(null);
      setPickedTypes({});
      setShipMenuOpen(false);
      setRemarks('');
      setError(null);
    }
  }, [isOpen, initialCategory, initialName]);

  // Choosing a custom validity reveals the years box below the fold; scroll the
  // dialog's own body down so it and the Create button are visible.
  React.useEffect(() => {
    if (!isOpen || validityMode !== 'custom') return;
    const t = window.setTimeout(() => {
      const f = bodyRef.current;
      if (f) f.scrollTo({ top: f.scrollHeight, behavior: 'smooth' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [isOpen, validityMode]);

  // Departments already saved in the catalog are offered as chips dynamically.
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch(`${host._base()}/api/certificates/masters`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: Array<{ category?: string }>) => {
        if (cancelled) return;
        const seen: Record<string, boolean> = {};
        const extra: string[] = [];
        rows.forEach(r => {
          const c = (r.category || '').trim();
          if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = true; extra.push(c); }
        });
        const sorted = extra.sort();
        setSavedCategories(sorted);
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Ship types come from the backend ship-type master (same list as Add Vessel and Certificate Mapping).
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch(`${host._base()}/api/certificates/ship-types`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: Array<{ id: number; name: string }>) => { if (!cancelled) setShipTypes(rows.map(r => r.name)); })
      .catch(() => { if (!cancelled) setShipTypes([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024));

  const selectedShipTypes = shipTypes.filter(t => pickedTypes[t]);
  const allCategories = [...savedCategories];
  if (initialCategory && initialCategory !== 'all' && allCategories.map(c => c.toLowerCase()).indexOf(initialCategory.toLowerCase()) === -1) {
    allCategories.push(initialCategory);
  }
  const filteredCategories = React.useMemo(() => {
    if (!categorySearch.trim()) return allCategories;
    const q = categorySearch.toLowerCase().trim();
    return allCategories.filter(c => c.toLowerCase().includes(q));
  }, [allCategories, categorySearch]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const finalCategory = isCustomCategory ? customCategory.trim() : category;
    const finalResponsible = isCustomResponsible ? customResponsiblePerson.trim() : responsiblePerson;

    if (!shipMode) {
      setError('Please choose a ship type option.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter a certificate name.');
      return;
    }
    if (!finalCategory) {
      setError('Please select or specify a department/category.');
      return;
    }
    if (!finalResponsible) {
      setError('Please select a responsible person.');
      return;
    }

    const selectedTypes = selectedShipTypes;
    if (shipMode === 'some' && selectedTypes.length === 0) {
      setError('Select at least one ship type, or choose All / None selected.');
      return;
    }
    let validityYears: number | null = null;
    let validityMonths: number | null = null;
    if (validityMode === 'perm') {
      validityYears = null;
      validityMonths = null;
    } else if (validityMode === 'five') {
      validityYears = 5;
      validityMonths = null;
    } else if (validityMode === 'custom') {
      const y = Math.max(0, Math.floor(Number(customYears) || 0));
      const m = Math.max(0, Math.floor(Number(customMonths) || 0));

      if (y === 0 && m === 0) {
        setError('Please specify at least 1 month or 1 year of validity.');
        return;
      }
      if (y > 50) {
        setError('Validity years cannot exceed 50.');
        return;
      }

      validityYears = y > 0 ? y : null;
      validityMonths = m > 0 ? m : null;
    }

    setBusy(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        category: finalCategory,
        sub_category: referenceNo.trim() || null,
        reference_no: referenceNo.trim() || null,
        responsible_person: finalResponsible || null,
        enable_email_automation: enableEmailAutomation === true,
        issuing_authority: issuingAuthority.trim() || null,
        default_validity_years: validityYears,
        default_validity_months: validityMonths,
        // Permanent only when chosen (or, as before, when no validity was picked); 'From Document' is not permanent.
        no_expiry: validityMode === 'perm' || validityMode === null,
        remarks: remarks.trim() || null,
        is_mandatory: isMandatory !== false,
        default_scope: shipMode === 'all' ? 'all_ships' : shipMode === 'some' ? 'ship_types' : 'none',
        ship_types: shipMode === 'some' ? selectedTypes : [],
      };

      const res = await fetch(`${host._base()}/api/certificates/masters`, {
        method: 'POST',
        headers: {
          ...host._headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to create certificate type');
      }

      onSuccess(data);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error creating certificate type');
    } finally {
      setBusy(false);
    }
  };

  const modalContent = (
    <div
      className="create-certificate-type-modal-i2" style={{ position: 'fixed', zIndex: 100020, background: 'rgba(10, 22, 38, 0.65)', padding: isMobile ? 12 : 20 }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isMobile ? '95vw' : 760,
          fontFamily: DMS_FONT_DISPLAY,
          maxHeight: '96vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vdms-surface)',
          borderRadius: isMobile ? 12 : clay.radiusCard + 8,
          border: '1px solid var(--vdms-line)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        className="vdms-cert-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div
          className="create-certificate-type-modal-i3" style={{ padding: isMobile ? '12px 18px' : '14px 24px' }}
        >
          <div className="create-certificate-type-modal-i4">
            <span
              className="create-certificate-type-modal-i5" style={{ borderRadius: 10, background: clay.accentSoft, color: clay.accent, boxShadow: clay.shadowIcon }}
            >
              <Icon iconName="Certificate" className="create-certificate-type-modal-i6" />
            </span>
            <div>
              <h2
                className="create-certificate-type-modal-i7" style={{ fontSize: isMobile ? 16 : 18, fontFamily: DMS_FONT_DISPLAY, letterSpacing: '-0.02em' }}
              >
                Create Certificate Type
              </h2>
              <p className="create-certificate-type-modal-i8">
                Add a new statutory or company compliance certificate to the fleet catalog.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="create-certificate-type-modal-i9" style={{ borderRadius: 6 }}
          >
            <Icon iconName="Cancel" />
          </button>
        </div>

        {/* Form wrapping scrollable body and fixed footer */}
        <form
          ref={formRef}
          className="vdms-cert-scroll"
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Scrollable Form Body */}
          <div
            ref={bodyRef}
            className="create-certificate-type-modal-i10" style={{ overflowY: categoryDropdownOpen || shipMenuOpen ? 'visible' : 'auto', padding: isMobile ? '10px 18px' : '12px 24px' }}
          >
          {error && (
            <div
              className="create-certificate-type-modal-i11" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}
            >
              <Icon iconName="ErrorBadge" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Type Ship (All | One or more | None selected) & Applicability (Mandatory | Optional) */}
          <div className="create-certificate-type-modal-i12">
            {/* Type Ship */}
            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>
                Type Ship{requiredMark}
              </label>
              <div className="create-certificate-type-modal-i14" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {([
                  { key: 'all', label: 'All' },
                  { key: 'some', label: 'One or more' },
                  { key: 'none', label: 'None selected' },
                ] as Array<{ key: ShipMode; label: string }>).map(opt => {
                  const active = shipMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setShipMode(opt.key)}
                      style={choiceBtn(active)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {shipMode === 'some' && (
                <div className="create-certificate-type-modal-i15">
                  <button
                    type="button"
                    onClick={() => setShipMenuOpen(o => !o)}
                    aria-expanded={shipMenuOpen}
                    style={{
                      ...dmsControlStyle(),
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: selectedShipTypes.length > 0 ? 'var(--vdms-text)' : 'var(--vdms-text-muted)',
                      fontSize: 14,
                    }}
                  >
                    <span className="create-certificate-type-modal-i16">
                      {selectedShipTypes.length === 0
                        ? 'Select ship types...'
                        : shipTypes.length > 0 && selectedShipTypes.length === shipTypes.length
                          ? 'All ships applicable'
                          : selectedShipTypes.length <= 2
                            ? selectedShipTypes.join(', ')
                            : `${selectedShipTypes.length} ship types selected`}
                    </span>
                    <Icon iconName={shipMenuOpen ? 'ChevronUp' : 'ChevronDown'} className="create-certificate-type-modal-i17" />
                  </button>
                  {shipMenuOpen && (
                    <div
                      className="create-certificate-type-modal-i18" style={{ borderRadius: 8, background: 'var(--vdms-surface)' }}
                    >
                      {shipTypes.length === 0 ? (
                        <div className="create-certificate-type-modal-i19">
                          No ship types found. Add them in the ship-type master.
                        </div>
                      ) : (
                        <>
                          <label
                            className="create-certificate-type-modal-i20"
                          >
                            <input
                              type="checkbox"
                              checked={selectedShipTypes.length === shipTypes.length}
                              onChange={e => {
                                const next: Record<string, boolean> = {};
                                shipTypes.forEach(t => { next[t] = e.target.checked; });
                                setPickedTypes(next);
                              }}
                            />
                            All ships applicable
                          </label>
                          {shipTypes.map(t => (
                            <label
                              key={t}
                              className="create-certificate-type-modal-i21"
                            >
                              <input
                                type="checkbox"
                                checked={!!pickedTypes[t]}
                                onChange={e => setPickedTypes(prev => ({ ...prev, [t]: e.target.checked }))}
                              />
                              {t}
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Applicability (starts unselected; not required — saved as Mandatory when left blank) */}
            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>Applicability</label>
              <div className="create-certificate-type-modal-i14" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {[
                  { mandatory: true, label: 'Mandatory' },
                  { mandatory: false, label: 'Optional' },
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setIsMandatory(opt.mandatory)}
                    style={choiceBtn(isMandatory === opt.mandatory)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Certificate Name & Statutory Department / Category */}
          <div className="create-certificate-type-modal-i12">
            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>
                Certificate Name{requiredMark}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. USCG Certificate of Financial Responsibility (COFR)"
                style={ctrl()}
                autoFocus
              />
            </div>

            <div className="create-certificate-type-modal-i22">
              <label style={FIELD_LABEL}>
                Statutory Department / Category{requiredMark}
              </label>
              <DmsSelect
                value={isCustomCategory ? '' : category}
                placeholder={isCustomCategory ? (customCategory ? `Custom: ${customCategory}` : '+ Custom Category...') : 'Select category'}
                options={allCategories.map(c => ({ value: c, label: c }))}
                searchThreshold={0}
                onChange={v => { setCategory(v); setIsCustomCategory(false); }}
                extraAction={{ label: '+ Custom category...', onSelect: () => setIsCustomCategory(true) }}
              />

              {isCustomCategory && (
                <div className="create-certificate-type-modal-i23">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    placeholder="Enter custom category name..."
                    style={{ ...ctrl(), flex: 1, width: 'auto' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(false);
                      setCategory('');
                    }}
                    className="create-certificate-type-modal-i24" style={{ borderRadius: 6 }}
                    title="Cancel custom"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Responsible Person & Default Issuing Authority */}
          <div className="create-certificate-type-modal-i25" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>
                Responsible Person{requiredMark}
              </label>
              {!isCustomResponsible ? (
                <DmsSelect
                  value={responsiblePerson}
                  placeholder="Select responsible person"
                  options={[{ value: 'Owner', label: 'Owner' }, { value: 'Manager', label: 'Manager' }, { value: 'Vessel', label: 'Vessel' }]}
                  onChange={setResponsiblePerson}
                  extraAction={{
                    label: '+ Specify other...',
                    onSelect: () => { setIsCustomResponsible(true); setCustomResponsiblePerson(''); },
                  }}
                />
              ) : (
                <div className="create-certificate-type-modal-i26">
                  <input
                    type="text"
                    value={customResponsiblePerson}
                    onChange={e => setCustomResponsiblePerson(e.target.value)}
                    placeholder="Enter responsible person / role..."
                    style={{ ...ctrl(), flex: 1, width: 'auto' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomResponsible(false);
                      setResponsiblePerson('');
                    }}
                    className="create-certificate-type-modal-i24" style={{ borderRadius: 6 }}
                    title="Cancel custom"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>
                Default Issuing Authority
              </label>
              <input
                type="text"
                value={issuingAuthority}
                onChange={e => setIssuingAuthority(e.target.value)}
                placeholder="e.g. Recognized Organization (RO)"
                style={ctrl()}
              />
            </div>
          </div>

          {/* Row 4: Reference No & Auto Email on Upload */}
          <div className="create-certificate-type-modal-i27" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <div className="create-certificate-type-modal-i13">
              <label style={FIELD_LABEL}>
                Reference No
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="e.g. REF-001 or Circular Code"
                style={ctrl()}
              />
            </div>

            <div
              className="create-certificate-type-modal-i28" style={{ borderRadius: 8 }}
            >
              <div>
                <div className="create-certificate-type-modal-i29">
                  Auto Email on Upload
                </div>
                <div className="create-certificate-type-modal-i30">
                  Send progress mail on upload
                </div>
              </div>

              <div
                className="create-certificate-type-modal-i31" style={{ background: 'var(--vdms-surface)' }}
              >
                <button
                  type="button"
                  onClick={() => setEnableEmailAutomation(true)}
                  className="create-certificate-type-modal-i32" style={{ background: enableEmailAutomation === true ? clay.accent : 'transparent', color: enableEmailAutomation === true ? DMS_ON_ACCENT : 'var(--vdms-text-muted)', transition: 'all 0.15s ease' }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setEnableEmailAutomation(false)}
                  className="create-certificate-type-modal-i32" style={{ background: enableEmailAutomation === false ? 'var(--vdms-line-soft, #e2e8f0)' : 'transparent', color: enableEmailAutomation === false ? 'var(--vdms-text)' : 'var(--vdms-text-muted)', transition: 'all 0.15s ease' }}
                >
                  No
                </button>
              </div>
            </div>
          </div>

          {/* Row 5: Default Validity Period */}
          <div className="create-certificate-type-modal-i13">
            <label style={FIELD_LABEL}>
              Default Validity Period
            </label>
            <div className="create-certificate-type-modal-i33" style={{ gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
              {([
                { mode: 'five', label: '5 Years (SOLAS)' },
                { mode: 'perm', label: 'Permanent' },
                { mode: 'custom', label: 'Custom' },
                { mode: 'doc', label: 'From Document' },
              ] as Array<{ mode: ValidityMode; label: string }>).map(opt => {
                const active = validityMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setValidityMode(opt.mode)}
                    style={choiceBtn(active)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {validityMode === 'custom' && (
              <div
                className="create-certificate-type-modal-i34" style={{ borderRadius: 8 }}
              >
                <div className="create-certificate-type-modal-i35">
                  Custom duration
                </div>
                <div className="create-certificate-type-modal-i36">
                  <div className="create-certificate-type-modal-i37">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={customYears}
                      onChange={e => handleYearsChange(e.target.value)}
                      onBlur={() => { if (customYears === '') setCustomYears('0'); }}
                      placeholder="0"
                      style={{ ...dmsControlStyle(), width: 64, height: 38, fontSize: 14, padding: '0 6px', boxSizing: 'border-box', textAlign: 'center', fontWeight: 700 }}
                    />
                    <span className="create-certificate-type-modal-i38">Years</span>
                  </div>
                  <div className="create-certificate-type-modal-i37">
                    <input
                      type="number"
                      min={0}
                      max={11}
                      value={customMonths}
                      onChange={e => handleMonthsChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowUp' && (parseInt(customMonths, 10) || 0) === 11) {
                          e.preventDefault();
                          const curY = parseInt(customYears, 10) || 0;
                          if (curY < 50) {
                            setCustomYears(String(curY + 1));
                            setCustomMonths('0');
                          }
                        } else if (e.key === 'ArrowDown' && (parseInt(customMonths, 10) || 0) === 0) {
                          e.preventDefault();
                          const curY = parseInt(customYears, 10) || 0;
                          if (curY > 0) {
                            setCustomYears(String(curY - 1));
                            setCustomMonths('11');
                          }
                        }
                      }}
                      onBlur={() => { if (customMonths === '') setCustomMonths('0'); }}
                      placeholder="0"
                      style={{ ...dmsControlStyle(), width: 64, height: 38, fontSize: 14, padding: '0 6px', boxSizing: 'border-box', textAlign: 'center', fontWeight: 700 }}
                    />
                    <div className="create-certificate-type-modal-i39">
                      <span className="create-certificate-type-modal-i40">
                        Months
                      </span>
                      <span className="create-certificate-type-modal-i41">
                        (rolls at 12)
                      </span>
                    </div>
                  </div>
                  <div
                    className="create-certificate-type-modal-i42" style={{ color: clay.accent, borderRadius: 6, background: clay.accentSoft, border: `1px solid ${clay.accent}33` }}
                  >
                    {(() => {
                      const y = parseInt(customYears, 10) || 0;
                      const m = parseInt(customMonths, 10) || 0;
                      if (y === 0 && m === 0) return 'Enter at least 1 month or year';
                      const parts: string[] = [];
                      if (y > 0) parts.push(`${y} Year${y === 1 ? '' : 's'}`);
                      if (m > 0) parts.push(`${m} Month${m === 1 ? '' : 's'}`);
                      return `Total: ${parts.join(', ')}`;
                    })()}
                  </div>
                </div>
              </div>
            )}
            {validityMode === 'doc' && (
              <div className="vdms-cert-type__hint">
                No fixed period. The expiry date is taken from each uploaded certificate.
              </div>
            )}
          </div>

          {/* Row 6: Remarks (optional) */}
          <div className="create-certificate-type-modal-i13">
            <label style={FIELD_LABEL} htmlFor="create-cert-remarks">
              Remarks
            </label>
            <textarea
              id="create-cert-remarks"
              className="vdms-cert-type__remarks"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Optional notes, e.g. Interim SMC tracked separately"
              rows={2}
              maxLength={2000}
              style={{ ...ctrl(), height: 'auto', padding: '8px 12px' }}
            />
          </div>
        </div>

        {/* Fixed Sticky Footer */}
        <div
          className="create-certificate-type-modal-i43" style={{ padding: isMobile ? '10px 18px' : '12px 24px' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ ...dmsBtn('secondary'), height: 38, padding: '0 20px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{ ...dmsBtn('primary', !busy), height: 38, padding: '0 24px', gap: 8 }}
          >
            <Icon iconName={busy ? 'Sync' : 'Add'} className="create-certificate-type-modal-i44" />
            {busy ? 'Creating Type...' : 'Create Certificate Type'}
          </button>
        </div>
      </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
