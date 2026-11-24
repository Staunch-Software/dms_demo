import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY } from '../dmsDesignSystem';
import { CertificateApprovalSentModal, ApprovalRoutingInfo } from './CertificateApprovalSentModal';

export interface RenewCertificateModalProps {
  host: VesselEmail;
  certificate: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface MismatchItem {
  id: string;
  kind: 'type' | 'vessel' | 'outdated' | 'unrecognized';
  severity: 'danger' | 'warning';
  title: string;
  expected?: string;
  detected?: string;
  explanation: string;
}

export const calcExpiry = (
  issDate: string,
  years: number | null | undefined,
  months?: number | null | undefined
): string => {
  if (!issDate || (!years && !months)) return '';
  try {
    const parts = issDate.split('-');
    if (parts.length === 3) {
      const issY = parseInt(parts[0], 10);
      const issM = parseInt(parts[1], 10);
      const issD = parseInt(parts[2], 10);
      if (isNaN(issY) || isNaN(issM) || isNaN(issD)) return '';

      const addY = Number(years || 0);
      const addM = Number(months || 0);

      const totalMonths = (issY * 12) + (issM - 1) + (addY * 12) + addM;
      const targetY = Math.floor(totalMonths / 12);
      const targetM = (totalMonths % 12) + 1; // 1..12

      // Days in target month
      const daysInTargetMonth = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
      const targetD = Math.min(issD, daysInTargetMonth);

      // Statutory expiry is minus 1 day from the anniversary date
      // e.g. 15-Mar-2025 + 5y -> 14-Mar-2030
      const anniversaryDt = new Date(Date.UTC(targetY, targetM - 1, targetD));
      anniversaryDt.setUTCDate(anniversaryDt.getUTCDate() - 1);

      return anniversaryDt.toISOString().slice(0, 10);
    }
  } catch { /* ignore */ }
  return '';
};

const fmtDisplayDate = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function RenewCertificateModal({
  host,
  certificate,
  isOpen,
  onClose,
  onSuccess,
}: RenewCertificateModalProps): React.ReactElement | null {
  const [newCertificateNumber, setNewCertificateNumber] = React.useState<string>('');
  const [issueDate, setIssueDate] = React.useState<string>('');
  const [expiryDate, setExpiryDate] = React.useState<string>('');
  const [hasNoExpiry, setHasNoExpiry] = React.useState<boolean>(false);
  const [file, setFile] = React.useState<File | null>(null);

  const [busy, setBusy] = React.useState<boolean>(false);
  const [extracting, setExtracting] = React.useState<boolean>(false);
  const [extractedSummary, setExtractedSummary] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Advanced Document Verification States
  const [mismatches, setMismatches] = React.useState<MismatchItem[]>([]);
  const [overrideConfirmed, setOverrideConfirmed] = React.useState<boolean>(false);
  const [verificationSuccess, setVerificationSuccess] = React.useState<string | null>(null);
  const [autoCalculatedExpiry, setAutoCalculatedExpiry] = React.useState<boolean>(false);
  const [manualEntryMode, setManualEntryMode] = React.useState<boolean>(false);
  const [approvalSentInfo, setApprovalSentInfo] = React.useState<ApprovalRoutingInfo | null>(null);

  // Cached Master validity
  const validityYears = certificate?.default_validity_years ?? null;
  const validityMonths = certificate?.default_validity_months ?? null;

  // Auto-extract metadata & verify against target certificate
  const handleFileSelected = async (selectedFile: File): Promise<void> => {
    setFile(selectedFile);
    setExtractedSummary(null);
    setError(null);
    setMismatches([]);
    setVerificationSuccess(null);
    setOverrideConfirmed(false);
    setAutoCalculatedExpiry(false);

    if (!selectedFile) return;

    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      // NOTE: We do not pass vessel_id to ensure unbiased extraction of the true vessel from text/filename

      const res = await fetch(`${host._base()}/api/certificates/extract-metadata`, {
        method: 'POST',
        headers: {
          'x-session-id': (host.state as any).sessionId || '',
          'x-user-email': host.props.userEmail || '',
        },
        body: fd,
      });

      if (!res.ok) {
        console.warn('Renew certificate extraction failed:', res.status);
        setError(`Document analysis returned HTTP ${res.status}. Please check file format.`);
        return;
      }

      const data = await res.json();
      if (!data || !data.success) {
        setMismatches([
          {
            id: 'unrecognized',
            kind: 'unrecognized',
            severity: 'danger',
            title: 'Unrecognized Document',
            expected: certificate?.certificate_name || 'Statutory Certificate',
            detected: selectedFile.name,
            explanation: 'The uploaded file does not appear to contain readable statutory certificate metadata.',
          },
        ]);
        return;
      }

      const detectedIssues: MismatchItem[] = [];

      // -------------------------------------------------------------
      // 1. Certificate Type Cross-Checking
      // -------------------------------------------------------------
      const targetMasterId = certificate?.certificate_master_id;
      const targetCertName = certificate?.certificate_name || 'Statutory Certificate';

      if (data.certificate_master_id) {
        if (targetMasterId && Number(data.certificate_master_id) !== Number(targetMasterId)) {
          detectedIssues.push({
            id: 'type_mismatch',
            kind: 'type',
            severity: 'danger',
            title: 'Certificate Type Mismatch',
            expected: targetCertName,
            detected: data.certificate_name || `Type #${data.certificate_master_id}`,
            explanation: `Uploaded file was identified as '${data.certificate_name}', but you are renewing '${targetCertName}'. Uploading an unrelated certificate will compromise statutory compliance records.`,
          });
        }
      } else if (data.detected_certificate_title) {
        const cleanTarget = targetCertName.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        const cleanDet = data.detected_certificate_title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        const targetWords = cleanTarget.split(/\s+/).filter((w: string) => w.length > 3);
        const hasKeywordMatch = targetWords.some((w: string) => cleanDet.includes(w));

        if (!hasKeywordMatch) {
          detectedIssues.push({
            id: 'type_title_mismatch',
            kind: 'type',
            severity: 'danger',
            title: 'Unmatched Certificate Title',
            expected: targetCertName,
            detected: data.detected_certificate_title,
            explanation: `Uploaded document title appears to be '${data.detected_certificate_title}', which does not match '${targetCertName}'.`,
          });
        }
      } else if (!data.issue_date && !data.certificate_number) {
        detectedIssues.push({
          id: 'unrecognized_doc',
          kind: 'unrecognized',
          severity: 'danger',
          title: 'Unrecognized File Content',
          expected: targetCertName,
          detected: selectedFile.name,
          explanation: 'The uploaded file does not appear to be an official maritime statutory certificate.',
        });
      }

      // -------------------------------------------------------------
      // 2. Vessel Cross-Checking
      // -------------------------------------------------------------
      const targetVesselId = certificate?.vessel_id;
      const targetVesselName = certificate?.vessel_name || '';

      if (data.vessel_id && targetVesselId && Number(data.vessel_id) !== Number(targetVesselId)) {
        detectedIssues.push({
          id: 'vessel_mismatch',
          kind: 'vessel',
          severity: 'danger',
          title: 'Vessel Mismatch',
          expected: `${targetVesselName}${certificate?.vessel_imo ? ` (IMO ${certificate.vessel_imo})` : ''}`,
          detected: data.vessel_name || `Vessel #${data.vessel_id}`,
          explanation: `Uploaded document belongs to vessel '${data.vessel_name}', not '${targetVesselName}'. Statutory renewals must belong to the same vessel.`,
        });
      } else if (data.detected_vessel_name && targetVesselName) {
        const dV = data.detected_vessel_name.toLowerCase().trim();
        const tV = targetVesselName.toLowerCase().trim();
        if (dV.length >= 2 && !dV.includes(tV) && !tV.includes(dV)) {
          detectedIssues.push({
            id: 'vessel_name_diff',
            kind: 'vessel',
            severity: 'danger',
            title: 'Vessel Mismatch',
            expected: targetVesselName,
            detected: data.detected_vessel_name,
            explanation: `Document text mentions vessel '${data.detected_vessel_name}', which differs from target vessel '${targetVesselName}'. Renewals must belong to the same vessel.`,
          });
        }
      }

      // -------------------------------------------------------------
      // 3. Chronological Issue Date Verification
      // -------------------------------------------------------------
      if (data.issue_date && certificate?.issue_date) {
        const prevIssue = certificate.issue_date.slice(0, 10);
        if (data.issue_date < prevIssue) {
          detectedIssues.push({
            id: 'outdated_issue_date',
            kind: 'outdated',
            severity: 'warning',
            title: 'Older Survey / Issue Date Detected',
            expected: `Dated on or after ${fmtDisplayDate(prevIssue)}`,
            detected: fmtDisplayDate(data.issue_date),
            explanation: `The detected survey issue date (${data.issue_date}) is earlier than the active certificate on record (${prevIssue}). A renewal survey must produce a certificate dated on or after the previous one.`,
          });
        }
      }

      setMismatches(detectedIssues);

      const hasAnyMismatch = detectedIssues.length > 0;

      // If any mismatch exists, DO NOT populate dates from wrong document!
      if (hasAnyMismatch) {
        setExtractedSummary(null);
        setVerificationSuccess(null);
        return;
      }

      // -------------------------------------------------------------
      // 4. Populate Extracted / Verified Dates & Serial
      // -------------------------------------------------------------
      const summaryParts: string[] = [];

      if (data.certificate_number) {
        setNewCertificateNumber(data.certificate_number);
        summaryParts.push(`Cert No: ${data.certificate_number}`);
      }

      if (data.issue_date) {
        setIssueDate(data.issue_date);
        summaryParts.push(`Issue: ${fmtDisplayDate(data.issue_date)}`);
      }

      if (data.has_no_expiry) {
        setHasNoExpiry(true);
        setExpiryDate('');
        summaryParts.push('Permanent Validity');
      } else if (data.expiry_date) {
        setExpiryDate(data.expiry_date);
        setHasNoExpiry(false);
        setAutoCalculatedExpiry(false);
        summaryParts.push(`Expiry: ${fmtDisplayDate(data.expiry_date)}`);
      } else if (data.issue_date && (validityYears || validityMonths)) {
        const autoExp = calcExpiry(data.issue_date, validityYears, validityMonths);
        if (autoExp) {
          setExpiryDate(autoExp);
          setHasNoExpiry(false);
          setAutoCalculatedExpiry(true);
          summaryParts.push(`Expiry: ${fmtDisplayDate(autoExp)} (Auto-Calculated)`);
        }
      }

      if (summaryParts.length > 0) {
        setExtractedSummary(summaryParts.join(' • '));
      }

      setVerificationSuccess(
        `Document verified: Matches ${targetCertName} for ${targetVesselName}.`
      );
    } catch (err: any) {
      console.warn('Renewal document extraction error:', err);
      setError(err?.message || 'Failed to analyze renewal document.');
    } finally {
      setExtracting(false);
    }
  };

  const resetForm = (): void => {
    setFile(null);
    setExtracting(false);
    setExtractedSummary(null);
    setError(null);
    setMismatches([]);
    setOverrideConfirmed(false);
    setVerificationSuccess(null);
    setAutoCalculatedExpiry(false);
    setManualEntryMode(false);

    if (certificate) {
      setNewCertificateNumber('');
      const todayIso = new Date().toISOString().split('T')[0];
      setIssueDate(todayIso);

      const isPerm = !!certificate.has_no_expiry;
      setHasNoExpiry(isPerm);

      if (isPerm) {
        setExpiryDate('');
      } else {
        const y = certificate.default_validity_years;
        const m = certificate.default_validity_months;
        const autoExp = (y || m) ? calcExpiry(todayIso, y, m) : '';
        setExpiryDate(autoExp);
        setAutoCalculatedExpiry(!!autoExp);
      }

    }

    const fileInput = document.getElementById('renew-file-input') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleClose = (): void => {
    setApprovalSentInfo(null);
    resetForm();
    onClose();
  };

  // Pre-fill fields from current certificate & reset extraction on open/close
  React.useEffect(() => {
    if (!certificate || !isOpen) {
      resetForm();
      return;
    }
    resetForm();
  }, [certificate, isOpen]);

  // Handle manual Issue Date change -> auto calculate Expiry Date if not continuous
  const handleIssueDateChange = (newIssDate: string): void => {
    setIssueDate(newIssDate);
    if (!hasNoExpiry && newIssDate && (validityYears || validityMonths)) {
      const calculated = calcExpiry(newIssDate, validityYears, validityMonths);
      if (calculated) {
        setExpiryDate(calculated);
        setAutoCalculatedExpiry(true);
      }
    }
  };

  const hasAnyMismatch = mismatches.length > 0;
  const hasCriticalDanger = hasAnyMismatch;
  const isBlockedByMismatch = hasAnyMismatch && !overrideConfirmed;

  // Show the date change fields ONLY when document is verified, override confirmed, or manual entry mode
  const showDateDetails = manualEntryMode || (file !== null && !hasAnyMismatch) || overrideConfirmed;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!certificate) return;

    if (isBlockedByMismatch) {
      setError('Please resolve the document mismatch or check the manual override box to proceed.');
      return;
    }

    if (!issueDate) {
      setError('New survey / issue date is required.');
      return;
    }
    if (!hasNoExpiry && !expiryDate) {
      setError('New expiry date is required unless permanent validity is selected.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const authorityValue = (certificate.issuing_authority || 'Classification Society').trim();
      const formData = new FormData();
      formData.append('issuing_authority', authorityValue);
      formData.append('issue_date', issueDate);
      if (newCertificateNumber.trim()) {
        formData.append('certificate_number', newCertificateNumber.trim());
      }
      if (!hasNoExpiry && expiryDate) {
        formData.append('expiry_date', expiryDate);
      }
      formData.append('has_no_expiry', String(hasNoExpiry));
      formData.append('notes', 'Scheduled statutory renewal survey.');
      formData.append('renewal_notes', 'Scheduled statutory renewal survey.');
      formData.append('override_confirmed', String(overrideConfirmed));
      if (file) {
        formData.append('file', file);
      }

      const res = await fetch(`${host._base()}/api/certificates/${certificate.id}/renew`, {
        method: 'POST',
        headers: {
          'x-session-id': (host.state as any).sessionId || '',
          'x-user-email': host.props.userEmail || '',
        },
        body: formData,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Failed to renew certificate (HTTP ${res.status})`);
      }

      const saved = await res.json().catch(() => null);
      onSuccess();
      if (saved?.approval_routing?.email_automation_enabled) {
        setApprovalSentInfo(saved.approval_routing);
        return;
      }
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Error renewing certificate');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || !certificate) return null;

  const validityLabel = certificate.has_no_expiry
    ? 'Permanent'
    : validityYears
    ? `${validityYears} Year${validityYears > 1 ? 's' : ''}${validityMonths ? ` ${validityMonths} Mo` : ''}`
    : validityMonths
    ? `${validityMonths} Months`
    : 'Standard';

  return ReactDOM.createPortal(
    <div
      onClick={e => {
        if (e.target === e.currentTarget && !busy) {
          handleClose();
        }
      }}
      className="renew-certificate-modal-i1" style={{ position: 'fixed', zIndex: 100005, background: 'rgba(5, 15, 25, 0.65)' }}
    >
      <div
        className="renew-certificate-modal-i2" style={{ width: '100%', background: 'var(--vdms-surface)' }}
      >
        {/* Header */}
        <div
          className="renew-certificate-modal-i3"
        >
          <div>
            <div className="renew-certificate-modal-i4">
              <span
                className="renew-certificate-modal-i5" style={{ width: 28, background: clay.accentSoft, color: clay.accent }}
              >
                <Icon iconName="RenewalCurrent" className="renew-certificate-modal-i6" />
              </span>
              <h3
                className="renew-certificate-modal-i7" style={{ fontFamily: DMS_FONT_DISPLAY }}
              >
                Renew Statutory Certificate
              </h3>
            </div>
            <div className="renew-certificate-modal-i8">
              Archives the existing certificate into immutable audit history and updates the active vessel record.
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="renew-certificate-modal-i9"
          >
            <Icon iconName="Cancel" />
          </button>
        </div>

        {/* Target Certificate Context Banner - Perfectly Aligned Single Row */}
        <div
          className="renew-certificate-modal-i10"
        >
          <div className="renew-certificate-modal-i11" style={{ minWidth: 0 }}>
            {/* Top row: Category Badge + Certificate Name */}
            <div className="renew-certificate-modal-i12">
              <span
                className="renew-certificate-modal-i13" style={{ borderRadius: 6, background: clay.accentSoft, color: clay.accent }}
              >
                {certificate.category || 'Statutory'}
              </span>
              <span
                title={certificate.certificate_name}
                className="renew-certificate-modal-i14"
              >
                {certificate.certificate_name}
              </span>
            </div>

            {/* Subline: Target Vessel + Current Serial + Issuing Authority */}
            <div
              className="renew-certificate-modal-i15"
            >
              <span>Vessel: <strong className="renew-certificate-modal-i16">{certificate.vessel_name}</strong>{certificate.vessel_imo ? ` (${certificate.vessel_imo})` : ''}</span>
              <span>•</span>
              <span>Current Serial: <strong className="renew-certificate-modal-i16">{certificate.certificate_number || 'N/A'}</strong></span>
              {certificate.issuing_authority && (
                <>
                  <span>•</span>
                  <span>Class: <strong className="renew-certificate-modal-i16">{certificate.issuing_authority}</strong></span>
                </>
              )}
            </div>
          </div>

          {/* Right side: Validity badge on the SAME ROW */}
          <div
            className="renew-certificate-modal-i17" style={{ borderRadius: 8, background: 'var(--vdms-surface)' }}
          >
            <div className="renew-certificate-modal-i18">
              Validity Term
            </div>
            <div className="renew-certificate-modal-i19" style={{ color: clay.accent }}>
              {validityLabel}
            </div>
          </div>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="renew-certificate-modal-i20">
          {error && (
            <div
              className="renew-certificate-modal-i21" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}
            >
              <Icon iconName="ErrorBadge" />
              <span>{error}</span>
            </div>
          )}

          {/* Upload Renewal Document with Smart Type & Vessel Verification */}
          <div>
            <div className="renew-certificate-modal-i22">
              <label className="renew-certificate-modal-i23">
                Upload Renewal Certificate (Smart Document Verification)
              </label>
              <span className="renew-certificate-modal-i24" style={{ color: clay.accent }}>
                PDF / Scan / Image
              </span>
            </div>
            <div
              className="renew-certificate-modal-i25" style={{ border: `2px dashed ${
                  hasCriticalDanger && !overrideConfirmed
                    ? '#ea580c'
                    : file
                    ? clay.accent
                    : 'var(--vdms-line)'
                }`, borderRadius: 10, background: file ? 'var(--vdms-surface-alt)' : 'transparent', cursor: busy || extracting ? 'default' : 'pointer' }}
              onClick={() => {
                if (!busy && !extracting) {
                  document.getElementById('renew-file-input')?.click();
                }
              }}
            >
              <input
                id="renew-file-input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="renew-certificate-modal-i26"
                disabled={busy || extracting}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />
              <Icon
                iconName={
                  extracting
                    ? 'ProgressRingDots'
                    : hasCriticalDanger
                    ? 'Warning'
                    : file
                    ? 'PageCheckedin'
                    : 'CloudUpload'
                }
                className="renew-certificate-modal-i27" style={{ color: hasCriticalDanger ? '#ea580c' : file ? clay.accent : 'var(--vdms-text-muted)' }}
              />
              {extracting ? (
                <div>
                  <div className="renew-certificate-modal-i28" style={{ color: clay.accent }}>
                    Verifying certificate type & vessel cross-check...
                  </div>
                  <div className="renew-certificate-modal-i29">
                    Matching against {certificate.certificate_name} for vessel {certificate.vessel_name}
                  </div>
                </div>
              ) : file ? (
                <div>
                  <div className="renew-certificate-modal-i30">{file.name}</div>
                  <div className="renew-certificate-modal-i29">
                    {(file.size / 1024).toFixed(1)} KB — Click to change file
                  </div>
                </div>
              ) : (
                <div>
                  <div className="renew-certificate-modal-i31">
                    Drop renewed certificate PDF here or click to browse
                  </div>
                  <div className="renew-certificate-modal-i29">
                    Automatically verifies certificate type, cross-checks vessel, and extracts renewal dates
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mismatch Alert Box - Shown when uploaded document has wrong certificate type or vessel */}
          {mismatches.length > 0 && !extracting && (
            <div
              className="renew-certificate-modal-i32" style={{ borderRadius: 10, border: hasCriticalDanger ? '1px solid #f97316' : '1px solid #f59e0b', background: hasCriticalDanger ? 'rgba(234, 88, 12, 0.08)' : 'rgba(245, 158, 11, 0.08)' }}
            >
              <div className="renew-certificate-modal-i33">
                <Icon
                  iconName="Warning"
                  className="renew-certificate-modal-i34" style={{ color: hasCriticalDanger ? '#ea580c' : '#d97706' }}
                />
                <div className="renew-certificate-modal-i11">
                  <div
                    className="renew-certificate-modal-i35" style={{ color: hasCriticalDanger ? '#c2410c' : '#b45309' }}
                  >
                    Certificate Document Mismatch Alert
                  </div>
                  <div className="renew-certificate-modal-i36">
                    The uploaded document does not match the certificate type or vessel required for this renewal:
                  </div>

                  <div className="renew-certificate-modal-i37">
                    {mismatches.map(m => (
                      <div
                        key={m.id}
                        className="renew-certificate-modal-i38" style={{ background: 'rgba(255, 255, 255, 0.75)', borderRadius: 6 }}
                      >
                        <div className="renew-certificate-modal-i39" style={{ color: m.severity === 'danger' ? '#c2410c' : '#b45309' }}>
                          {m.title}
                        </div>
                        <div className="renew-certificate-modal-i40">
                          {m.explanation}
                        </div>
                        {(m.expected || m.detected) && (
                          <div className="renew-certificate-modal-i41">
                            {m.expected && <span>Expected: <strong>{m.expected}</strong></span>}
                            {m.detected && <span>Detected: <strong style={{ color: m.severity === 'danger' ? '#c2410c' : 'inherit' }}>{m.detected}</strong></span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions for Mismatch: Change File or Manual Override */}
                  <div className="renew-certificate-modal-i42">
                    <button
                      type="button"
                      onClick={() => document.getElementById('renew-file-input')?.click()}
                      style={{
                        ...dmsBtn('secondary'),
                        height: 28,
                        fontSize: 11.5,
                        padding: '0 12px',
                      }}
                    >
                      <Icon iconName="CloudUpload" className="renew-certificate-modal-i43" /> Upload Different Certificate PDF
                    </button>

                    <label
                      className="renew-certificate-modal-i44"
                    >
                      <input
                        type="checkbox"
                        checked={overrideConfirmed}
                        onChange={e => setOverrideConfirmed(e.target.checked)}
                        className="renew-certificate-modal-i45"
                      />
                      <span>Confirm override to enter dates manually</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Verified Match Success Banner */}
          {verificationSuccess && mismatches.length === 0 && !extracting && (
            <div
              className="renew-certificate-modal-i46" style={{ background: 'rgba(16, 124, 65, 0.08)', borderRadius: 8, color: '#107c41' }}
            >
              <div className="renew-certificate-modal-i47">
                <Icon iconName="CompletedSolid" className="renew-certificate-modal-i6" />
                <span>
                  <strong>Document Verified:</strong> Matches {certificate.certificate_name} for {certificate.vessel_name}.
                </span>
              </div>
              <span className="renew-certificate-modal-i48" style={{ opacity: 0.85 }}>
                Review survey dates below
              </span>
            </div>
          )}

          {/* Link to enter manually if no document is uploaded yet */}
          {!file && !manualEntryMode && (
            <div className="renew-certificate-modal-i49">
              <button
                type="button"
                onClick={() => setManualEntryMode(true)}
                className="renew-certificate-modal-i50" style={{ color: clay.accent }}
              >
                Don't have a renewal document scan? Enter dates manually
              </button>
            </div>
          )}

          {/* Revealed Date Change Fields - ONLY shown after upload is verified, overridden, or manual mode */}
          {showDateDetails && (
            <div className="renew-certificate-modal-i51">
              {/* New Certificate Serial No. */}
              <div>
                <label className="renew-certificate-modal-i52">
                  New Certificate Serial No.
                </label>
                <input
                  type="text"
                  placeholder={certificate.certificate_number ? `e.g. ${certificate.certificate_number}-R` : 'Serial / Registration number from new certificate...'}
                  value={newCertificateNumber}
                  onChange={e => setNewCertificateNumber(e.target.value)}
                  disabled={busy}
                  style={{ ...dmsControlStyle(), width: '100%', height: 36, boxSizing: 'border-box' }}
                />
                <div className="renew-certificate-modal-i53">
                  Statutory renewals receive a new unique serial number upon completion of the renewal survey.
                </div>
              </div>

              {/* Issue Date & Expiry Date */}
              <div className="renew-certificate-modal-i54">
                <div>
                  <label className="renew-certificate-modal-i52">
                    New Survey / Issue Date *
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => handleIssueDateChange(e.target.value)}
                    disabled={busy}
                    style={{ ...dmsControlStyle(), width: '100%', height: 36, boxSizing: 'border-box' }}
                  />
                  <div className="renew-certificate-modal-i53">
                    Completion date of renewal survey.
                  </div>
                </div>

                <div>
                  <div className="renew-certificate-modal-i22">
                    <label className="renew-certificate-modal-i23">
                      New Expiry Date {!hasNoExpiry && '*'}
                    </label>
                    {autoCalculatedExpiry && !hasNoExpiry && (
                      <span className="renew-certificate-modal-i55">
                        Auto-Calculated
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => {
                      setExpiryDate(e.target.value);
                      setAutoCalculatedExpiry(false);
                    }}
                    disabled={busy || hasNoExpiry}
                    style={{
                      ...dmsControlStyle(),
                      width: '100%',
                      height: 36,
                      boxSizing: 'border-box',
                      opacity: hasNoExpiry ? 0.4 : 1,
                    }}
                  />
                  <div className="renew-certificate-modal-i53">
                    {hasNoExpiry
                      ? 'Permanent certificate; no expiry date required.'
                      : autoCalculatedExpiry
                      ? `Calculated from validity term (${validityLabel}) minus 1 day anniversary.`
                      : 'Enter or confirm official expiry date.'}
                  </div>
                </div>
              </div>

              {/* No Expiry Toggle */}
              <label className="renew-certificate-modal-i56">
                <input
                  type="checkbox"
                  checked={hasNoExpiry}
                  onChange={e => {
                    const checked = e.target.checked;
                    setHasNoExpiry(checked);
                    if (checked) {
                      setExpiryDate('');
                      setAutoCalculatedExpiry(false);
                    } else if (issueDate && (validityYears || validityMonths)) {
                      const autoExp = calcExpiry(issueDate, validityYears, validityMonths);
                      if (autoExp) {
                        setExpiryDate(autoExp);
                        setAutoCalculatedExpiry(true);
                      }
                    }
                  }}
                  disabled={busy}
                  className="renew-certificate-modal-i57" style={{ width: 16, accentColor: clay.accent }}
                />
                Permanent Validity (No Expiry Date)
              </label>


            </div>
          )}

          {/* Footer Actions */}
          <div
            className="renew-certificate-modal-i58"
          >
            <div className="renew-certificate-modal-i59" style={{ color: isBlockedByMismatch ? '#ea580c' : 'var(--vdms-text-muted)' }}>
              {isBlockedByMismatch ? (
                <span className="renew-certificate-modal-i60">
                  <Icon iconName="Warning" /> Resolve document mismatch or check override to proceed
                </span>
              ) : showDateDetails ? (
                'Review new validity dates and click Renew Certificate to complete audit archive.'
              ) : (
                'Upload renewal certificate above to begin verification.'
              )}
            </div>

            <div className="renew-certificate-modal-i61">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                style={{ ...dmsBtn('secondary'), height: 36, padding: '0 18px' }}
              >
                Cancel
              </button>
              {showDateDetails && (
                <button
                  type="submit"
                  disabled={busy || isBlockedByMismatch}
                  style={{
                    ...dmsBtn('primary', !busy && !isBlockedByMismatch),
                    height: 36,
                    padding: '0 22px',
                    opacity: busy || isBlockedByMismatch ? 0.5 : 1,
                    cursor: busy || isBlockedByMismatch ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Icon iconName="RenewalCurrent" className="renew-certificate-modal-i62" />
                  {busy ? 'Processing Renewal...' : 'Renew Certificate'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
      <CertificateApprovalSentModal
        isOpen={Boolean(approvalSentInfo)}
        routingInfo={approvalSentInfo}
        onClose={() => {
          setApprovalSentInfo(null);
          handleClose();
        }}
      />
    </div>,
    document.body
  );
}
