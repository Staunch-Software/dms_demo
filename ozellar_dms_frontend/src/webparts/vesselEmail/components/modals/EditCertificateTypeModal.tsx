import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY, DMS_ON_ACCENT } from '../dmsDesignSystem';
import { isMobileWidth } from '../responsive';

export interface EditCertificateTypeModalProps {
  host: VesselEmail;
  isOpen: boolean;
  master: {
    id: number;
    name: string;
    category: string;
    sub_category?: string | null;
    issuing_authority?: string | null;
    default_validity_years?: number | null;
    default_validity_months?: number | null;
    has_no_expiry?: boolean;
    remarks?: string | null;
    is_mandatory?: boolean;
  } | null;
  onClose: () => void;
  onSuccess: (updatedMaster: any) => void;
}

// Preset categories removed; loaded dynamically from catalog

// 'doc' = no fixed period: the expiry date is taken from each uploaded certificate.
type ValidityMode = 'five' | 'perm' | 'custom' | 'doc';

export function EditCertificateTypeModal({
  host,
  isOpen,
  master,
  onClose,
  onSuccess,
}: EditCertificateTypeModalProps): React.ReactElement | null {
  const [name, setName] = React.useState<string>('');
  const [category, setCategory] = React.useState<string>('');
  const [isCustomCategory, setIsCustomCategory] = React.useState<boolean>(false);
  const [savedCategories, setSavedCategories] = React.useState<string[]>([]);
  const [customCategory, setCustomCategory] = React.useState<string>('');
  const [subCategory, setSubCategory] = React.useState<string>('');
  const [issuingAuthority, setIssuingAuthority] = React.useState<string>('');
  const [validityMode, setValidityMode] = React.useState<ValidityMode>('five');
  const [customYears, setCustomYears] = React.useState<string>('0');
  const [customMonths, setCustomMonths] = React.useState<string>('6');
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

  const formRef = React.useRef<HTMLFormElement>(null);
  const [busy, setBusy] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize form fields whenever master changes or modal opens
  React.useEffect(() => {
    if (isOpen && master) {
      setName(master.name || '');
      const cat = master.category || '';
      if (cat && savedCategories.indexOf(cat) !== -1) {
        setCategory(cat);
        setIsCustomCategory(false);
        setCustomCategory('');
      } else if (cat) {
        setCategory(cat);
        setIsCustomCategory(false);
        setCustomCategory('');
      } else {
        setCategory('custom');
        setIsCustomCategory(true);
        setCustomCategory(cat);
      }
      setSubCategory(master.sub_category || '');
      setIssuingAuthority(master.issuing_authority || '');
      setRemarks(master.remarks || '');

      const y = master.default_validity_years;
      const m = master.default_validity_months;
      if ((y === null || y === undefined) && (m === null || m === undefined)) {
        // No period: Permanent, unless the type takes its expiry date from the document.
        setValidityMode(master.has_no_expiry === false ? 'doc' : 'perm');
        setCustomYears('0');
        setCustomMonths('6');
      } else if (y === 5 && (!m || m === 0)) {
        setValidityMode('five');
        setCustomYears('5');
        setCustomMonths('0');
      } else {
        setValidityMode('custom');
        setCustomYears(y !== null && y !== undefined ? String(y) : '0');
        setCustomMonths(m !== null && m !== undefined ? String(m) : '0');
      }

      setError(null);
    }
  }, [isOpen, master, savedCategories]);

  // Load existing categories from backend
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
        setSavedCategories(extra.sort());
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [host, isOpen]);

  // Escape key closes modal
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen || !master) return null;

  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024));
  const allCategories = React.useMemo(() => {
    const list = [...savedCategories];
    if (master?.category && list.map(c => c.toLowerCase()).indexOf(master.category.toLowerCase()) === -1) {
      list.push(master.category);
    }
    return list;
  }, [savedCategories, master?.category]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const finalCategory = isCustomCategory ? customCategory.trim() : category;

    if (!name.trim()) {
      setError('Please enter a certificate name.');
      return;
    }
    if (!finalCategory) {
      setError('Please select or specify a department/category.');
      return;
    }

    let validityYears: number | null = 5;
    let validityMonths: number | null = null;

    if (validityMode === 'perm' || validityMode === 'doc') {
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
        sub_category: subCategory.trim() || null,
        issuing_authority: issuingAuthority.trim() || null,
        default_validity_years: validityYears,
        default_validity_months: validityMonths,
        no_expiry: validityMode === 'perm',
        remarks: remarks.trim(),
      };

      const res = await fetch(`${host._base()}/api/certificates/masters/${master.id}`, {
        method: 'PUT',
        headers: {
          ...host._headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to update certificate type');
      }

      onSuccess(data);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error updating certificate type');
    } finally {
      setBusy(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-cert-modal-title"
      className="edit-certificate-type-modal-i1" style={{ position: 'fixed', zIndex: 100020, background: 'rgba(10, 22, 38, 0.65)', padding: isMobile ? 12 : 24 }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isMobile ? '95vw' : 680,
          fontFamily: DMS_FONT_DISPLAY,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vdms-surface)',
          borderRadius: isMobile ? 12 : clay.radiusCard + 8,
          border: '1px solid var(--vdms-line)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        className="vdms-cert-modal"
        onClick={e => e.stopPropagation()}
      >

        {/* Fixed Header with Balanced Padding */}
        <div
          className="edit-certificate-type-modal-i2" style={{ padding: isMobile ? '16px 20px' : '20px 32px' }}
        >
          <div className="edit-certificate-type-modal-i3">
            <span
              className="edit-certificate-type-modal-i4" style={{ borderRadius: 10, background: clay.accentSoft, color: clay.accent, boxShadow: clay.shadowIcon }}
            >
              <Icon iconName="Edit" className="edit-certificate-type-modal-i5" />
            </span>
            <div>
              <div
                id="edit-cert-modal-title"
                className="edit-certificate-type-modal-i6"
              >
                Edit Certificate Type
              </div>
              <div
                className="edit-certificate-type-modal-i7"
              >
                Update master catalog properties and compliance requirements for this certificate.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close"
            disabled={busy}
            className="edit-certificate-type-modal-i8" style={{ cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 6, transition: 'background 0.15s ease, color 0.15s ease' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--vdms-surface-hover)';
              e.currentTarget.style.color = 'var(--vdms-text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'var(--vdms-text-muted)';
            }}
          >
            <Icon iconName="Cancel" className="edit-certificate-type-modal-i9" />
          </button>
        </div>

        {/* Scrollable Form Body with Symmetrical Generous Padding */}
        <form
          ref={formRef}
          onSubmit={e => void handleSubmit(e)}
          className="edit-certificate-type-modal-i10"
        >
          <div
            className="edit-certificate-type-modal-i11" style={{ padding: isMobile ? '16px 20px' : '26px 32px' }}
          >
            {error && (
              <div
                className="edit-certificate-type-modal-i12" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}
              >
                <Icon iconName="ErrorBadge" />
                <span>{error}</span>
              </div>
            )}

            {/* Certificate Name */}
            <div>
              <label
                htmlFor="edit-cert-name"
                className="edit-certificate-type-modal-i13"
              >
                Certificate Name <span style={{ color: clay.pillDangerText }}>*</span>
              </label>
              <input
                id="edit-cert-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Document of Compliance (DOC)"
                required
                style={{
                  ...dmsControlStyle(),
                  width: '100%',
                  height: 38,
                  fontSize: 13.5,
                  padding: '0 14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Department / Category */}
            <div>
              <div
                className="edit-certificate-type-modal-i14"
              >
                <label
                  className="edit-certificate-type-modal-i15"
                >
                  Department / Category <span style={{ color: clay.pillDangerText }}>*</span>
                </label>
              </div>

              {/* Category Pills */}
              <div
                className="edit-certificate-type-modal-i16"
              >
                {allCategories.map(cat => {
                  const selected = !isCustomCategory && category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setIsCustomCategory(false);
                      }}
                      className="edit-certificate-type-modal-i17" style={{ border: selected
                          ? `1px solid ${clay.accent}`
                          : '1px solid var(--vdms-line)', background: selected ? clay.accentSoft : 'var(--vdms-surface-alt)', color: selected ? clay.accent : 'var(--vdms-text)', fontWeight: selected ? 700 : 500, transition: 'all 0.15s ease' }}
                    >
                      {cat}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setIsCustomCategory(true)}
                  className="edit-certificate-type-modal-i18" style={{ border: isCustomCategory
                      ? `1px solid ${clay.accent}`
                      : '1px dashed var(--vdms-line-hover)', background: isCustomCategory ? clay.accentSoft : 'transparent', color: isCustomCategory ? clay.accent : 'var(--vdms-text-muted)', fontWeight: isCustomCategory ? 700 : 500 }}
                >
                  <Icon iconName="Add" className="edit-certificate-type-modal-i19" />
                  <span>Custom...</span>
                </button>
              </div>

              {/* Custom Category Input */}
              {isCustomCategory && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  placeholder="Enter custom department or category..."
                  autoFocus
                  style={{
                    ...dmsControlStyle(),
                    width: '100%',
                    height: 38,
                    fontSize: 13,
                    padding: '0 14px',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>

            {/* Sub-Category / Standard */}
            <div>
              <label
                htmlFor="edit-cert-subcat"
                className="edit-certificate-type-modal-i13"
              >
                Sub-Category / Standard{' '}
                <span className="edit-certificate-type-modal-i20">
                  (Optional)
                </span>
              </label>
              <input
                id="edit-cert-subcat"
                type="text"
                value={subCategory}
                onChange={e => setSubCategory(e.target.value)}
                placeholder="e.g. SOLAS Ch. II-1, MARPOL Annex VI, ISM Code"
                style={{
                  ...dmsControlStyle(),
                  width: '100%',
                  height: 38,
                  fontSize: 13,
                  padding: '0 14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Default Issuing Authority */}
            <div>
              <label
                htmlFor="edit-cert-authority"
                className="edit-certificate-type-modal-i13"
              >
                Default Issuing Authority{' '}
                <span className="edit-certificate-type-modal-i20">
                  (Optional)
                </span>
              </label>
              <input
                id="edit-cert-authority"
                type="text"
                value={issuingAuthority}
                onChange={e => setIssuingAuthority(e.target.value)}
                placeholder="e.g. ClassNK, DNV, Flag Administration"
                style={{
                  ...dmsControlStyle(),
                  width: '100%',
                  height: 38,
                  fontSize: 13,
                  padding: '0 14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Validity Period: 5 Years, Continuous, Custom with Years & Months */}
            <div>
              <label
                className="edit-certificate-type-modal-i21"
              >
                Default Validity Term
              </label>
              <div
                className="edit-certificate-type-modal-i22" style={{ gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}
              >
                {/* 5 Years (Standard) */}
                <label
                  className="edit-certificate-type-modal-i23" style={{ borderRadius: 8, border: `1.5px solid ${validityMode === 'five' ? clay.accent : 'var(--vdms-line)'}`, background: validityMode === 'five' ? clay.accentSoft : 'var(--vdms-surface-alt)', fontWeight: validityMode === 'five' ? 700 : 500, color: validityMode === 'five' ? clay.accent : 'var(--vdms-text)' }}
                >
                  <input
                    type="radio"
                    name="validityMode"
                    checked={validityMode === 'five'}
                    onChange={() => setValidityMode('five')}
                    style={{ accentColor: clay.accent }}
                  />
                  <span>5 Years (Standard)</span>
                </label>

                {/* Permanent */}
                <label
                  className="edit-certificate-type-modal-i23" style={{ borderRadius: 8, border: `1.5px solid ${validityMode === 'perm' ? clay.accent : 'var(--vdms-line)'}`, background: validityMode === 'perm' ? clay.accentSoft : 'var(--vdms-surface-alt)', fontWeight: validityMode === 'perm' ? 700 : 500, color: validityMode === 'perm' ? clay.accent : 'var(--vdms-text)' }}
                >
                  <input
                    type="radio"
                    name="validityMode"
                    checked={validityMode === 'perm'}
                    onChange={() => setValidityMode('perm')}
                    style={{ accentColor: clay.accent }}
                  />
                  <span>Permanent</span>
                </label>

                {/* Custom... */}
                <label
                  className="edit-certificate-type-modal-i23" style={{ borderRadius: 8, border: `1.5px solid ${validityMode === 'custom' ? clay.accent : 'var(--vdms-line)'}`, background: validityMode === 'custom' ? clay.accentSoft : 'var(--vdms-surface-alt)', fontWeight: validityMode === 'custom' ? 700 : 500, color: validityMode === 'custom' ? clay.accent : 'var(--vdms-text)' }}
                >
                  <input
                    type="radio"
                    name="validityMode"
                    checked={validityMode === 'custom'}
                    onChange={() => setValidityMode('custom')}
                    style={{ accentColor: clay.accent }}
                  />
                  <span>Custom Duration...</span>
                </label>

                {/* From Document */}
                <label
                  className="edit-certificate-type-modal-i23" style={{ borderRadius: 8, border: `1.5px solid ${validityMode === 'doc' ? clay.accent : 'var(--vdms-line)'}`, background: validityMode === 'doc' ? clay.accentSoft : 'var(--vdms-surface-alt)', fontWeight: validityMode === 'doc' ? 700 : 500, color: validityMode === 'doc' ? clay.accent : 'var(--vdms-text)' }}
                >
                  <input
                    type="radio"
                    name="validityMode"
                    checked={validityMode === 'doc'}
                    onChange={() => setValidityMode('doc')}
                    style={{ accentColor: clay.accent }}
                  />
                  <span>From Document</span>
                </label>
              </div>
              {validityMode === 'doc' && (
                <div className="vdms-cert-type__hint">
                  No fixed period. The expiry date is taken from each uploaded certificate.
                </div>
              )}

              {/* Custom Duration Panel: Years and Months side-by-side */}
              {validityMode === 'custom' && (
                <div
                  className="edit-certificate-type-modal-i24" style={{ borderRadius: 8 }}
                >
                  <div
                    className="edit-certificate-type-modal-i25"
                  >
                    Specify Custom Validity Duration
                  </div>

                  <div className="edit-certificate-type-modal-i26">
                    {/* Years Input */}
                    <div className="edit-certificate-type-modal-i27">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={customYears}
                        onChange={e => handleYearsChange(e.target.value)}
                        onBlur={() => { if (customYears === '') setCustomYears('0'); }}
                        placeholder="0"
                        style={{
                          ...dmsControlStyle(),
                          width: 75,
                          height: 36,
                          fontSize: 13.5,
                          padding: '0 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                      />
                      <span className="edit-certificate-type-modal-i28">
                        Years
                      </span>
                    </div>

                    {/* Months Input (auto-increments years every 12 months) */}
                    <div className="edit-certificate-type-modal-i27">
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
                        style={{
                          ...dmsControlStyle(),
                          width: 75,
                          height: 36,
                          fontSize: 13.5,
                          padding: '0 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                      />
                      <div className="edit-certificate-type-modal-i29">
                        <span className="edit-certificate-type-modal-i30">
                          Months
                        </span>
                        <span className="edit-certificate-type-modal-i31">
                          (rolls at 12)
                        </span>
                      </div>
                    </div>

                    {/* Calculated Summary Pill */}
                    <div
                      className="edit-certificate-type-modal-i32" style={{ color: clay.accent, borderRadius: 6, background: clay.accentSoft, border: `1px solid ${clay.accent}33` }}
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
            </div>

            {/* Remarks (optional) */}
            <div>
              <label htmlFor="edit-cert-remarks" className="edit-certificate-type-modal-i13">
                Remarks{' '}
                <span className="edit-certificate-type-modal-i20">(Optional)</span>
              </label>
              <textarea
                id="edit-cert-remarks"
                className="vdms-cert-type__remarks"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Optional notes, e.g. Interim SMC tracked separately"
                rows={2}
                maxLength={2000}
                style={{
                  ...dmsControlStyle(),
                  width: '100%',
                  fontSize: 13,
                  padding: '8px 14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Fixed Footer with Matching Balanced Padding */}
          <div
            className="edit-certificate-type-modal-i33" style={{ padding: isMobile ? '12px 20px' : '16px 32px' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                ...dmsBtn('secondary'),
                height: 36,
                padding: '0 18px',
                fontSize: 12.5,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                ...dmsBtn('primary'),
                height: 36,
                padding: '0 20px',
                fontSize: 12.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? (
                <>
                  <Icon iconName="ProgressLoopInner" className="edit-certificate-type-modal-i34" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Icon iconName="Save" className="edit-certificate-type-modal-i35" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(modalContent, document.body)
    : modalContent;
}
