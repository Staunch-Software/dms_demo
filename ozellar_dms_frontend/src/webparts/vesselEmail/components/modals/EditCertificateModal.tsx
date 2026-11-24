import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY } from '../dmsDesignSystem';
import { isMobileWidth } from '../responsive';
import { CustomDropdown, CustomDropdownOption } from '../CustomDropdown';

export interface EditCertificateModalProps {
  host: VesselEmail;
  certificate: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableCategories?: string[];
  initialMode?: 'view' | 'edit';
}

interface MasterItem {
  id: number;
  name: string;
  category: string;
  sub_category?: string;
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--vdms-text-muted)',
  marginBottom: 3,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

// Preset categories removed; categories are loaded dynamically from existing masters and certificate

const DEFAULT_AUTHORITIES = [
  'ClassNK',
  'DNV',
  "Lloyd's Register",
  'American Bureau of Shipping',
  'Bureau Veritas',
  'RINA',
  'Korean Register',
  'China Classification Society',
  'Maritime and Port Authority of Singapore',
  'Panama Maritime Authority',
  'Liberian International Ship & Corporate Registry',
  'Republic of the Marshall Islands',
  'Bahamas Maritime Authority',
  'Cyprus Department of Merchant Shipping',
  'Malta Transport Authority',
  'Isle of Man Ship Registry',
  'United States Coast Guard',
  'UK Maritime and Coastguard Agency',
  'Danish Maritime Authority',
];

export function EditCertificateModal({
  host,
  certificate,
  isOpen,
  onClose,
  onSuccess,
  availableCategories,
  initialMode = 'view',
}: EditCertificateModalProps): React.ReactElement | null {
  const [isEditing, setIsEditing] = React.useState<boolean>(initialMode === 'edit');
  const [masters, setMasters] = React.useState<MasterItem[]>([]);
  const [selectedMasterId, setSelectedMasterId] = React.useState<number | null>(null);
  const [certificateName, setCertificateName] = React.useState<string>('');
  const [authorities, setAuthorities] = React.useState<string[]>([]);

  // Custom addition states for dropdowns
  const [isCustomCategory, setIsCustomCategory] = React.useState<boolean>(false);
  const [customCategoryText, setCustomCategoryText] = React.useState<string>('');
  const [isCustomAuthority, setIsCustomAuthority] = React.useState<boolean>(false);
  const [customAuthorityText, setCustomAuthorityText] = React.useState<string>('');
  const [isCustomMaster, setIsCustomMaster] = React.useState<boolean>(false);
  const [customMasterText, setCustomMasterText] = React.useState<string>('');

  const [certificateNumber, setCertificateNumber] = React.useState<string>('');
  const [category, setCategory] = React.useState<string>('');
  const [issuingAuthority, setIssuingAuthority] = React.useState<string>('');
  const [issueDate, setIssueDate] = React.useState<string>('');
  const [expiryDate, setExpiryDate] = React.useState<string>('');
  const [hasNoExpiry, setHasNoExpiry] = React.useState<boolean>(false);
  const [responsiblePerson, setResponsiblePerson] = React.useState<string>('');
  const [file, setFile] = React.useState<File | null>(null);

  // Document preview states
  const [docBlobUrl, setDocBlobUrl] = React.useState<string | null>(null);
  const [docLoading, setDocLoading] = React.useState<boolean>(false);
  const [docError, setDocError] = React.useState<string | null>(null);

  const [busy, setBusy] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = React.useState<string | null>(null);

  // Sync isEditing when initialMode changes or modal opens
  React.useEffect(() => {
    if (isOpen) {
      setIsEditing(initialMode === 'edit');
    }
  }, [isOpen, initialMode, certificate?.id]);

  // Fetch certificate master types and issuing authorities on modal open
  React.useEffect(() => {
    if (!isOpen) return;
    const base = host._base();
    const headers = host._headers();
    fetch(`${base}/api/certificates/masters`, { headers })
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (Array.isArray(data)) {
          setMasters(data);
        }
      })
      .catch(() => {});

    // Fetch issuing authorities stored in database
    fetch(`${base}/api/certificates/issuing-authorities`, { headers })
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (Array.isArray(data)) {
          const names = data.map((d: any) => (typeof d === 'string' ? d : d.name)).filter(Boolean);
          setAuthorities(names);
        }
      })
      .catch(() => {});
  }, [isOpen, host]);

  // Unified list of categories
  const categoriesList = React.useMemo(() => {
    const set = new Set<string>(availableCategories || []);
    masters.forEach(m => { if (m.category) set.add(m.category); });
    if (certificate?.category) set.add(certificate.category);
    return Array.from(set).sort();
  }, [availableCategories, masters, certificate?.category]);

  // Unified list of issuing authorities from database, defaults, and current certificate
  const authoritiesList = React.useMemo(() => {
    const set = new Set<string>(authorities.length > 0 ? authorities : DEFAULT_AUTHORITIES);
    DEFAULT_AUTHORITIES.forEach(a => set.add(a));
    if (certificate?.issuing_authority) set.add(certificate.issuing_authority);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [authorities, certificate?.issuing_authority]);

  // Options for Certificate Type dropdown: custom option FIRST, followed by catalog
  const masterSelectOptions: CustomDropdownOption[] = React.useMemo(() => {
    const list: CustomDropdownOption[] = [
      {
        key: '__custom_master__',
        text: '+ Add Custom Certificate Type...',
        isCustomAction: true,
        iconName: 'Add',
      },
    ];
    if (masters.length > 0) {
      masters.forEach(m => {
        list.push({
          key: m.id,
          text: m.name,
          subtext: m.category,
          category: m.category,
          iconName: 'Certificate',
        });
      });
    } else if (certificate?.certificate_master_id) {
      list.push({
        key: certificate.certificate_master_id,
        text: certificate.certificate_name || 'Current Certificate',
        subtext: certificate.category,
        iconName: 'Certificate',
      });
    }
    return list;
  }, [masters, certificate]);

  // Options for Category dropdown: custom option FIRST, followed by categories
  const categoryOptions: CustomDropdownOption[] = React.useMemo(() => {
    const list: CustomDropdownOption[] = [
      {
        key: '__custom__',
        text: '+ Add Custom Category...',
        isCustomAction: true,
        iconName: 'Add',
      },
    ];
    categoriesList.forEach(c => {
      list.push({
        key: c,
        text: c,
      });
    });
    return list;
  }, [categoriesList]);

  // Options for Issuing Authority dropdown: custom option FIRST, followed by authorities
  const authorityOptions: CustomDropdownOption[] = React.useMemo(() => {
    const list: CustomDropdownOption[] = [
      {
        key: '__custom__',
        text: '+ Add Custom Authority...',
        isCustomAction: true,
        iconName: 'Add',
      },
    ];
    authoritiesList.forEach(a => {
      list.push({
        key: a,
        text: a,
      });
    });
    return list;
  }, [authoritiesList]);

  // Pre-fill from the certificate being viewed / edited
  React.useEffect(() => {
    if (!certificate || !isOpen) return;
    setSelectedMasterId(certificate.certificate_master_id || null);
    setCertificateName(certificate.certificate_name || '');
    setCertificateNumber(certificate.certificate_number || '');
    setCategory(certificate.category || '');
    setIssuingAuthority(certificate.issuing_authority || '');
    setIssueDate(certificate.issue_date ? certificate.issue_date.slice(0, 10) : '');
    setExpiryDate(certificate.expiry_date ? certificate.expiry_date.slice(0, 10) : '');
    setHasNoExpiry(Boolean(certificate.has_no_expiry));
    setResponsiblePerson(certificate.responsible_person || '');
    setFile(null);
    setError(null);
    setUploadWarning(null);
    setIsCustomCategory(false);
    setCustomCategoryText('');
    setIsCustomAuthority(false);
    setCustomAuthorityText('');
    setIsCustomMaster(false);
    setCustomMasterText('');
  }, [certificate, isOpen]);

  // Detect whether ANY field has been edited / changed (isDirty)
  const isDirty = React.useMemo(() => {
    if (!certificate) return false;
    
    // Custom Certificate Type entered
    if (isCustomMaster && customMasterText.trim().length > 0) return true;

    // Certificate Type changed
    const origMasterId = certificate.certificate_master_id || null;
    if (selectedMasterId !== origMasterId) return true;

    // Certificate Number changed
    const origCertNum = (certificate.certificate_number || '').trim();
    if (certificateNumber.trim() !== origCertNum) return true;

    // Category changed (including custom)
    const effectiveCategory = isCustomCategory ? customCategoryText : category;
    const origCategory = (certificate.category || '').trim();
    if (effectiveCategory.trim() !== origCategory) return true;

    // Issuing Authority changed (including custom)
    const effectiveAuthority = isCustomAuthority ? customAuthorityText : issuingAuthority;
    const origAuthority = (certificate.issuing_authority || '').trim();
    if (effectiveAuthority.trim() !== origAuthority) return true;

    // Issue Date changed
    const origIssueDate = certificate.issue_date ? certificate.issue_date.slice(0, 10) : '';
    if (issueDate !== origIssueDate) return true;

    // Expiry Date / Permanent changed
    const origHasNoExpiry = Boolean(certificate.has_no_expiry);
    if (hasNoExpiry !== origHasNoExpiry) return true;
    if (!hasNoExpiry) {
      const origExpiryDate = certificate.expiry_date ? certificate.expiry_date.slice(0, 10) : '';
      if (expiryDate !== origExpiryDate) return true;
    }

    // Responsible Person changed
    const origResp = (certificate.responsible_person || '').trim();
    if (responsiblePerson.trim() !== origResp) return true;

    // Replacement file selected
    if (file !== null) return true;

    return false;
  }, [
    certificate,
    isCustomMaster,
    customMasterText,
    selectedMasterId,
    certificateNumber,
    isCustomCategory,
    customCategoryText,
    category,
    isCustomAuthority,
    customAuthorityText,
    issuingAuthority,
    issueDate,
    expiryDate,
    hasNoExpiry,
    responsiblePerson,
    file,
  ]);

  // Handle Certificate Type change
  const handleMasterChange = (key: string | number, option: CustomDropdownOption): void => {
    if (key === '__custom_master__') {
      setIsCustomMaster(true);
      setCustomMasterText('');
      return;
    }
    const mId = Number(key);
    setSelectedMasterId(mId);
    setCertificateName(option.text);
    const found = masters.find(m => m.id === mId);
    if (found && found.category) {
      setCategory(found.category);
    }
  };

  // Handle local replacement file preview blob
  const replacementBlobUrl = React.useMemo(() => {
    if (file) {
      try {
        return URL.createObjectURL(file);
      } catch {
        return null;
      }
    }
    return null;
  }, [file]);

  React.useEffect(() => {
    return () => {
      if (replacementBlobUrl) {
        URL.revokeObjectURL(replacementBlobUrl);
      }
    };
  }, [replacementBlobUrl]);

  // Fetch active document preview for existing certificate
  React.useEffect(() => {
    if (!isOpen || !certificate || file) {
      if (docBlobUrl) {
        URL.revokeObjectURL(docBlobUrl);
        setDocBlobUrl(null);
      }
      return;
    }

    if (!certificate.sharepoint_item_id) {
      setDocBlobUrl(null);
      setDocLoading(false);
      setDocError(null);
      return;
    }

    let active = true;
    setDocLoading(true);
    setDocError(null);

    const base = host._base();
    const headers = host._headers();
    const fileId = encodeURIComponent(certificate.sharepoint_item_id);

    fetch(`${base}/api/files/${fileId}/content`, { headers })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setDocBlobUrl(url);
        setDocLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setDocLoading(false);
        setDocError(err?.message || 'Could not load in-app preview.');
      });

    return () => {
      active = false;
      if (docBlobUrl) {
        URL.revokeObjectURL(docBlobUrl);
      }
    };
  }, [isOpen, certificate?.id, certificate?.sharepoint_item_id, file]);

  const dateError =
    !hasNoExpiry && issueDate && expiryDate && expiryDate <= issueDate
      ? 'Expiry date must be after the issue date.'
      : null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!certificate) return;
    if (!isDirty) return; // Only submit when edited

    const finalAuthority = (isCustomAuthority ? customAuthorityText : issuingAuthority).trim();
    const finalCategory = (isCustomCategory ? customCategoryText : category).trim();
    const finalMasterName = (isCustomMaster ? customMasterText : '').trim();

    if (!finalAuthority) {
      setError('Issuing authority is required.');
      return;
    }
    if (!issueDate) {
      setError('Issue date is required.');
      return;
    }
    if (!hasNoExpiry && !expiryDate) {
      setError('Expiry date is required unless marked as Permanent.');
      return;
    }
    if (dateError) {
      setError(dateError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('issuing_authority', finalAuthority);
      formData.append('issue_date', issueDate);
      formData.append('certificate_number', certificateNumber.trim());
      if (finalCategory) formData.append('category', finalCategory);
      if (finalMasterName) {
        formData.append('custom_certificate_name', finalMasterName);
      } else if (selectedMasterId) {
        formData.append('certificate_master_id', String(selectedMasterId));
      }
      if (!hasNoExpiry && expiryDate) formData.append('expiry_date', expiryDate);
      formData.append('has_no_expiry', String(hasNoExpiry));
      formData.append('responsible_person', responsiblePerson.trim());
      if (file) formData.append('file', file);

      // If user typed a custom issuing authority, ensure it is also saved in issuing_authorities table
      if (isCustomAuthority && finalAuthority) {
        fetch(`${host._base()}/api/certificates/issuing-authorities`, {
          method: 'POST',
          headers: {
            ...host._headers(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: finalAuthority }),
        }).catch(() => {});
      }

      const res = await fetch(`${host._base()}/api/certificates/${certificate.id}`, {
        method: 'PUT',
        headers: {
          'x-session-id': (host.state as any).sessionId || '',
          'x-user-email': host.props.userEmail || '',
        },
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Failed to save certificate (HTTP ${res.status})`);
      }
      const saved = await res.json().catch(() => null);
      onSuccess();
      if (saved?.upload_error) {
        setUploadWarning(String(saved.upload_error));
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error saving certificate');
    } finally {
      setBusy(false);
    }
  };

  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024));

  if (!isOpen || !certificate) return null;

  const activeDocUrl = replacementBlobUrl || docBlobUrl;
  const isReplacing = Boolean(file);
  const docFilename = file ? file.name : (certificate.filename || 'Certificate Document');
  const isPdf = docFilename.toLowerCase().endsWith('.pdf') || (file && file.type === 'application/pdf');

  // Validity badge helper
  const renderValidityBadge = (): React.ReactElement => {
    if (hasNoExpiry || certificate.has_no_expiry) {
      return (
        <span
          className="edit-certificate-modal-i1" style={{ borderRadius: 10, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}
        >
          <Icon iconName="CheckMark" className="edit-certificate-modal-i2" /> Permanent
        </span>
      );
    }
    const expStr = expiryDate || certificate.expiry_date;
    if (!expStr) {
      return <span className="edit-certificate-modal-i3">—</span>;
    }
    const expObj = new Date(expStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return (
        <span
          className="edit-certificate-modal-i1" style={{ borderRadius: 10, background: clay.pillDangerBg, color: clay.pillDangerText }}
        >
          <Icon iconName="ErrorBadge" className="edit-certificate-modal-i2" /> Overdue ({Math.abs(diffDays)}d)
        </span>
      );
    }
    if (diffDays <= 30) {
      return (
        <span
          className="edit-certificate-modal-i1" style={{ borderRadius: 10, background: clay.pillWarnBg, color: clay.pillWarnText }}
        >
          <Icon iconName="Clock" className="edit-certificate-modal-i2" /> Due in {diffDays}d
        </span>
      );
    }
    if (diffDays <= 90) {
      return (
        <span
          className="edit-certificate-modal-i1" style={{ borderRadius: 10, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}
        >
          <Icon iconName="Clock" className="edit-certificate-modal-i2" /> Due in {diffDays}d
        </span>
      );
    }
    return (
      <span
        className="edit-certificate-modal-i1" style={{ borderRadius: 10, background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a' }}
      >
        <Icon iconName="CheckMark" className="edit-certificate-modal-i2" /> Valid ({diffDays}d left)
      </span>
    );
  };

  return ReactDOM.createPortal(
    <div
      className="edit-certificate-modal-i4" style={{ position: 'fixed', zIndex: 100005, background: 'rgba(5, 15, 25, 0.65)', padding: isMobile ? 8 : 16 }}
    >
      <div
        className="vdms-cert-modal"
        style={{
          width: '100%',
          maxWidth: isMobile ? '96vw' : 1160,
          height: isMobile ? '94vh' : '88vh',
          maxHeight: 820,
          fontFamily: DMS_FONT_DISPLAY,
          background: 'var(--vdms-surface)',
          borderRadius: isMobile ? 12 : 16,
          border: '1px solid var(--vdms-line)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >

        {/* Fixed Header */}
        <div
          className="edit-certificate-modal-i5" style={{ padding: isMobile ? '12px 16px' : '14px 24px' }}
        >
          <div className="edit-certificate-modal-i6" style={{ minWidth: 0 }}>
            <span
              className="edit-certificate-modal-i7" style={{ borderRadius: 8, background: isEditing ? 'rgba(2, 132, 199, 0.12)' : 'rgba(16, 185, 129, 0.12)', color: isEditing ? '#0284c7' : '#059669' }}
            >
              <Icon iconName={isEditing ? 'Edit' : 'Certificate'} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="edit-certificate-modal-i8">
                <h3 className="edit-certificate-modal-i9" style={{ fontSize: isMobile ? 15 : 17, fontFamily: DMS_FONT_DISPLAY }}>
                  {isEditing ? 'Edit Certificate' : 'Certificate Details'}
                </h3>
                {category && (
                  <span
                    className="edit-certificate-modal-i10" style={{ background: '#e0f2fe', color: '#0284c7', borderRadius: 12 }}
                  >
                    {category}
                  </span>
                )}
              </div>
              <div className="edit-certificate-modal-i11">
                <strong className="edit-certificate-modal-i12">{certificateName || certificate.certificate_name}</strong> · Target Vessel: {certificate.vessel_name}
              </div>
            </div>
          </div>
          <div className="edit-certificate-modal-i13">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={{
                  ...dmsBtn('primary'),
                  height: 30,
                  padding: '0 12px',
                  fontSize: 11.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Icon iconName="Edit" className="edit-certificate-modal-i14" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="edit-certificate-modal-i15" style={{ borderRadius: 6 }}
            >
              <Icon iconName="Cancel" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split 2 Columns */}
        <div
          className="edit-certificate-modal-i16" style={{ gridTemplateColumns: isMobile ? '1fr' : '480px 1fr' }}
        >
          {/* LEFT COLUMN */}
          {isEditing ? (
            /* EDIT FORM: Enabled once user clicked Edit; Save button only enabled once isDirty */
            <form
              onSubmit={handleSubmit}
              className="edit-certificate-modal-i17" style={{ borderRight: isMobile ? 'none' : '1px solid var(--vdms-line)', background: 'var(--vdms-surface)' }}
            >
              <div
                className="edit-certificate-modal-i18" style={{ padding: isMobile ? '12px 14px' : '16px 20px' }}
              >
                {error && (
                  <div
                    className="edit-certificate-modal-i19" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}
                  >
                    <Icon iconName="ErrorBadge" />
                    {error}
                  </div>
                )}
                {uploadWarning && (
                  <div
                    className="edit-certificate-modal-i20" style={{ borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--vdms-text)' }}
                  >
                    <Icon iconName="Warning" className="edit-certificate-modal-i21" />
                    <span>The changes were saved, but file upload/move had a warning: {uploadWarning}</span>
                  </div>
                )}

                {/* Certificate Type: Custom Dropdown with Custom option FIRST, no search input, 5 visible options */}
                <div>
                  <div className="edit-certificate-modal-i22">
                    <label style={LABEL_STYLE}>
                      Certificate Type <span className="edit-certificate-modal-i23">*</span>
                    </label>
                    {isCustomMaster && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomMaster(false);
                          setCustomMasterText('');
                          setSelectedMasterId(certificate.certificate_master_id || null);
                          setCertificateName(certificate.certificate_name || '');
                        }}
                        className="edit-certificate-modal-i24" style={{ background: 'transparent', color: '#0284c7' }}
                      >
                        ← Choose from list
                      </button>
                    )}
                  </div>
                  {isCustomMaster ? (
                    <div className="edit-certificate-modal-i25">
                      <input
                        type="text"
                        value={customMasterText}
                        onChange={e => {
                          setCustomMasterText(e.target.value);
                          setCertificateName(e.target.value);
                        }}
                        disabled={busy}
                        placeholder="Enter custom certificate type name..."
                        autoFocus
                        style={{ ...dmsControlStyle(), flex: 1, height: 35, boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomMaster(false);
                          setCustomMasterText('');
                          setSelectedMasterId(certificate.certificate_master_id || null);
                          setCertificateName(certificate.certificate_name || '');
                        }}
                        title="Back to certificate catalog"
                        className="edit-certificate-modal-i26" style={{ background: 'var(--vdms-surface)', color: 'var(--vdms-text-muted)', borderRadius: 6 }}
                      >
                        <Icon iconName="Cancel" className="edit-certificate-modal-i2" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  ) : (
                    <CustomDropdown
                      options={masterSelectOptions}
                      selectedKey={selectedMasterId}
                      onChange={handleMasterChange}
                      placeholder="Select certificate type..."
                      disabled={busy}
                      visibleRows={5}
                    />
                  )}
                </div>

                {/* Row 1: Certificate Number & Category: Custom Dropdown with Custom option FIRST, 5 visible options */}
                <div className="edit-certificate-modal-i27">
                  <div>
                    <label style={LABEL_STYLE}>Certificate Number</label>
                    <input
                      type="text"
                      value={certificateNumber}
                      onChange={e => setCertificateNumber(e.target.value)}
                      disabled={busy}
                      placeholder="e.g. 26HN010800-EAP-3"
                      style={{ ...dmsControlStyle(), width: '100%', height: 35, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div className="edit-certificate-modal-i22">
                      <label style={LABEL_STYLE}>Category <span className="edit-certificate-modal-i23">*</span></label>
                      {isCustomCategory && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCategory(false);
                            setCustomCategoryText('');
                            setCategory(certificate.category || categoriesList[0] || '');
                          }}
                          className="edit-certificate-modal-i24" style={{ background: 'transparent', color: '#0284c7' }}
                        >
                          ← Choose from list
                        </button>
                      )}
                    </div>
                    {isCustomCategory ? (
                      <div className="edit-certificate-modal-i25">
                        <input
                          type="text"
                          value={customCategoryText}
                          onChange={e => {
                            setCustomCategoryText(e.target.value);
                            setCategory(e.target.value);
                          }}
                          disabled={busy}
                          placeholder="Enter custom category..."
                          autoFocus
                          style={{ ...dmsControlStyle(), flex: 1, height: 35, boxSizing: 'border-box' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCategory(false);
                            setCustomCategoryText('');
                            setCategory(certificate.category || categoriesList[0] || '');
                          }}
                          title="Back to category list"
                          className="edit-certificate-modal-i26" style={{ background: 'var(--vdms-surface)', color: 'var(--vdms-text-muted)', borderRadius: 6 }}
                        >
                          <Icon iconName="Cancel" className="edit-certificate-modal-i2" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    ) : (
                      <CustomDropdown
                        options={categoryOptions}
                        selectedKey={category}
                        onChange={(key) => {
                          if (key === '__custom__') {
                            setIsCustomCategory(true);
                            setCustomCategoryText('');
                          } else {
                            setCategory(String(key));
                          }
                        }}
                        placeholder="Select category..."
                        disabled={busy}
                        visibleRows={5}
                      />
                    )}
                  </div>
                </div>

                {/* Row 2: Issuing Authority (Custom Dropdown from DB with Custom option FIRST, 5 visible options) & Responsible Person */}
                <div className="edit-certificate-modal-i27">
                  <div>
                    <div className="edit-certificate-modal-i22">
                      <label style={LABEL_STYLE}>
                        Issuing Authority <span className="edit-certificate-modal-i23">*</span>
                      </label>
                      {isCustomAuthority && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAuthority(false);
                            setCustomAuthorityText('');
                            setIssuingAuthority(certificate.issuing_authority || authoritiesList[0] || 'ClassNK');
                          }}
                          className="edit-certificate-modal-i24" style={{ background: 'transparent', color: '#0284c7' }}
                        >
                          ← Choose from list
                        </button>
                      )}
                    </div>
                    {isCustomAuthority ? (
                      <div className="edit-certificate-modal-i25">
                        <input
                          type="text"
                          value={customAuthorityText}
                          onChange={e => {
                            setCustomAuthorityText(e.target.value);
                            setIssuingAuthority(e.target.value);
                          }}
                          disabled={busy}
                          placeholder="Enter custom authority (e.g. ClassNK / DNV)..."
                          autoFocus
                          style={{ ...dmsControlStyle(), flex: 1, height: 35, boxSizing: 'border-box' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAuthority(false);
                            setCustomAuthorityText('');
                            setIssuingAuthority(certificate.issuing_authority || authoritiesList[0] || 'ClassNK');
                          }}
                          title="Back to authorities list"
                          className="edit-certificate-modal-i26" style={{ background: 'var(--vdms-surface)', color: 'var(--vdms-text-muted)', borderRadius: 6 }}
                        >
                          <Icon iconName="Cancel" className="edit-certificate-modal-i2" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    ) : (
                      <CustomDropdown
                        options={authorityOptions}
                        selectedKey={issuingAuthority}
                        onChange={(key) => {
                          if (key === '__custom__') {
                            setIsCustomAuthority(true);
                            setCustomAuthorityText('');
                          } else {
                            setIssuingAuthority(String(key));
                          }
                        }}
                        placeholder="Select issuing authority..."
                        disabled={busy}
                        visibleRows={5}
                      />
                    )}
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Responsible Person / Dept</label>
                    <input
                      type="text"
                      value={responsiblePerson}
                      onChange={e => setResponsiblePerson(e.target.value)}
                      disabled={busy}
                      placeholder="e.g. Superintendent / Master"
                      style={{ ...dmsControlStyle(), width: '100%', height: 35, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Row 3: Issue Date & Expiry Date */}
                <div className="edit-certificate-modal-i27">
                  <div>
                    <label style={LABEL_STYLE}>Issue Date <span className="edit-certificate-modal-i23">*</span></label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={e => setIssueDate(e.target.value)}
                      disabled={busy}
                      style={{ ...dmsControlStyle(), width: '100%', height: 35, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div className="edit-certificate-modal-i28">
                      <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>Expiry Date {!hasNoExpiry && <span className="edit-certificate-modal-i23">*</span>}</label>
                      <label className="edit-certificate-modal-i29" style={{ color: hasNoExpiry ? clay.accent : 'var(--vdms-text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={hasNoExpiry}
                          onChange={e => setHasNoExpiry(e.target.checked)}
                          disabled={busy}
                          className="edit-certificate-modal-i30" style={{ width: 12, accentColor: clay.accent }}
                        />
                        Permanent
                      </label>
                    </div>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      disabled={busy || hasNoExpiry}
                      style={{
                        ...dmsControlStyle(),
                        width: '100%',
                        height: 35,
                        boxSizing: 'border-box',
                        opacity: hasNoExpiry ? 0.45 : 1,
                        background: hasNoExpiry ? 'var(--vdms-surface-alt)' : undefined,
                      }}
                    />
                    {dateError && (
                      <div className="edit-certificate-modal-i31" style={{ color: clay.pillDangerText }}>{dateError}</div>
                    )}
                  </div>
                </div>

                {/* Row 4: Certificate Document */}
                <div className="edit-certificate-modal-i32" style={{ borderRadius: 8 }}>
                  <div className="edit-certificate-modal-i33">
                    <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>Certificate Document</label>
                    {certificate.sharepoint_file_url && (
                      <a
                        href={certificate.sharepoint_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="edit-certificate-modal-i34" style={{ color: clay.accent }}
                      >
                        <Icon iconName="OpenInNewWindow" className="edit-certificate-modal-i2" />
                        <span>Open in SPO</span>
                      </a>
                    )}
                  </div>

                  {certificate.filename && !file && (
                    <div
                      className="edit-certificate-modal-i35" style={{ borderRadius: 6, background: 'var(--vdms-surface)' }}
                    >
                      <div className="edit-certificate-modal-i13" style={{ minWidth: 0 }}>
                        <Icon iconName="PDF" className="edit-certificate-modal-i36" style={{ color: '#0284c7' }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="edit-certificate-modal-i37">
                            {certificate.filename}
                          </div>
                          <div className="edit-certificate-modal-i38">Active file in SharePoint</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {file ? (
                    <div
                      className="edit-certificate-modal-i39" style={{ borderRadius: 6, background: 'rgba(2, 132, 199, 0.08)' }}
                    >
                      <div className="edit-certificate-modal-i13" style={{ minWidth: 0 }}>
                        <Icon iconName="Upload" className="edit-certificate-modal-i40" style={{ color: '#0284c7' }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="edit-certificate-modal-i41" style={{ color: '#0284c7' }}>
                            {file.name}
                          </div>
                          <div className="edit-certificate-modal-i42">
                            {(file.size / 1024).toFixed(1)} KB · Replacement preview loaded
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        disabled={busy}
                        className="edit-certificate-modal-i43" style={{ color: clay.pillDangerText }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      className="edit-certificate-modal-i44" style={{ borderRadius: 6, background: 'var(--vdms-surface)', cursor: busy ? 'default' : 'pointer', color: 'var(--vdms-text)' }}
                    >
                      <Icon iconName="Upload" className="edit-certificate-modal-i45" style={{ color: clay.accent }} />
                      <span>Choose replacement file...</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        disabled={busy}
                        onChange={e => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                        className="edit-certificate-modal-i46"
                      />
                    </label>
                  )}
                </div>

                {/* Row 5: SharePoint Category Path */}
                <div
                  className="edit-certificate-modal-i47" style={{ borderRadius: 6 }}
                >
                  <Icon iconName="FabricFolder" className="edit-certificate-modal-i48" />
                  <span>
                    SPO Path: <strong className="edit-certificate-modal-i12">Certificates/{category || '...'}/</strong>
                  </span>
                </div>
              </div>

              {/* Edit Mode Sticky Footer */}
              <div
                className="edit-certificate-modal-i49"
              >
                <div className="edit-certificate-modal-i50">
                  {isDirty ? (
                    <span className="edit-certificate-modal-i51" style={{ color: '#0284c7' }}>
                      <span className="edit-certificate-modal-i52" style={{ background: '#0284c7' }} />
                      Unsaved edits
                    </span>
                  ) : (
                    <span className="edit-certificate-modal-i53">
                      Edit fields to enable saving
                    </span>
                  )}
                </div>

                <div className="edit-certificate-modal-i54">
                  <button
                    type="button"
                    onClick={() => {
                      if (initialMode === 'view') {
                        setIsEditing(false); // return to clean view
                      } else {
                        onClose();
                      }
                    }}
                    disabled={busy}
                    style={{ ...dmsBtn('secondary', !busy), height: 34, padding: '0 16px', fontSize: 12 }}
                  >
                    Cancel
                  </button>

                  {/* Save Changes: ENABLED ONLY AFTER EDITING (isDirty) */}
                  <button
                    type="submit"
                    disabled={!isDirty || busy}
                    title={!isDirty ? 'Make changes to any field to enable saving' : 'Save changes'}
                    style={{
                      ...dmsBtn('primary', isDirty && !busy),
                      height: 34,
                      padding: '0 20px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: isDirty ? 1 : 0.45,
                      cursor: isDirty && !busy ? 'pointer' : 'not-allowed',
                      boxShadow: isDirty ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
                    }}
                  >
                    <Icon iconName="Save" className="edit-certificate-modal-i55" />
                    <span>{busy ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* VIEW DETAILS MODE: Read-only specifications, fits without scrollbar */
            <div
              className="edit-certificate-modal-i17" style={{ borderRight: isMobile ? 'none' : '1px solid var(--vdms-line)', background: 'var(--vdms-surface)' }}
            >
              <div
                className="edit-certificate-modal-i18" style={{ padding: isMobile ? '12px 14px' : '16px 20px' }}
              >
                {/* Row 1: Certificate Number & Category */}
                <div className="edit-certificate-modal-i27">
                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Certificate Number</div>
                    <div className="edit-certificate-modal-i57">
                      {certificateNumber || certificate.certificate_number || '—'}
                    </div>
                  </div>

                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Category</div>
                    <div className="edit-certificate-modal-i58">
                      {category || certificate.category || '—'}
                    </div>
                  </div>
                </div>

                {/* Row 2: Issuing Authority & Responsible Person */}
                <div className="edit-certificate-modal-i27">
                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Issuing Authority / Society</div>
                    <div className="edit-certificate-modal-i59">
                      {issuingAuthority || certificate.issuing_authority || '—'}
                    </div>
                  </div>

                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Responsible Person / Dept</div>
                    <div className="edit-certificate-modal-i59">
                      {responsiblePerson || certificate.responsible_person || '—'}
                    </div>
                  </div>
                </div>

                {/* Row 3: Issue Date & Expiry Date with Status */}
                <div className="edit-certificate-modal-i27">
                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Issue Date</div>
                    <div className="edit-certificate-modal-i60">
                      {issueDate ? issueDate.slice(0, 10) : (certificate.issue_date ? String(certificate.issue_date).slice(0, 10) : '—')}
                    </div>
                  </div>

                  <div className="edit-certificate-modal-i56" style={{ borderRadius: 8 }}>
                    <div style={LABEL_STYLE}>Expiry Date</div>
                    <div className="edit-certificate-modal-i61">
                      {hasNoExpiry || certificate.has_no_expiry ? (
                        <span className="edit-certificate-modal-i62" style={{ color: clay.accent }}>Permanent</span>
                      ) : (
                        expiryDate ? expiryDate.slice(0, 10) : (certificate.expiry_date ? String(certificate.expiry_date).slice(0, 10) : '—')
                      )}
                    </div>
                    {renderValidityBadge()}
                  </div>
                </div>

                {/* Row 4: SharePoint Document Card */}
                <div className="edit-certificate-modal-i63" style={{ borderRadius: 8 }}>
                  <div style={LABEL_STYLE}>SharePoint Document Attachment</div>
                  <div className="edit-certificate-modal-i64">
                    <div className="edit-certificate-modal-i13" style={{ minWidth: 0 }}>
                      <Icon iconName="PDF" className="edit-certificate-modal-i65" style={{ color: '#0284c7' }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="edit-certificate-modal-i66">
                          {certificate.filename || 'No document attached'}
                        </div>
                        <div className="edit-certificate-modal-i67" style={{ color: certificate.filename ? '#16a34a' : 'var(--vdms-text-muted)' }}>
                          {certificate.filename ? 'Synced with SharePoint Online' : 'No file on record'}
                        </div>
                      </div>
                    </div>
                    {certificate.sharepoint_file_url && (
                      <a
                        href={certificate.sharepoint_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...dmsBtn('secondary'),
                          fontSize: 11,
                          padding: '3px 9px',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Icon iconName="OpenInNewWindow" className="edit-certificate-modal-i14" />
                        <span>Open</span>
                      </a>
                    )}
                  </div>
                  <div className="edit-certificate-modal-i68">
                    <Icon iconName="FabricFolder" className="edit-certificate-modal-i48" />
                    <span>Folder: Certificates/{category || certificate.category || '...'}/</span>
                  </div>
                </div>
              </div>

              {/* View Mode Sticky Footer */}
              <div
                className="edit-certificate-modal-i49"
              >
                <div className="edit-certificate-modal-i69">
                  Vessel: <strong className="edit-certificate-modal-i12">{certificate.vessel_name}</strong>
                </div>

                <div className="edit-certificate-modal-i54">
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ ...dmsBtn('secondary'), height: 34, padding: '0 16px', fontSize: 12 }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    style={{
                      ...dmsBtn('primary'),
                      height: 34,
                      padding: '0 20px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon iconName="Edit" className="edit-certificate-modal-i55" />
                    <span>Edit Certificate</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT COLUMN: Embedded Document Preview Window */}
          <div
            className="edit-certificate-modal-i70" style={{ minHeight: isMobile ? 320 : 0, background: '#0f172a' }}
          >
            {/* Document Header Bar */}
            <div
              className="edit-certificate-modal-i71" style={{ background: '#1e293b', color: '#fff' }}
            >
              <div className="edit-certificate-modal-i13" style={{ minWidth: 0 }}>
                <Icon iconName="PDF" className="edit-certificate-modal-i72" />
                <span
                  title={docFilename}
                  className="edit-certificate-modal-i73"
                >
                  {docFilename}
                </span>
                {isReplacing && (
                  <span
                    className="edit-certificate-modal-i74" style={{ background: '#0284c7', color: '#fff' }}
                  >
                    New Upload
                  </span>
                )}
              </div>

              {/* Action: Open in SharePoint Online */}
              {certificate.sharepoint_file_url && (
                <a
                  href={certificate.sharepoint_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="edit-certificate-modal-i75" style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)' }}
                  title="Open in SharePoint Online"
                >
                  <Icon iconName="OpenInNewWindow" className="edit-certificate-modal-i45" />
                  <span>SharePoint</span>
                </a>
              )}
            </div>

            {/* Document Viewer Content */}
            <div
              className="edit-certificate-modal-i76" style={{ background: '#0f172a' }}
            >
              {docLoading ? (
                <div className="edit-certificate-modal-i77" style={{ color: '#94a3b8' }}>
                  <Icon iconName="Sync" className="edit-certificate-modal-i78" />
                  <span className="edit-certificate-modal-i79">Loading certificate report...</span>
                </div>
              ) : activeDocUrl ? (
                isPdf ? (
                  <iframe
                    src={`${activeDocUrl}#toolbar=1&navpanes=0`}
                    title={docFilename}
                    className="edit-certificate-modal-i80" style={{ width: '100%', background: '#525659' }}
                  />
                ) : (
                  <div className="edit-certificate-modal-i81" style={{ width: '100%' }}>
                    <img
                      src={activeDocUrl}
                      alt={docFilename}
                      className="edit-certificate-modal-i82" style={{ maxWidth: '100%' }}
                    />
                  </div>
                )
              ) : docError ? (
                <div className="edit-certificate-modal-i83" style={{ color: '#94a3b8' }}>
                  <Icon iconName="Warning" className="edit-certificate-modal-i84" />
                  <div className="edit-certificate-modal-i85">In-App Preview Unavailable</div>
                  <p className="edit-certificate-modal-i86">{docError}</p>
                  {certificate.sharepoint_file_url && (
                    <a
                      href={certificate.sharepoint_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        ...dmsBtn('primary'),
                        padding: '6px 14px',
                        fontSize: 12,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon iconName="OpenInNewWindow" className="edit-certificate-modal-i45" />
                      <span>Open in SharePoint Online</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="edit-certificate-modal-i87" style={{ color: '#94a3b8' }}>
                  <Icon iconName="DocumentSearch" className="edit-certificate-modal-i88" style={{ color: '#64748b' }} />
                  <div className="edit-certificate-modal-i89">No Document Attached</div>
                  <p className="edit-certificate-modal-i86" style={{ color: '#64748b' }}>
                    There is currently no document uploaded for this certificate. Click "Edit Certificate" to upload the certificate PDF.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
