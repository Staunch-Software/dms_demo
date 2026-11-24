import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { DmsSelect } from '../DmsSelect';
import { dmsBtn, dmsControlStyle, DMS_FONT_DISPLAY } from '../dmsDesignSystem';
import { SearchableSelect, SearchableSelectOption } from '../SearchableSelect';
import { isMobileWidth } from '../responsive';
import { CreateCertificateTypeModal } from './CreateCertificateTypeModal';
import { CertificateApprovalSentModal, ApprovalRoutingInfo, BulkApprovalSummaryInfo } from './CertificateApprovalSentModal';

export interface AddCertificateModalProps {
  host: VesselEmail;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultVesselId?: string | number;
  /** Certificate type to preselect, e.g. when adding a missing one from the vessel checklist. */
  defaultMasterId?: number;
}

type DuplicateMatch = 'exact_duplicate' | 'renewal' | 'older_version' | 'none';
type DuplicateChoice = '' | 'renew' | 'replace' | 'separate';
interface DuplicateCheck {
  match_type: DuplicateMatch;
  matched_on?: 'certificate_number' | 'certificate_type' | 'filename';
  existing_certificate: {
    id: number;
    certificate_number: string | null;
    issuing_authority: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    has_no_expiry: boolean;
    filename: string | null;
  } | null;
}

interface ExtractedItem {
  label: string;
  value: string;
  isWarning?: boolean;
}

// A certificate type is Permanent only when the backend says so (has_no_expiry). A type with no
// period and has_no_expiry=false takes its expiry date from the uploaded document.
const masterHasPeriod = (m: any): boolean => !!(m && (m.default_validity_years || m.default_validity_months));
const masterPeriodLabel = (m: any): string => {
  if (!m) return '';
  if (m.has_no_expiry) return 'Permanent';
  const y = Number(m.default_validity_years) || 0;
  const mo = Number(m.default_validity_months) || 0;
  const parts: string[] = [];
  if (y) parts.push(`${y} Year${y === 1 ? '' : 's'}`);
  if (mo) parts.push(`${mo} Month${mo === 1 ? '' : 's'}`);
  return parts.join(' ');
};

const fmtDate = (iso: string | null | undefined, never?: boolean): string => {
  if (never) return 'Permanent';
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calcExpiry = (
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

      // Days in target month (e.g. 28 in Feb 2026)
      const daysInTargetMonth = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
      const targetD = Math.min(issD, daysInTargetMonth);

      // Statutory expiry is minus 1 day from the anniversary date
      // e.g. 15-Mar-2025 + 5y -> 14-Mar-2030
      // e.g. 31-Aug-2025 + 6m -> 27-Feb-2026 (or 28-Feb-2026)
      const anniversaryDt = new Date(Date.UTC(targetY, targetM - 1, targetD));
      anniversaryDt.setUTCDate(anniversaryDt.getUTCDate() - 1);

      return anniversaryDt.toISOString().slice(0, 10);
    }
  } catch { /* ignore */ }
  return '';
};

export interface BulkCertificateItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  vesselId: string | number | '';
  vesselName: string;
  masterId: number | '';
  masterName: string;
  certificateNumber: string;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  hasNoExpiry: boolean;
  status: 'pending' | 'scanning' | 'ready' | 'error' | 'saved' | 'save_error';
  errorMessage?: string;
  suggestedTypeName?: string;
  unmatchedCertNotice?: string;
  detectedVesselName?: string;
  vesselUnconfirmed?: boolean;
  extractedFindings?: ExtractedItem[];
  undetectedFields?: string[];
  duplicateCheck?: DuplicateCheck | null;
  dupChoice?: DuplicateChoice;
}

export function AddCertificateModal({
  host,
  isOpen,
  onClose,
  onSuccess,
  defaultVesselId,
  defaultMasterId,
}: AddCertificateModalProps): React.ReactElement | null {
  const [vessels, setVessels] = React.useState<any[]>([]);
  const [masters, setMasters] = React.useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = React.useState<boolean>(true);

  const [vesselId, setVesselId] = React.useState<string | number | ''>(defaultVesselId || '');
  const [masterId, setMasterId] = React.useState<number | ''>('');
  const [certificateNumber, setCertificateNumber] = React.useState<string>('');
  const [issuingAuthority, setIssuingAuthority] = React.useState<string>('');
  const [issueDate, setIssueDate] = React.useState<string>('');
  const [expiryDate, setExpiryDate] = React.useState<string>('');
  const [hasNoExpiry, setHasNoExpiry] = React.useState<boolean>(false);
  const [responsiblePerson, setResponsiblePerson] = React.useState<string>('');
  const [file, setFile] = React.useState<File | null>(null);

  const [busy, setBusy] = React.useState<boolean>(false);
  const [extracting, setExtracting] = React.useState<boolean>(false);
  const [extractedSummary, setExtractedSummary] = React.useState<string | null>(null);
  const [extractedItems, setExtractedItems] = React.useState<ExtractedItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [unmatchedCertNotice, setUnmatchedCertNotice] = React.useState<string | null>(null);
  const [suggestedTypeName, setSuggestedTypeName] = React.useState<string>('');
  // Set when the certificate was saved but its file could not be uploaded to SharePoint.
  const [uploadWarning, setUploadWarning] = React.useState<string | null>(null);
  const [showCreateTypeModal, setShowCreateTypeModal] = React.useState<boolean>(false);
  const [approvalSentInfo, setApprovalSentInfo] = React.useState<ApprovalRoutingInfo | null>(null);
  const [bulkApprovalSummary, setBulkApprovalSummary] = React.useState<BulkApprovalSummaryInfo | null>(null);
  const [manualMode, setManualMode] = React.useState<boolean>(false);
  const [duplicate, setDuplicate] = React.useState<DuplicateCheck | null>(null);
  const [dupChoice, setDupChoice] = React.useState<DuplicateChoice>('');
  const [singleExtractedFindings, setSingleExtractedFindings] = React.useState<ExtractedItem[]>([]);
  const [singleUndetectedFields, setSingleUndetectedFields] = React.useState<string[]>([]);

  // Authenticated headers helper without Content-Type (safe for multipart/form-data)
  const getFormDataHeaders = React.useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (typeof host._headers === 'function') {
      const base = host._headers();
      for (const [k, v] of Object.entries(base)) {
        if (k.toLowerCase() !== 'content-type' && v) {
          h[k] = v;
        }
      }
    }
    if (!h['X-Session-ID'] && !h['Authorization']) {
      const sid = (host.state as any)?.customSessionId || (host.state as any)?.sessionId || host.props?.sessionId;
      if (sid) {
        h['Authorization'] = `Bearer ${sid}`;
        h['X-Session-ID'] = sid;
      }
    }
    if (!h['X-User-Email']) {
      const email = (host.state as any)?.customUserEmail || host.props?.userEmail;
      if (email) h['X-User-Email'] = email;
    }
    return h;
  }, [host]);


  // Bulk Upload Staging & Scanning Queue
  const [isBulkMode, setIsBulkMode] = React.useState<boolean>(false);
  const [bulkItems, setBulkItems] = React.useState<BulkCertificateItem[]>([]);
  const [bulkScanningIndex, setBulkScanningIndex] = React.useState<number>(0);
  const [bulkScanningTotal, setBulkScanningTotal] = React.useState<number>(0);
  const [bulkScanningCurrentName, setBulkScanningCurrentName] = React.useState<string | null>(null);
  const [applyAllVesselId, setApplyAllVesselId] = React.useState<string | number | ''>('');
  const [bulkSaving, setBulkSaving] = React.useState<boolean>(false);
  const [bulkSaveSummary, setBulkSaveSummary] = React.useState<{ total: number; saved: number; failed: number } | null>(null);
  const [rowTargetForCreateType, setRowTargetForCreateType] = React.useState<string | null>(null);
  const [showDetectionFindings, setShowDetectionFindings] = React.useState<boolean>(false);
  const [expandedFindingRowId, setExpandedFindingRowId] = React.useState<string | null>(null);

  const isProcessingQueueRef = React.useRef<boolean>(false);
  const abortQueueRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    return () => {
      abortQueueRef.current = true;
      isProcessingQueueRef.current = false;
    };
  }, []);

  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024));
  const showFormFields = Boolean(file || extracting || manualMode || defaultMasterId);

  // Auto-extract metadata from uploaded certificate file
  const handleFileSelected = async (selectedFile: File): Promise<void> => {
    setFile(selectedFile);
    setExtractedSummary(null);
    setError(null);

    if (!selectedFile) return;

    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      // Unbiased extraction: allow backend to detect the true vessel from text/filename

      const res = await fetch(`${host._base()}/api/certificates/extract-metadata`, {
        method: 'POST',
        headers: getFormDataHeaders(),
        body: fd,
      });

      if (!res.ok) {
        console.warn('Certificate auto-extraction returned non-200:', res.status);
        return;
      }

      const data = await res.json();
      if (!data || !data.success) return;

      const items: ExtractedItem[] = [];
      const undetected: string[] = [];

      // 1. Auto-set Certificate Type
      let matchedMaster: any = null;
      if (data.certificate_master_id) {
        matchedMaster = masters.find(m => Number(m.id) === Number(data.certificate_master_id));
      }
      if (!matchedMaster && data.certificate_name) {
        const cName = data.certificate_name.toLowerCase().trim();
        matchedMaster = masters.find(m => {
          if (!m.name) return false;
          const mName = m.name.toLowerCase().trim();
          return mName === cName || mName.includes(cName) || cName.includes(mName);
        });
      }
      if (!matchedMaster && selectedFile.name) {
        const fnameLower = selectedFile.name.toLowerCase();
        matchedMaster = masters.find(m => {
          if (!m.name) return false;
          const mName = m.name.toLowerCase().trim();
          return fnameLower.includes(mName);
        });
      }

      if (matchedMaster) {
        setMasterId(Number(matchedMaster.id));
        setUnmatchedCertNotice(null);
        setSuggestedTypeName('');
        items.push({ label: 'Certificate Type', value: matchedMaster.name });
      } else {
        setMasterId('');
        const detectedTitle = data.detected_certificate_title || data.certificate_name || '';
        setSuggestedTypeName(detectedTitle);
        if (detectedTitle) {
          setUnmatchedCertNotice(`"${detectedTitle}" is not present in the database catalog.`);
          items.push({ label: 'Detected Type', value: `${detectedTitle} (catalog match needed)`, isWarning: true });
          undetected.push(`Certificate Type ("${detectedTitle}")`);
        } else {
          setUnmatchedCertNotice('This certificate type is not present in the database catalog.');
          undetected.push('Certificate Type');
        }
      }

      // 2. Auto-set Target Vessel
      const detectedName = (data.detected_vessel_name || data.vessel_name || '').toLowerCase().trim();
      let matchedVessel: any = null;

      // Strategy A: Direct backend vessel ID
      if (data.vessel_id) {
        matchedVessel = vessels.find(v => String(v.id) === String(data.vessel_id));
      }

      // Strategy B: Check IMO if present in raw text preview
      if (!matchedVessel) {
        const imoMatch = (data.raw_text_preview || '').match(/\bIMO\s*(?:No\.?|Number)?[:\s]*(\d{7})\b/i);
        if (imoMatch && imoMatch[1]) {
          const imoStr = imoMatch[1];
          matchedVessel = vessels.find(v => v.imo && String(v.imo).trim() === imoStr);
        }
      }

      // Strategy C: Clean vessel name comparison (stripping MV / M/V / M.V. prefix)
      const classKeywords = ['dnv', 'classnk', 'nk', 'bureau veritas', 'bv', 'lloyd', 'lr', 'abs', 'rina'];
      const isClassOrg = classKeywords.some(k => detectedName === k);

      if (!matchedVessel && detectedName && !isClassOrg) {
        const cleanTarget = detectedName.replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
        matchedVessel = vessels.find(v => {
          if (!v.name) return false;
          const cleanV = v.name.toLowerCase().replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
          return cleanV === cleanTarget || (cleanTarget.length >= 4 && cleanV.includes(cleanTarget)) || (cleanV.length >= 4 && cleanTarget.includes(cleanV));
        });
      }

      // Strategy D: Filename comparison with vessel names (e.g. "Elephanta_COE.pdf" -> Elephanta)
      if (!matchedVessel && selectedFile.name) {
        const cleanFile = selectedFile.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
        matchedVessel = vessels.find(v => {
          if (!v.name) return false;
          const cleanV = v.name.toLowerCase().replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
          return cleanV.length >= 4 && cleanFile.includes(cleanV);
        });
      }

      if (matchedVessel) {
        setVesselId(matchedVessel.id);
        items.unshift({ label: 'Vessel', value: matchedVessel.name });
      } else if (data.detected_vessel_name || data.vessel_name) {
        const rawShip = data.detected_vessel_name || data.vessel_name;
        if (!isClassOrg) {
          items.unshift({ label: 'Detected Vessel', value: `${rawShip} (confirm below)`, isWarning: true });
          undetected.push('Target Vessel confirmation');
        } else {
          undetected.push('Target Vessel');
        }
      } else {
        undetected.push('Target Vessel');
      }

      // 3. Auto-set Issue Date
      if (data.issue_date) {
        setIssueDate(data.issue_date);
        items.push({ label: 'Issue Date', value: data.issue_date });
      } else {
        undetected.push('Issue Date');
      }

      // 4. Auto-set Expiry Date or Permanent
      if (data.has_no_expiry || matchedMaster?.has_no_expiry) {
        setHasNoExpiry(true);
        setExpiryDate('');
        items.push({ label: 'Validity', value: 'Permanent' });
      } else if (data.expiry_date) {
        setExpiryDate(data.expiry_date);
        setHasNoExpiry(false);
        items.push({ label: 'Expiry Date', value: data.expiry_date });
      } else if (data.issue_date && matchedMaster && masterHasPeriod(matchedMaster)) {
        const autoExp = calcExpiry(data.issue_date, matchedMaster.default_validity_years, (matchedMaster as any).default_validity_months);
        if (autoExp) {
          setExpiryDate(autoExp);
          setHasNoExpiry(false);
          items.push({ label: 'Expiry Date', value: `${autoExp} (${masterPeriodLabel(matchedMaster)})` });
        } else {
          undetected.push('Expiry Date');
        }
      } else {
        undetected.push('Expiry Date');
      }

      // 5. Auto-set Certificate Number
      if (data.certificate_number) {
        setCertificateNumber(data.certificate_number);
        items.push({ label: 'Cert No', value: data.certificate_number });
      } else {
        undetected.push('Certificate Number');
      }

      // 6. Auto-set Issuing Authority
      if (data.issuing_authority) {
        setIssuingAuthority(data.issuing_authority);
        items.push({ label: 'Authority', value: data.issuing_authority });
      } else {
        undetected.push('Issuing Authority');
      }

      setSingleExtractedFindings(items);
      setSingleUndetectedFields(undetected);
      setExtractedItems(items);
      if (items.length > 0) {
        setExtractedSummary(items.map(i => `${i.label}: ${i.value}`).join(' • '));
      }
    } catch (err: any) {
      console.warn('Certificate extraction failed:', err);
    } finally {
      setExtracting(false);
    }
  };

  // Sequential queue scanning runner for bulk items
  const runBulkSequentialScan = async (items: BulkCertificateItem[]): Promise<void> => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    abortQueueRef.current = false;

    const pendingList = items.filter(r => r.status === 'pending');
    setBulkScanningTotal(pendingList.length);

    for (let i = 0; i < pendingList.length; i++) {
      if (abortQueueRef.current) break;
      const currentItem = pendingList[i];
      setBulkScanningIndex(i + 1);
      setBulkScanningCurrentName(currentItem.fileName);

      setBulkItems(prev => prev.map(r => r.id === currentItem.id ? { ...r, status: 'scanning' } : r));

      try {
        const fd = new FormData();
        fd.append('file', currentItem.file);
        if (currentItem.vesselId) {
          fd.append('vessel_id', String(currentItem.vesselId));
        }

        const res = await fetch(`${host._base()}/api/certificates/extract-metadata`, {
          method: 'POST',
          headers: getFormDataHeaders(),
          body: fd,
        });

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        if (!data || !data.success) {
          throw new Error('Auto-extraction returned no metadata');
        }

        const findings: ExtractedItem[] = [];
        const undetected: string[] = [];

        // 1. Match certificate master
        let matchedMasterId: number | '' = '';
        let matchedMasterName = '';
        let matchedMasterObj: any = null;
        if (data.certificate_master_id) {
          matchedMasterObj = masters.find(m => Number(m.id) === Number(data.certificate_master_id));
        }
        if (!matchedMasterObj && data.certificate_name) {
          const cName = data.certificate_name.toLowerCase().trim();
          matchedMasterObj = masters.find(m => {
            if (!m.name) return false;
            const mName = m.name.toLowerCase().trim();
            return mName === cName || mName.includes(cName) || cName.includes(mName);
          });
        }
        if (!matchedMasterObj && currentItem.fileName) {
          const fnameLower = currentItem.fileName.toLowerCase();
          matchedMasterObj = masters.find(m => {
            if (!m.name) return false;
            const mName = m.name.toLowerCase().trim();
            return fnameLower.includes(mName);
          });
        }

        const detectedTitle = data.detected_certificate_title || data.certificate_name || '';
        let suggestedTypeName = '';
        let unmatchedNotice = '';

        if (matchedMasterObj) {
          matchedMasterId = Number(matchedMasterObj.id);
          matchedMasterName = matchedMasterObj.name;
          findings.push({ label: 'Certificate Type', value: matchedMasterObj.name });
        } else {
          suggestedTypeName = detectedTitle;
          if (detectedTitle) {
            unmatchedNotice = `"${detectedTitle}" is not present in database catalog. Click Add Type to create it.`;
            findings.push({ label: 'Detected Type', value: `${detectedTitle} (catalog match needed)`, isWarning: true });
          }
          undetected.push('Certificate Type');
        }

        // 2. Match vessel using multi-strategy detection
        const detectedName = (data.detected_vessel_name || data.vessel_name || '').toLowerCase().trim();
        let matchedVessel: any = null;

        // Strategy A: Direct backend vessel ID
        if (data.vessel_id) {
          matchedVessel = vessels.find(v => String(v.id) === String(data.vessel_id));
        }

        // Strategy B: Check IMO in raw text preview
        if (!matchedVessel) {
          const imoMatch = (data.raw_text_preview || '').match(/\bIMO\s*(?:No\.?|Number)?[:\s]*(\d{7})\b/i);
          if (imoMatch && imoMatch[1]) {
            const imoStr = imoMatch[1];
            matchedVessel = vessels.find(v => v.imo && String(v.imo).trim() === imoStr);
          }
        }

        // Strategy C: Clean vessel name comparison (stripping MV / M/V prefix)
        const classKeywords = ['dnv', 'classnk', 'nk', 'bureau veritas', 'bv', 'lloyd', 'lr', 'abs', 'rina'];
        const isClassOrg = classKeywords.some(k => detectedName === k);

        if (!matchedVessel && detectedName && !isClassOrg) {
          const cleanTarget = detectedName.replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
          matchedVessel = vessels.find(v => {
            if (!v.name) return false;
            const cleanV = v.name.toLowerCase().replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
            return cleanV === cleanTarget || (cleanTarget.length >= 4 && cleanV.includes(cleanTarget)) || (cleanV.length >= 4 && cleanTarget.includes(cleanV));
          });
        }

        // Strategy D: Filename comparison with vessel names
        if (!matchedVessel && currentItem.fileName) {
          const cleanFile = currentItem.fileName.toLowerCase().replace(/[^a-z0-9]/gi, '');
          matchedVessel = vessels.find(v => {
            if (!v.name) return false;
            const cleanV = v.name.toLowerCase().replace(/^m[\/\.]?v\.?\s+/i, '').replace(/[^a-z0-9]/gi, '');
            return cleanV.length >= 4 && cleanFile.includes(cleanV);
          });
        }

        let matchedVesselId = currentItem.vesselId || '';
        let matchedVesselName = currentItem.vesselName || '';
        let vesselUnconfirmed = false;
        let detectedVesselRaw = '';

        if (matchedVessel) {
          matchedVesselId = matchedVessel.id;
          matchedVesselName = matchedVessel.name;
          findings.unshift({ label: 'Vessel', value: matchedVessel.name });
        } else if (data.detected_vessel_name || data.vessel_name) {
          const rawShip = data.detected_vessel_name || data.vessel_name;
          if (!isClassOrg) {
            detectedVesselRaw = rawShip;
            vesselUnconfirmed = true;
            findings.unshift({ label: 'Detected Vessel', value: `${rawShip} (confirm vessel)`, isWarning: true });
          } else {
            undetected.push('Target Vessel');
          }
        } else {
          undetected.push('Target Vessel');
        }

        // 3. Authority
        let auth = data.issuing_authority || '';
        if (!auth && matchedMasterObj?.issuing_authority) {
          auth = matchedMasterObj.issuing_authority;
        }
        if (auth) {
          findings.push({ label: 'Authority', value: auth });
        } else {
          undetected.push('Authority');
        }

        // 4. Dates
        let issDate = data.issue_date || '';
        let expDate = data.expiry_date || '';
        let noExp = Boolean(data.has_no_expiry);

        if (matchedMasterObj) {
          if (matchedMasterObj.has_no_expiry) {
            noExp = true;
            expDate = '';
          } else if (!expDate && issDate && masterHasPeriod(matchedMasterObj)) {
            const calculated = calcExpiry(issDate, matchedMasterObj.default_validity_years, (matchedMasterObj as any).default_validity_months);
            if (calculated) expDate = calculated;
          }
        }

        if (issDate) {
          findings.push({ label: 'Issue Date', value: issDate });
        } else {
          undetected.push('Issue Date');
        }

        if (noExp) {
          findings.push({ label: 'Validity', value: 'Permanent' });
        } else if (expDate) {
          findings.push({ label: 'Expiry Date', value: expDate });
        } else {
          undetected.push('Expiry Date');
        }

        // 5. Certificate Number
        if (data.certificate_number) {
          findings.push({ label: 'Cert No', value: data.certificate_number });
        } else {
          undetected.push('Cert #');
        }

        let dupCheck: DuplicateCheck | null = null;
        let dupChoice: DuplicateChoice = '';
        if (matchedVesselId) {
          try {
            const dupFd = new FormData();
            dupFd.append('vessel_id', String(matchedVesselId));
            if (matchedVesselName) dupFd.append('vessel_name', matchedVesselName);
            if (matchedMasterId) dupFd.append('certificate_master_id', String(matchedMasterId));
            if (data.certificate_number) dupFd.append('certificate_number', String(data.certificate_number).trim());
            dupFd.append('filename', currentItem.fileName);
            if (issDate) dupFd.append('issue_date', issDate);
            if (!noExp && expDate) dupFd.append('expiry_date', expDate);
            dupFd.append('has_no_expiry', String(noExp));

            const dupRes = await fetch(`${host._base()}/api/certificates/check-duplicate`, {
              method: 'POST',
              headers: getFormDataHeaders(),
              body: dupFd,
            });
            if (dupRes.ok) {
              const dupData: DuplicateCheck = await dupRes.json();
              if (dupData && dupData.match_type !== 'none') {
                dupCheck = dupData;
                dupChoice = dupData.match_type === 'renewal' ? 'renew' : dupData.match_type === 'exact_duplicate' ? 'replace' : 'separate';
              }
            }
          } catch (e) {
            console.warn('Bulk duplicate check failed for row:', e);
          }
        }

        setBulkItems(prev => prev.map(r => {
          if (r.id !== currentItem.id) return r;
          return {
            ...r,
            status: 'ready',
            vesselId: matchedVesselId || r.vesselId,
            vesselName: matchedVesselName || r.vesselName,
            masterId: matchedMasterId || r.masterId,
            masterName: matchedMasterName || r.masterName,
            certificateNumber: data.certificate_number || r.certificateNumber,
            issuingAuthority: auth || r.issuingAuthority,
            issueDate: issDate || r.issueDate,
            expiryDate: expDate || r.expiryDate,
            hasNoExpiry: noExp,
            suggestedTypeName: suggestedTypeName || undefined,
            unmatchedCertNotice: unmatchedNotice || undefined,
            detectedVesselName: detectedVesselRaw || undefined,
            vesselUnconfirmed,
            extractedFindings: findings,
            undetectedFields: undetected,
            duplicateCheck: dupCheck,
            dupChoice: dupChoice,
            errorMessage: undefined,
          };
        }));
      } catch (err: any) {
        setBulkItems(prev => prev.map(r => {
          if (r.id !== currentItem.id) return r;
          return {
            ...r,
            status: 'error',
            errorMessage: err?.message || 'Extraction incomplete. Please fill details manually.',
          };
        }));
      }
    }

    isProcessingQueueRef.current = false;
    setBulkScanningCurrentName(null);
    setBulkScanningIndex(0);
    setBulkScanningTotal(0);
  };

  const switchToBulkWithFiles = (filesToAdd: File[]): void => {
    setIsBulkMode(true);
    setError(null);
    const newItems: BulkCertificateItem[] = filesToAdd.map((f, i) => ({
      id: `bulk-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
      file: f,
      fileName: f.name,
      fileSize: f.size,
      vesselId: defaultVesselId || vesselId || '',
      vesselName: '',
      masterId: '',
      masterName: '',
      certificateNumber: '',
      issuingAuthority: '',
      issueDate: '',
      expiryDate: '',
      hasNoExpiry: false,
      status: 'pending',
    }));

    setBulkItems(prev => {
      const combined = [...prev, ...newItems];
      setTimeout(() => {
        void runBulkSequentialScan(combined);
      }, 60);
      return combined;
    });
  };

  const handleFilesSelected = (selectedFiles: File[]): void => {
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length === 1 && !isBulkMode) {
      void handleFileSelected(selectedFiles[0]);
    } else {
      switchToBulkWithFiles(selectedFiles);
    }
  };

  const updateBulkItem = (id: string, updates: Partial<BulkCertificateItem>): void => {
    setBulkItems(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, ...updates };

      if (updates.masterId !== undefined && updates.masterId !== '') {
        const m = masters.find(item => Number(item.id) === Number(updates.masterId));
        if (m) {
          updated.masterName = m.name;
          updated.suggestedTypeName = undefined;
          updated.unmatchedCertNotice = undefined;
          updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Certificate Type');
          updated.extractedFindings = [
            ...(updated.extractedFindings || []).filter(f => f.label !== 'Detected Type' && f.label !== 'Certificate Type'),
            { label: 'Certificate Type', value: m.name },
          ];
          if (m.issuing_authority && !row.issuingAuthority) {
            updated.issuingAuthority = m.issuing_authority;
            updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Authority');
          }
          if (m.has_no_expiry) {
            updated.hasNoExpiry = true;
            updated.expiryDate = '';
            updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Expiry Date');
          } else if (masterHasPeriod(m) && updated.issueDate) {
            updated.hasNoExpiry = false;
            updated.expiryDate = calcExpiry(updated.issueDate, m.default_validity_years, (m as any).default_validity_months);
            updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Expiry Date');
          } else {
            updated.hasNoExpiry = false;
          }
        }
      }

      if (updates.issueDate !== undefined) {
        if (updates.issueDate) {
          updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Issue Date');
        }
        if (updates.issueDate && !updated.hasNoExpiry) {
          const m = masters.find(item => Number(item.id) === Number(updated.masterId));
          if (m && masterHasPeriod(m)) {
            updated.expiryDate = calcExpiry(updates.issueDate, m.default_validity_years, (m as any).default_validity_months);
            updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Expiry Date');
          }
        }
      }

      if (updates.expiryDate !== undefined && updates.expiryDate) {
        updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Expiry Date');
      }

      if (updates.hasNoExpiry) {
        updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Expiry Date');
      }

      if (updates.vesselId !== undefined) {
        const v = vessels.find(item => String(item.id) === String(updates.vesselId));
        updated.vesselName = v?.name || '';
        if (updates.vesselId) {
          updated.vesselUnconfirmed = false;
          updated.undetectedFields = (updated.undetectedFields || []).filter(f => f !== 'Target Vessel');
          if (v) {
            updated.extractedFindings = [
              ...(updated.extractedFindings || []).filter(f => !f.label.includes('Vessel')),
              { label: 'Vessel', value: v.name },
            ];
          }
        }
      }

      return updated;
    }));
  };

  const removeBulkItem = (id: string): void => {
    setBulkItems(prev => {
      const remaining = prev.filter(r => r.id !== id);
      if (remaining.length === 0) {
        setIsBulkMode(false);
      }
      return remaining;
    });
  };

  const handleBulkSave = async (): Promise<void> => {
    if (bulkItems.length === 0) return;

    for (let i = 0; i < bulkItems.length; i++) {
      const item = bulkItems[i];
      if (!item.vesselId) {
        setError(`Row #${i + 1} (${item.fileName}): Please select a target vessel.`);
        return;
      }
      if (!item.masterId) {
        setError(`Row #${i + 1} (${item.fileName}): Please select a certificate type.`);
        return;
      }
      if (!item.issuingAuthority.trim()) {
        setError(`Row #${i + 1} (${item.fileName}): Issuing authority is required.`);
        return;
      }
      if (!item.issueDate) {
        setError(`Row #${i + 1} (${item.fileName}): Issue date is required.`);
        return;
      }
      if (!item.hasNoExpiry && !item.expiryDate) {
        setError(`Row #${i + 1} (${item.fileName}): Expiry date is required unless marked Permanent.`);
        return;
      }
      if (!item.hasNoExpiry && item.expiryDate && item.expiryDate <= item.issueDate) {
        setError(`Row #${i + 1} (${item.fileName}): Expiry date must be after issue date.`);
        return;
      }
    }

    setBulkSaving(true);
    setError(null);

    try {
      const metadataPayload = bulkItems.map((item, idx) => {
        const v = vessels.find(x => String(x.id) === String(item.vesselId));
        return {
          client_id: item.id,
          file_index: idx,
          file_name: item.fileName,
          vessel_id: String(item.vesselId),
          vessel_name: v?.name || item.vesselName || undefined,
          certificate_master_id: Number(item.masterId),
          certificate_number: item.certificateNumber.trim() || undefined,
          issuing_authority: item.issuingAuthority.trim(),
          issue_date: item.issueDate,
          expiry_date: !item.hasNoExpiry && item.expiryDate ? item.expiryDate : null,
          has_no_expiry: item.hasNoExpiry,
          dup_action: item.dupChoice || 'separate',
          existing_cert_id: item.duplicateCheck?.existing_certificate?.id,
        };
      });

      const fd = new FormData();
      fd.append('metadata', JSON.stringify(metadataPayload));
      bulkItems.forEach(item => {
        fd.append('files', item.file);
      });

      const res = await fetch(`${host._base()}/api/certificates/bulk-save`, {
        method: 'POST',
        headers: getFormDataHeaders(),
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setBulkSaveSummary({
        total: data.total || bulkItems.length,
        saved: data.saved_count || 0,
        failed: data.failed_count || 0,
      });

      if (data.saved_count > 0) {
        onSuccess();
      }

      if (data.failed_count === 0) {
        if (data.approval_summary && data.approval_summary.total_dispatched > 0) {
          setBulkApprovalSummary(data.approval_summary);
          return;
        }
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        const resultMap = new Map<string, any>((data.results || []).map((r: any) => [r.client_id, r]));
        setBulkItems(prev => prev.map(row => {
          const r = resultMap.get(row.id);
          if (r && r.success) {
            return { ...row, status: 'saved' };
          } else if (r && !r.success) {
            return { ...row, status: 'save_error', errorMessage: r.error || 'Failed to save' };
          }
          return row;
        }));
      }
    } catch (err: any) {
      setError(err?.message || 'Bulk upload failed. Please try again.');
    } finally {
      setBulkSaving(false);
    }
  };

  const resetForm = (): void => {
    abortQueueRef.current = true;
    isProcessingQueueRef.current = false;
    setIsBulkMode(false);
    setBulkItems([]);
    setBulkScanningIndex(0);
    setBulkScanningTotal(0);
    setBulkScanningCurrentName(null);
    setApplyAllVesselId('');
    setBulkSaving(false);
    setBulkSaveSummary(null);
    setRowTargetForCreateType(null);
    setShowDetectionFindings(false);
    setExpandedFindingRowId(null);
    setApprovalSentInfo(null);
    setBulkApprovalSummary(null);

    setFile(null);
    setCertificateNumber('');
    setIssueDate('');
    setExpiryDate('');
    setHasNoExpiry(false);
    setResponsiblePerson('');
    setExtracting(false);
    setExtractedSummary(null);
    setExtractedItems([]);
    setSingleExtractedFindings([]);
    setSingleUndetectedFields([]);
    setError(null);
    setUnmatchedCertNotice(null);
    setSuggestedTypeName('');
    setVesselId(defaultVesselId || '');
    setMasterId('');
    setIssuingAuthority('');
    setManualMode(false);
    setDuplicate(null);
    setDupChoice('');
    const fileInput = document.getElementById('cert-file-input') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Ask the server whether this document duplicates, renews, or is older than a certificate already on file.
  React.useEffect(() => {
    if (!isOpen || isBulkMode || !vesselId || (!masterId && !certificateNumber.trim() && !file)) {
      setDuplicate(null);
      setDupChoice('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const fd = new FormData();
      fd.append('vessel_id', String(vesselId));
      const v = vessels.find(x => String(x.id) === String(vesselId));
      if (v?.name) fd.append('vessel_name', v.name);
      if (masterId) fd.append('certificate_master_id', String(masterId));
      if (certificateNumber.trim()) fd.append('certificate_number', certificateNumber.trim());
      if (file?.name) fd.append('filename', file.name);
      if (issueDate) fd.append('issue_date', issueDate);
      if (!hasNoExpiry && expiryDate) fd.append('expiry_date', expiryDate);
      fd.append('has_no_expiry', String(hasNoExpiry));
      fetch(`${host._base()}/api/certificates/check-duplicate`, {
        method: 'POST',
        headers: getFormDataHeaders(),
        body: fd,
      })
        .then(r => (r.ok ? r.json() : null))
        .then((d: DuplicateCheck | null) => {
          if (cancelled) return;
          setDuplicate(d && d.match_type !== 'none' ? d : null);
          setDupChoice(prev => (d && d.match_type === 'renewal' ? (prev || 'renew') : d && d.match_type === 'exact_duplicate' ? (prev || 'replace') : (prev || 'separate')));
        })
        .catch(() => { if (!cancelled) setDuplicate(null); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isBulkMode, vesselId, masterId, issueDate, expiryDate, hasNoExpiry, certificateNumber, file]);


  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  // Load vessels and certificate masters & reset form on open/close
  React.useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }
    resetForm();
    setLoadingOptions(true);
    setError(null);
    setUploadWarning(null);

    const vesselUrl = `${host._base()}/api/vessels?site_key=ozellardms`;

    Promise.all([
      fetch(vesselUrl, { headers: host._headers() }).then(r => r.json()),
      fetch(`${host._base()}/api/certificates/masters`, { headers: host._headers() }).then(r => r.json()),
    ])
      .then(([vList, mList]) => {
        // Registered vessels only: skip "Found in SharePoint" folders that have no vessel record.
        const fetchedArr = (Array.isArray(vList) ? vList : []).filter(
          (v: any) => v.source !== 'sharepoint' && /^\d+$/.test(String(v.id))
        );
        const stateArr = (Array.isArray(host.state?.vessels) ? host.state.vessels : []).filter(
          (v: any) => v.source !== 'sharepoint' && /^\d+$/.test(String(v.id))
        );
        const seen = new Set<string>();
        const mergedVessels: any[] = [];
        for (const v of [...stateArr, ...fetchedArr]) {
          const k = String(v.id || v.name).toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            mergedVessels.push(v);
          }
        }
        const vArr = mergedVessels.length > 0 ? mergedVessels : fetchedArr;
        const mArr = Array.isArray(mList) ? mList : [];
        setVessels(vArr);
        setMasters(mArr);

        if (defaultVesselId) {
          setVesselId(defaultVesselId);
        } else {
          setVesselId('');
        }

        if (defaultMasterId) {
          const preset = mArr.find((m: any) => Number(m.id) === defaultMasterId);
          if (preset) {
            setMasterId(Number(preset.id));
            if (preset.issuing_authority) {
              setIssuingAuthority(preset.issuing_authority);
            }
          }
        } else {
          setMasterId('');
        }
      })
      .catch(err => {
        setError(err?.message || 'Failed to load form options');
      })
      .finally(() => {
        setLoadingOptions(false);
      });
  }, [isOpen, defaultVesselId, defaultMasterId, host]);

  // When master selection changes, default issuing authority and validity/expiry rules
  const handleMasterChange = (id: number): void => {
    setMasterId(id);
    setUnmatchedCertNotice(null);
    const m = masters.find(item => Number(item.id) === id);
    if (!m) return;
    if (m.issuing_authority && !issuingAuthority) {
      setIssuingAuthority(m.issuing_authority);
    }
    if (m.has_no_expiry) {
      setHasNoExpiry(true);
      setExpiryDate('');
    } else {
      setHasNoExpiry(false);
      if (issueDate) {
        const autoExp = calcExpiry(issueDate, m.default_validity_years, (m as any).default_validity_months);
        if (autoExp) setExpiryDate(autoExp);
      }
    }
  };

  const handleIssueDateChange = (newIssueDate: string): void => {
    setIssueDate(newIssueDate);
    if (!newIssueDate || hasNoExpiry) return;
    const m = masters.find(item => Number(item.id) === Number(masterId));
    if (m && masterHasPeriod(m)) {
      const autoExp = calcExpiry(newIssueDate, m.default_validity_years, (m as any).default_validity_months);
      if (autoExp) setExpiryDate(autoExp);
    }
  };

  const vesselSelectOptions: SearchableSelectOption[] = React.useMemo(() => {
    const sites = host.state.documentSites || [];
    const nonVesselKeywords = ['acra charge', 'report', 'reports', 'purchase order', 'invoice tracker', 'share folder', 'bad site'];
    return vessels
      .filter(v => {
        if (!v || !v.name) return false;
        const clean = v.name.toLowerCase().trim();
        return !nonVesselKeywords.some(kw => clean.includes(kw));
      })
      .map(v => {
        const siteKey: string = v.provisioned_site_key || (v.provisioned_site_ids || [])[0] || '';
        const site = sites.filter(s => s.site_key === siteKey)[0];
        const siteName = site?.sp_site_name || siteKey;
        return {
          key: v.id,
          text: v.name,
          subtext: [v.imo ? `IMO ${v.imo}` : 'No IMO', siteName].filter(Boolean).join(' • '),
          iconName: 'Ferry',
        };
      });
  }, [vessels, host.state.documentSites]);

  const sortedMasters = React.useMemo(() => {
    return [...masters].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [masters]);

  // Expiry must be after the issue date (unless the certificate never expires).
  const dateError =
    !hasNoExpiry && issueDate && expiryDate && expiryDate <= issueDate
      ? 'Expiry date must be after the issue date.'
      : null;

  const masterSelectOptions: SearchableSelectOption[] = React.useMemo(() => {
    const selectedV = vessels.find(v => String(v.id) === String(vesselId));
    const vType = selectedV?.vessel_type?.toLowerCase().trim() || '';

    return masters.map(m => {
      let isApplicable = false;
      const scopes: string[] = m.scopes || [];
      const shipTypes: string[] = (m.ship_types || []).map((t: string) => t.toLowerCase().trim());
      const vesselIds: any[] = m.vessel_ids || [];

      if (!vesselId || scopes.length === 0 || scopes.includes('all_ships') || m.scope === 'all_ships') {
        isApplicable = true;
      } else if (vType && shipTypes.some((st: string) => st === vType || vType.includes(st) || st.includes(vType))) {
        isApplicable = true;
      } else if (vesselIds.some((id: any) => String(id) === String(vesselId))) {
        isApplicable = true;
      }

      const validityTag = masterPeriodLabel(m);

      const subtextParts = [m.category];
      if (validityTag) subtextParts.push(validityTag);
      if (isApplicable && selectedV) subtextParts.push(`Required for ${selectedV.name}`);

      return {
        key: m.id,
        text: m.name,
        subtext: subtextParts.join(' • '),
        category: isApplicable ? (selectedV ? `Required for ${selectedV.name}` : m.category) : `Other Fleet Types`,
        iconName: 'Certificate',
        isApplicable,
      };
    }).sort((a: any, b: any) => {
      if (a.isApplicable && !b.isApplicable) return -1;
      if (!a.isApplicable && b.isApplicable) return 1;
      return a.text.localeCompare(b.text);
    });
  }, [masters, vesselId, vessels]);

  const vesselMatchStatus = React.useMemo(() => {
    if (!masterId || !vesselId) return null;
    const selectedM = masters.find(m => Number(m.id) === Number(masterId));
    const selectedV = vessels.find(v => String(v.id) === String(vesselId));
    if (!selectedM || !selectedV) return null;

    const vType = selectedV.vessel_type?.toLowerCase().trim() || '';
    const scopes: string[] = selectedM.scopes || [];
    const shipTypes: string[] = (selectedM.ship_types || []).map((t: string) => t.toLowerCase().trim());
    const vesselIds: any[] = selectedM.vessel_ids || [];

    if (scopes.length === 0 || scopes.includes('all_ships') || selectedM.scope === 'all_ships') {
      return {
        isApplicable: true,
        message: `Fleet-wide requirement — applies to all ships including ${selectedV.name}.`,
      };
    }
    if (vType && shipTypes.some((st: string) => st === vType || vType.includes(st) || st.includes(vType))) {
      return {
        isApplicable: true,
        message: `Verified: Required for ${selectedV.name} (${selectedV.vessel_type || 'Matching ship type'}).`,
      };
    }
    if (vesselIds.some((id: any) => String(id) === String(selectedV.id))) {
      return {
        isApplicable: true,
        message: `Verified: Specifically mapped to ${selectedV.name}.`,
      };
    }

    const targetTypes = shipTypes.length > 0 ? shipTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : 'other specific vessels';
    return {
      isApplicable: false,
      message: `Note: This certificate type is configured for [${targetTypes}], while ${selectedV.name} is a ${selectedV.vessel_type || 'different vessel type'}.`,
    };
  }, [masterId, vesselId, masters, vessels]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!vesselId || !masterId) {
      setError('Please select both a vessel and a certificate type.');
      return;
    }
    if (!issuingAuthority.trim()) {
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
    if (duplicate && !dupChoice) {
      setError('This certificate already exists on file. Choose how to handle it, or cancel.');
      return;
    }
    if (duplicate && dupChoice === 'replace' && !file) {
      setError('Choose the replacement file first, or pick a different option.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('vessel_id', String(vesselId));
      const selectedVesselObj = vessels.find(v => String(v.id) === String(vesselId));
      if (selectedVesselObj?.name) {
        formData.append('vessel_name', selectedVesselObj.name);
      }
      formData.append('certificate_master_id', String(masterId));
      formData.append('issuing_authority', issuingAuthority.trim());
      formData.append('issue_date', issueDate);
      if (certificateNumber.trim()) {
        formData.append('certificate_number', certificateNumber.trim());
      }
      if (!hasNoExpiry && expiryDate) {
        formData.append('expiry_date', expiryDate);
      }
      formData.append('has_no_expiry', String(hasNoExpiry));
      if (responsiblePerson.trim()) {
        formData.append('responsible_person', responsiblePerson.trim());
      }
      if (file) {
        formData.append('file', file);
      }

      let url = `${host._base()}/api/certificates`;
      let method = 'POST';
      const ex = duplicate && duplicate.existing_certificate;
      if (ex && dupChoice === 'renew') {
        // Archives the current version into the certificate's history and updates the active record.
        url += `/${ex.id}/renew`;
        formData.append('notes', 'Renewed by uploading a new certificate document.');
      } else if (ex && dupChoice === 'replace') {
        // Same certificate, clearer scan: swap the file only and keep the recorded details.
        url += `/${ex.id}`;
        method = 'PUT';
        formData.set('issuing_authority', ex.issuing_authority || issuingAuthority.trim());
        formData.set('issue_date', ex.issue_date || issueDate);
        formData.delete('expiry_date');
        if (!ex.has_no_expiry && ex.expiry_date) formData.set('expiry_date', ex.expiry_date);
        formData.set('has_no_expiry', String(ex.has_no_expiry));
        formData.delete('certificate_number');
        if (ex.certificate_number) formData.set('certificate_number', ex.certificate_number);
      } else if (ex && dupChoice === 'separate') {
        formData.append('upload_mode', 'separate');
      }

      const res = await fetch(url, {
        method,
        headers: getFormDataHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Failed to save certificate (HTTP ${res.status})`);
      }

      const saved = await res.json().catch(() => null);
      onSuccess();
      if (saved?.upload_error) {
        // Saved, but the file is missing: keep the dialog open so the problem is seen.
        setUploadWarning(String(saved.upload_error));
        return;
      }
      if (saved?.approval_routing?.email_automation_enabled) {
        setApprovalSentInfo(saved.approval_routing);
        return;
      }
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Error creating certificate');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      onClick={e => {
        if (e.target === e.currentTarget && !busy) {
          handleClose();
        }
      }}
      className="add-certificate-modal-i1" style={{ position: 'fixed', zIndex: 100005, background: 'rgba(5, 15, 25, 0.65)' }}
    >
      <div
        className="vdms-cert-modal"
        style={{
          width: '100%',
          maxWidth: isBulkMode ? 1160 : 680,
          transition: 'max-width 0.25s ease',
          fontFamily: DMS_FONT_DISPLAY,
          background: 'var(--vdms-surface)',
          borderRadius: 14,
          border: '1px solid var(--vdms-line)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
        }}
      >

        <form
          onSubmit={isBulkMode ? (e) => { e.preventDefault(); void handleBulkSave(); } : handleSubmit}
          className="add-certificate-modal-i2"
        >
          {/* Header */}
          <div
            className="add-certificate-modal-i3"
          >
            <div>
              <div className="add-certificate-modal-i4">
                <h3
                  className="add-certificate-modal-i5" style={{ fontFamily: DMS_FONT_DISPLAY }}
                >
                  {isBulkMode
                    ? `Add Vessel Certificates (Bulk Mode — ${bulkItems.length} file${bulkItems.length === 1 ? '' : 's'})`
                    : 'Add Vessel Certificate'}
                </h3>
                {isBulkMode && (
                  <span
                    className="add-certificate-modal-i6" style={{ borderRadius: 10, background: 'rgba(14, 116, 144, 0.12)', color: clay.accent }}
                  >
                    Batch Staging
                  </span>
                )}
              </div>
              <div className="add-certificate-modal-i7">
                {isBulkMode
                  ? 'Review and verify extracted compliance details before committing to SharePoint and fleet database.'
                  : 'Upload statutory certificate PDF to SharePoint and record compliance data.'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={busy || bulkSaving}
              className="add-certificate-modal-i8"
            >
              <Icon iconName="Cancel" />
            </button>
          </div>

          {/* Body Form (Fits neatly in viewport, scrolls only if screen is tiny) */}
          <div
            className="vdms-scroll-clean"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
            }}
          >
          {error && (
            <div
              className="add-certificate-modal-i9" style={{ borderRadius: 6, background: clay.pillDangerBg, color: clay.pillDangerText }}
            >
              <Icon iconName="ErrorBadge" />
              {error}
            </div>
          )}

          {uploadWarning && (
            <div
              className="add-certificate-modal-i10" style={{ borderRadius: 6, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--vdms-text)' }}
            >
              <Icon iconName="Warning" className="add-certificate-modal-i11" />
              <span>
                The certificate was saved, but its file was not uploaded. {uploadWarning} Open the certificate and upload the file again.
              </span>
            </div>
          )}

          {loadingOptions ? (
            <div className="add-certificate-modal-i12">
              Loading vessel and master catalogs...
            </div>
          ) : isBulkMode ? (
            /* Bulk Mode View */
            <div className="add-certificate-modal-i13">
              {/* Success Banner if bulkSaveSummary */}
              {bulkSaveSummary && (
                <div
                  className="add-certificate-modal-i14" style={{ borderRadius: 8, background: bulkSaveSummary.failed === 0 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(245, 158, 11, 0.12)', border: `1px solid ${bulkSaveSummary.failed === 0 ? '#059669' : '#f59e0b'}` }}
                >
                  <Icon
                    iconName={bulkSaveSummary.failed === 0 ? 'CompletedSolid' : 'Warning'}
                    className="add-certificate-modal-i15" style={{ color: bulkSaveSummary.failed === 0 ? '#059669' : '#f59e0b' }}
                  />
                  <span>
                    {bulkSaveSummary.failed === 0
                      ? `✓ Successfully committed all ${bulkSaveSummary.saved} certificate(s) to SharePoint and fleet database!`
                      : `Saved ${bulkSaveSummary.saved} certificate(s). ${bulkSaveSummary.failed} file(s) failed — review error notes in the table below and retry.`}
                  </span>
                </div>
              )}

              {/* Top Control Bar: Progress + Quick Tools */}
              <div
                className="add-certificate-modal-i16" style={{ borderRadius: 8 }}
              >
                {/* Left: Live status */}
                <div className="add-certificate-modal-i17">
                  {bulkScanningIndex > 0 ? (
                    <div className="add-certificate-modal-i4">
                      <Icon iconName="ProgressRingDots" className="add-certificate-modal-i15" style={{ color: clay.accent }} />
                      <span className="add-certificate-modal-i18" style={{ color: clay.accent }}>
                        Scanning {bulkScanningIndex} of {bulkScanningTotal}: {bulkScanningCurrentName || ''}
                      </span>
                    </div>
                  ) : bulkItems.some(i => i.status === 'scanning') ? (
                    <div className="add-certificate-modal-i4">
                      <Icon iconName="ProgressRingDots" className="add-certificate-modal-i15" style={{ color: clay.accent }} />
                      <span className="add-certificate-modal-i18" style={{ color: clay.accent }}>
                        Processing certificate queue...
                      </span>
                    </div>
                  ) : (
                    <div className="add-certificate-modal-i19">
                      <Icon iconName="CompletedSolid" className="add-certificate-modal-i20" />
                      <span className="add-certificate-modal-i21">
                        {bulkItems.length} documents queued • Verify details before saving
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Quick Tools (Set Vessel for All & Add More) */}
                <div className="add-certificate-modal-i22">
                  <div className="add-certificate-modal-i19">
                    <span className="add-certificate-modal-i23">
                      Set Vessel for All:
                    </span>
                    <div style={{ width: 180 }}>
                      <DmsSelect
                        size="sm"
                        value={String(applyAllVesselId || '')}
                        onChange={v => setApplyAllVesselId(v)}
                        disabled={bulkSaving}
                        placeholder="Choose vessel..."
                        options={vesselSelectOptions.map(v => ({ value: String(v.key), label: v.text }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!applyAllVesselId || bulkSaving}
                      onClick={() => {
                        if (!applyAllVesselId) return;
                        const chosenV = vessels.find(v => String(v.id) === String(applyAllVesselId));
                        setBulkItems(prev => prev.map(item => ({
                          ...item,
                          vesselId: applyAllVesselId,
                          vesselName: chosenV?.name || item.vesselName,
                          vesselUnconfirmed: false,
                          undetectedFields: (item.undetectedFields || []).filter(f => f !== 'Target Vessel'),
                          extractedFindings: [
                            ...(item.extractedFindings || []).filter(f => !f.label.includes('Vessel')),
                            { label: 'Vessel', value: chosenV?.name || '' },
                          ],
                        })));
                      }}
                      style={{
                        ...dmsBtn('secondary'),
                        height: 28,
                        padding: '0 10px',
                        fontSize: 11.5,
                      }}
                      title="Apply this vessel to all rows"
                    >
                      Apply
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={() => {
                      const input = document.getElementById('cert-bulk-add-more') as HTMLInputElement | null;
                      input?.click();
                    }}
                    style={{
                      ...dmsBtn('secondary'),
                      height: 28,
                      padding: '0 10px',
                      fontSize: 11.5,
                      gap: 4,
                    }}
                  >
                    <Icon iconName="Add" className="add-certificate-modal-i24" /> Add More Files
                  </button>
                  <input
                    id="cert-bulk-add-more"
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="add-certificate-modal-i25"
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        switchToBulkWithFiles(Array.from(e.target.files));
                      }
                    }}
                  />
                </div>
              </div>

              {/* Auto-Detection & Undetection Findings Overview Banner */}
              {bulkItems.some(i => i.status === 'ready') && (
                <div
                  className="add-certificate-modal-i26" style={{ borderRadius: 8, background: bulkItems.some(i => i.unmatchedCertNotice) ? 'rgba(217, 119, 6, 0.08)' : 'rgba(16, 124, 65, 0.06)', border: `1px solid ${bulkItems.some(i => i.unmatchedCertNotice) ? 'rgba(217, 119, 6, 0.3)' : 'rgba(16, 124, 65, 0.22)'}` }}
                >
                  <div className="add-certificate-modal-i27">
                    <div className="add-certificate-modal-i28" style={{ color: bulkItems.some(i => i.unmatchedCertNotice) ? '#b45309' : '#107c41' }}>
                      <Icon iconName={bulkItems.some(i => i.unmatchedCertNotice) ? 'Warning' : 'CompletedSolid'} className="add-certificate-modal-i29" />
                      <span>Auto-Detected Document Findings:</span>
                      <span className="add-certificate-modal-i30">
                        {bulkItems.reduce((acc, r) => acc + (r.extractedFindings?.length || 0), 0)} fields auto-detected across {bulkItems.length} files
                        {bulkItems.filter(r => r.unmatchedCertNotice).length > 0 && (
                          ` • ${bulkItems.filter(r => r.unmatchedCertNotice).length} certificate type(s) require catalog addition`
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDetectionFindings(prev => !prev)}
                      className="add-certificate-modal-i31" style={{ color: clay.accent }}
                    >
                      {showDetectionFindings ? 'Hide Findings Overview ▲' : 'View Detected vs Undetected Findings ▼'}
                    </button>
                  </div>

                  {showDetectionFindings && (
                    <div className="add-certificate-modal-i32">
                      {bulkItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="add-certificate-modal-i33" style={{ background: 'var(--vdms-surface)', borderRadius: 6 }}
                        >
                          <strong className="add-certificate-modal-i34" style={{ minWidth: 22 }}>#{idx + 1}</strong>
                          <div className="add-certificate-modal-i35" style={{ minWidth: 140, maxWidth: 180 }} title={item.fileName}>
                            {item.fileName}
                          </div>
                          <div className="add-certificate-modal-i36">
                            {(item.extractedFindings || []).map((f, fIdx) => (
                              <span
                                key={fIdx}
                                className="add-certificate-modal-i37" style={{ color: f.isWarning ? '#b45309' : '#15803d', background: f.isWarning ? 'rgba(217, 119, 6, 0.1)' : 'rgba(22, 128, 61, 0.08)' }}
                              >
                                • <strong>{f.label}:</strong> {f.value}
                              </span>
                            ))}
                            {(item.undetectedFields || []).map((u, uIdx) => (
                              <span
                                key={uIdx}
                                className="add-certificate-modal-i37" style={{ color: '#b91c1c', background: 'rgba(239, 68, 68, 0.08)' }}
                              >
                                ✕ Undetected: {u}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Spreadsheet Review Table */}
              <div
                className="vdms-scroll-clean"
                style={{
                  overflowX: 'auto',
                  border: '1px solid var(--vdms-line)',
                  borderRadius: 8,
                  background: 'var(--vdms-surface)',
                  maxHeight: '52vh',
                }}
              >
                <table className="add-certificate-modal-i38" style={{ width: '100%' }}>
                  <thead>
                    <tr
                      className="add-certificate-modal-i39"
                    >
                      <th
                        className="add-certificate-modal-i40" style={{ minWidth: 50 }}
                      >
                        Status
                      </th>
                      <th
                        className="add-certificate-modal-i41" style={{ minWidth: 170, maxWidth: 220 }}
                      >
                        File
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 160 }}
                      >
                        Target Vessel *
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 200 }}
                      >
                        Certificate Type *
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 120 }}
                      >
                        Cert #
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 140 }}
                      >
                        Authority *
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 120 }}
                      >
                        Issue Date *
                      </th>
                      <th
                        className="add-certificate-modal-i42" style={{ minWidth: 160 }}
                      >
                        Expiry Date
                      </th>
                      <th
                        className="add-certificate-modal-i43"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.map((item, idx) => {
                      const hasDateErr = !item.hasNoExpiry && item.expiryDate && item.issueDate && item.expiryDate <= item.issueDate;
                      const rowSolidBg = item.status === 'scanning'
                        ? 'linear-gradient(rgba(14, 116, 144, 0.08), rgba(14, 116, 144, 0.08)), var(--vdms-surface)'
                        : item.status === 'save_error'
                        ? 'linear-gradient(rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.08)), var(--vdms-surface)'
                        : item.status === 'saved'
                        ? 'linear-gradient(rgba(5, 150, 105, 0.08), rgba(5, 150, 105, 0.08)), var(--vdms-surface)'
                        : 'var(--vdms-surface)';
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            style={{
                              background: rowSolidBg,
                            }}
                          >
                            {/* Status - Sticky Column 1 */}
                            <td
                              className="add-certificate-modal-i44" style={{ minWidth: 50, background: rowSolidBg }}
                            >
                              {item.status === 'scanning' ? (
                                <Icon iconName="ProgressRingDots" className="add-certificate-modal-i45" style={{ color: clay.accent }} title="Extracting text & metadata..." />
                              ) : item.status === 'saved' ? (
                                <Icon iconName="CompletedSolid" className="add-certificate-modal-i20" title="Saved to fleet database" />
                              ) : item.status === 'save_error' ? (
                                <Icon iconName="ErrorBadge" className="add-certificate-modal-i45" style={{ color: clay.pillDangerText }} title={item.errorMessage || 'Failed to save'} />
                              ) : item.status === 'error' ? (
                                <Icon iconName="Warning" className="add-certificate-modal-i46" title={item.errorMessage || 'Extraction incomplete. Please review fields.'} />
                              ) : item.status === 'ready' ? (
                                <Icon iconName="CheckMark" className="add-certificate-modal-i47" title="Extracted & ready" />
                              ) : (
                                <span className="add-certificate-modal-i48">{idx + 1}</span>
                              )}
                            </td>

                            {/* File - Sticky Column 2 */}
                            <td
                              className="add-certificate-modal-i49" style={{ minWidth: 170, maxWidth: 220, background: rowSolidBg }}
                            >
                              <div className="add-certificate-modal-i19">
                                <Icon iconName="PDF" className="add-certificate-modal-i50" style={{ color: clay.accent }} />
                                <div className="add-certificate-modal-i51" style={{ minWidth: 0 }}>
                                  <div
                                    className="add-certificate-modal-i52" style={{ maxWidth: 160 }}
                                    title={item.fileName}
                                  >
                                    {item.fileName}
                                  </div>
                                  <div className="add-certificate-modal-i53">
                                    {(item.fileSize / 1024).toFixed(1)} KB
                                  </div>
                                </div>
                              </div>

                              {/* Detection & Undetection Status Pill */}
                              {item.status === 'ready' && (
                                <div className="add-certificate-modal-i54">
                                  {item.unmatchedCertNotice ? (
                                    <span
                                      className="add-certificate-modal-i55" style={{ color: '#b45309', background: 'rgba(217, 119, 6, 0.12)' }}
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      title="Click to view extraction details. Certificate type requires catalog match."
                                    >
                                      <Icon iconName="Warning" className="add-certificate-modal-i56" /> Catalog match needed
                                    </span>
                                  ) : item.undetectedFields && item.undetectedFields.length > 0 ? (
                                    <span
                                      className="add-certificate-modal-i57" style={{ color: '#0369a1', background: 'rgba(2, 132, 199, 0.08)' }}
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      title={`Detected: ${(item.extractedFindings || []).map(f => f.label).join(', ')}. Click to view details.`}
                                    >
                                      <Icon iconName="Info" className="add-certificate-modal-i56" /> {item.extractedFindings?.length || 0} detected • {item.undetectedFields.length} review
                                    </span>
                                  ) : (
                                    <span
                                      className="add-certificate-modal-i55" style={{ color: '#15803d', background: 'rgba(22, 128, 61, 0.08)' }}
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      title="All fields detected. Click to view findings."
                                    >
                                      <Icon iconName="CompletedSolid" className="add-certificate-modal-i56" /> All fields detected
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Duplicate Detection Pill */}
                              {item.duplicateCheck && item.duplicateCheck.match_type !== 'none' && (
                                <div className="add-certificate-modal-i58">
                                  {item.duplicateCheck.match_type === 'exact_duplicate' && (
                                    <span
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      className="add-certificate-modal-i59" style={{ color: '#b91c1c', background: 'rgba(185, 28, 28, 0.1)' }}
                                      title={`Already on file: ${item.duplicateCheck.existing_certificate?.certificate_number || ''}. Click row to configure.`}
                                    >
                                      <Icon iconName="Warning" className="add-certificate-modal-i56" /> Duplicate on file ({item.dupChoice === 'replace' ? 'Replace' : 'Separate'})
                                    </span>
                                  )}
                                  {item.duplicateCheck.match_type === 'renewal' && (
                                    <span
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      className="add-certificate-modal-i60" style={{ color: '#15803d', background: 'rgba(22, 128, 61, 0.1)' }}
                                      title="Renewal for certificate on file. Click row to configure."
                                    >
                                      <Icon iconName="Sync" className="add-certificate-modal-i56" /> Renewal ({item.dupChoice === 'renew' ? 'Renew & Archive' : 'Separate'})
                                    </span>
                                  )}
                                  {item.duplicateCheck.match_type === 'older_version' && (
                                    <span
                                      onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                      className="add-certificate-modal-i61" style={{ color: '#b45309', background: 'rgba(217, 119, 6, 0.1)' }}
                                      title="Newer version already on file. Click row to configure."
                                    >
                                      <Icon iconName="Warning" className="add-certificate-modal-i56" /> Newer version on file
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Target Vessel */}
                            <td className="add-certificate-modal-i62">
                              <DmsSelect
                                size="sm"
                                value={String(item.vesselId || '')}
                                onChange={v => updateBulkItem(item.id, { vesselId: v })}
                                disabled={bulkSaving}
                                invalid={!item.vesselId}
                                placeholder="Select Vessel..."
                                options={vesselSelectOptions.map(v => ({ value: String(v.key), label: v.text }))}
                              />
                              {item.vesselUnconfirmed && item.detectedVesselName && (
                                <span
                                  className="add-certificate-modal-i63"
                                  title={`Detected vessel text: "${item.detectedVesselName}". Please verify target vessel.`}
                                >
                                  Detected: "{item.detectedVesselName}" (please confirm)
                                </span>
                              )}
                              {!item.vesselId && !item.detectedVesselName && item.status === 'ready' && (
                                <span className="add-certificate-modal-i64">
                                  Undetected in document • Please select
                                </span>
                              )}
                            </td>

                            {/* Certificate Type */}
                            <td className="add-certificate-modal-i62">
                              <DmsSelect
                                size="sm"
                                value={item.masterId ? String(item.masterId) : ''}
                                onChange={v => updateBulkItem(item.id, { masterId: v ? Number(v) : '' })}
                                disabled={bulkSaving}
                                invalid={!item.masterId}
                                placeholder="Select Certificate Type..."
                                options={sortedMasters.map(m => ({ value: String(m.id), label: `${m.name} (${m.category})` }))}
                              />

                              {/* Direct Alert when certificate type was detected in doc but is not in catalog */}
                              {!item.masterId && item.suggestedTypeName && (
                                <div
                                  className="add-certificate-modal-i65" style={{ background: 'rgba(217, 119, 6, 0.08)', color: '#b45309' }}
                                >
                                  <div className="add-certificate-modal-i66" style={{ minWidth: 0 }}>
                                    <Icon iconName="Warning" className="add-certificate-modal-i67" />
                                    <span
                                      className="add-certificate-modal-i68"
                                      title={`Detected from document: "${item.suggestedTypeName}" (not present in database catalog)`}
                                    >
                                      Detected: <strong>"{item.suggestedTypeName}"</strong>
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRowTargetForCreateType(item.id);
                                      setSuggestedTypeName(item.suggestedTypeName || '');
                                      if (item.issuingAuthority) setIssuingAuthority(item.issuingAuthority);
                                      setShowCreateTypeModal(true);
                                    }}
                                    className="add-certificate-modal-i69" style={{ background: '#d97706', color: '#ffffff' }}
                                    title="Add this certificate type to database catalog"
                                  >
                                    <Icon iconName="Add" className="add-certificate-modal-i56" /> Add Type
                                  </button>
                                </div>
                              )}

                              {!item.masterId && !item.suggestedTypeName && item.status === 'ready' && (
                                <span className="add-certificate-modal-i64">
                                  Undetected in document • Please choose type
                                </span>
                              )}
                            </td>

                            {/* Cert # */}
                            <td className="add-certificate-modal-i62">
                              <input
                                type="text"
                                value={item.certificateNumber}
                                onChange={e => updateBulkItem(item.id, { certificateNumber: e.target.value })}
                                placeholder="e.g. ABS-1234"
                                disabled={bulkSaving}
                                style={{
                                  ...dmsControlStyle(),
                                  height: 28,
                                  fontSize: 11.5,
                                  padding: '2px 6px',
                                  width: '100%',
                                }}
                              />
                            </td>

                            {/* Authority */}
                            <td className="add-certificate-modal-i62">
                              <input
                                type="text"
                                value={item.issuingAuthority}
                                onChange={e => updateBulkItem(item.id, { issuingAuthority: e.target.value })}
                                placeholder="e.g. ABS, DNV"
                                disabled={bulkSaving}
                                style={{
                                  ...dmsControlStyle(),
                                  height: 28,
                                  fontSize: 11.5,
                                  padding: '2px 6px',
                                  width: '100%',
                                  border: !item.issuingAuthority.trim() ? '1px solid #f87171' : undefined,
                                }}
                              />
                            </td>

                            {/* Issue Date */}
                            <td className="add-certificate-modal-i62">
                              <input
                                type="date"
                                value={item.issueDate}
                                onChange={e => updateBulkItem(item.id, { issueDate: e.target.value })}
                                disabled={bulkSaving}
                                style={{
                                  ...dmsControlStyle(),
                                  height: 28,
                                  fontSize: 11,
                                  padding: '2px 4px',
                                  width: '100%',
                                  border: !item.issueDate ? '1px solid #f87171' : undefined,
                                }}
                              />
                              {!item.issueDate && item.status === 'ready' && (
                                <span className="add-certificate-modal-i64">
                                  Undetected in document
                                </span>
                              )}
                            </td>

                            {/* Expiry Date */}
                            <td className="add-certificate-modal-i62">
                              <div className="add-certificate-modal-i19">
                                <input
                                  type="date"
                                  value={item.expiryDate}
                                  disabled={item.hasNoExpiry || bulkSaving}
                                  onChange={e => updateBulkItem(item.id, { expiryDate: e.target.value })}
                                  style={{
                                    ...dmsControlStyle(),
                                    height: 28,
                                    fontSize: 11,
                                    padding: '2px 4px',
                                    flex: 1,
                                    minWidth: 105,
                                    border: (!item.hasNoExpiry && !item.expiryDate) || hasDateErr
                                      ? '1px solid #f87171'
                                      : undefined,
                                    opacity: item.hasNoExpiry ? 0.4 : 1,
                                  }}
                                />
                                <label className="add-certificate-modal-i70">
                                  <input
                                    type="checkbox"
                                    checked={item.hasNoExpiry}
                                    disabled={bulkSaving}
                                    onChange={e => updateBulkItem(item.id, {
                                      hasNoExpiry: e.target.checked,
                                      expiryDate: e.target.checked ? '' : item.expiryDate,
                                    })}
                                  />
                                  Perm.
                                </label>
                              </div>
                              {!item.hasNoExpiry && !item.expiryDate && item.status === 'ready' && (
                                <span className="add-certificate-modal-i64">
                                  Undetected in document
                                </span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="add-certificate-modal-i71">
                              <div className="add-certificate-modal-i72">
                                {item.extractedFindings && item.extractedFindings.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedFindingRowId(prev => prev === item.id ? null : item.id)}
                                    disabled={bulkSaving}
                                    title={expandedFindingRowId === item.id ? 'Hide extraction details' : 'View extraction details'}
                                    className="add-certificate-modal-i73" style={{ background: expandedFindingRowId === item.id ? 'rgba(14, 116, 144, 0.15)' : 'transparent', color: clay.accent }}
                                  >
                                    <Icon iconName="Info" className="add-certificate-modal-i29" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeBulkItem(item.id)}
                                  disabled={bulkSaving}
                                  title="Remove this document from upload queue"
                                  className="add-certificate-modal-i74" style={{ color: clay.pillDangerText }}
                                >
                                  <Icon iconName="Delete" className="add-certificate-modal-i29" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Findings Sub-Row for this file */}
                          {expandedFindingRowId === item.id && (
                            <tr key={`${item.id}-findings`}>
                              <td
                                colSpan={9}
                                className="add-certificate-modal-i75" style={{ background: 'rgba(14, 116, 144, 0.04)' }}
                              >
                                <div className="add-certificate-modal-i76">
                                  <div className="add-certificate-modal-i77">
                                    <Icon iconName="CompletedSolid" className="add-certificate-modal-i78" />
                                    <span>Auto-Detected Document Findings for "{item.fileName}":</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedFindingRowId(null)}
                                    className="add-certificate-modal-i79"
                                  >
                                    Close ✕
                                  </button>
                                </div>

                                <div className="add-certificate-modal-i80" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                                  {(item.extractedFindings || []).map((f, fIdx) => (
                                    <div key={fIdx} className="add-certificate-modal-i81">
                                      <span className="add-certificate-modal-i82" style={{ color: f.isWarning ? '#d97706' : '#107c41' }}>•</span>
                                      <span className="add-certificate-modal-i83">{f.label}:</span>
                                      <span className="add-certificate-modal-i84" style={{ color: f.isWarning ? '#b45309' : 'var(--vdms-text)' }}>{f.value}</span>
                                    </div>
                                  ))}
                                  {(item.undetectedFields || []).map((u, uIdx) => (
                                    <div key={uIdx} className="add-certificate-modal-i81">
                                      <span className="add-certificate-modal-i85">✕</span>
                                      <span className="add-certificate-modal-i83">{u}:</span>
                                      <span className="add-certificate-modal-i86">Undetected in document</span>
                                    </div>
                                  ))}
                                </div>

                                {item.duplicateCheck && item.duplicateCheck.existing_certificate && (
                                  <div
                                    className="add-certificate-modal-i87" style={{ borderRadius: 6, background: item.duplicateCheck.match_type === 'renewal'
                                        ? 'rgba(16, 124, 65, 0.08)'
                                        : item.duplicateCheck.match_type === 'exact_duplicate'
                                        ? 'rgba(185, 28, 28, 0.07)'
                                        : 'rgba(180, 83, 9, 0.08)', border: `1px solid ${
                                        item.duplicateCheck.match_type === 'renewal'
                                          ? 'rgba(16, 124, 65, 0.3)'
                                          : item.duplicateCheck.match_type === 'exact_duplicate'
                                          ? 'rgba(185, 28, 28, 0.3)'
                                          : 'rgba(180, 83, 9, 0.3)'
                                      }` }}
                                  >
                                    <div
                                      className="add-certificate-modal-i88" style={{ color: item.duplicateCheck.match_type === 'renewal'
                                          ? '#107c41'
                                          : item.duplicateCheck.match_type === 'exact_duplicate'
                                          ? '#b91c1c'
                                          : '#b45309' }}
                                    >
                                      <Icon iconName={item.duplicateCheck.match_type === 'renewal' ? 'Sync' : 'Warning'} className="add-certificate-modal-i89" />
                                      {item.duplicateCheck.match_type === 'renewal'
                                        ? 'Renewal detected'
                                        : item.duplicateCheck.match_type === 'exact_duplicate'
                                        ? 'Certificate already on file'
                                        : 'Newer version on file'}
                                      <span className="add-certificate-modal-i90">
                                        (Matched on: {item.duplicateCheck.matched_on || 'file'})
                                      </span>
                                    </div>
                                    <div className="add-certificate-modal-i91">
                                      On file: {item.duplicateCheck.existing_certificate.certificate_number ? `${item.duplicateCheck.existing_certificate.certificate_number} · ` : ''}valid {fmtDate(item.duplicateCheck.existing_certificate.issue_date)} to {fmtDate(item.duplicateCheck.existing_certificate.expiry_date, item.duplicateCheck.existing_certificate.has_no_expiry)}
                                      {item.duplicateCheck.existing_certificate.filename ? ` • File: ${item.duplicateCheck.existing_certificate.filename}` : ''}
                                    </div>
                                    <div className="add-certificate-modal-i92">
                                      {item.duplicateCheck.match_type === 'exact_duplicate' && (
                                        <>
                                          <label className="add-certificate-modal-i93">
                                            <input
                                              type="radio"
                                              name={`dup-choice-${item.id}`}
                                              checked={item.dupChoice === 'replace'}
                                              onChange={() => updateBulkItem(item.id, { dupChoice: 'replace' })}
                                            />
                                            Replace existing file (recommended)
                                          </label>
                                          <label className="add-certificate-modal-i93">
                                            <input
                                              type="radio"
                                              name={`dup-choice-${item.id}`}
                                              checked={item.dupChoice === 'separate'}
                                              onChange={() => updateBulkItem(item.id, { dupChoice: 'separate' })}
                                            />
                                            Add as additional certificate
                                          </label>
                                        </>
                                      )}
                                      {item.duplicateCheck.match_type === 'renewal' && (
                                        <>
                                          <label className="add-certificate-modal-i93">
                                            <input
                                              type="radio"
                                              name={`dup-choice-${item.id}`}
                                              checked={item.dupChoice === 'renew'}
                                              onChange={() => updateBulkItem(item.id, { dupChoice: 'renew' })}
                                            />
                                            Renew & archive previous (recommended)
                                          </label>
                                          <label className="add-certificate-modal-i93">
                                            <input
                                              type="radio"
                                              name={`dup-choice-${item.id}`}
                                              checked={item.dupChoice === 'separate'}
                                              onChange={() => updateBulkItem(item.id, { dupChoice: 'separate' })}
                                            />
                                            Add as separate certificate
                                          </label>
                                        </>
                                      )}
                                      {item.duplicateCheck.match_type === 'older_version' && (
                                        <label className="add-certificate-modal-i93">
                                          <input
                                            type="radio"
                                            name={`dup-choice-${item.id}`}
                                            checked={true}
                                            readOnly
                                          />
                                          Add anyway as separate certificate
                                        </label>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* File Upload Zone - Compact & Responsive */}
              <div>
                <input
                  id="cert-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="add-certificate-modal-i25"
                  disabled={busy || extracting}
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesSelected(Array.from(e.target.files));
                    }
                  }}
                />
                {extracting ? (
                  <div
                    className="add-certificate-modal-i94" style={{ border: `1.5px dashed ${clay.accent}`, borderRadius: 8, background: 'rgba(14, 116, 144, 0.04)' }}
                  >
                    <Icon iconName="ProgressRingDots" className="add-certificate-modal-i15" style={{ color: clay.accent }} />
                    <span className="add-certificate-modal-i95" style={{ color: clay.accent }}>
                      Reading certificate & auto-detecting details...
                    </span>
                  </div>
                ) : file ? (
                  <div
                    className="add-certificate-modal-i96" style={{ borderRadius: 10, border: `1.5px solid ${clay.accent}` }}
                  >
                    <div className="add-certificate-modal-i97" style={{ minWidth: 0 }}>
                      <div
                        className="add-certificate-modal-i98" style={{ borderRadius: 8, background: 'rgba(14, 116, 144, 0.12)' }}
                      >
                        <Icon iconName="PDF" className="add-certificate-modal-i99" style={{ color: clay.accent }} />
                      </div>
                      <div className="add-certificate-modal-i51" style={{ minWidth: 0 }}>
                        <div className="add-certificate-modal-i100">
                          {file.name}
                        </div>
                        <div className="add-certificate-modal-i101">
                          {(file.size / 1024).toFixed(1)} KB • Document attached
                        </div>
                      </div>
                    </div>
                    <div className="add-certificate-modal-i102">
                      <button
                        type="button"
                        onClick={() => document.getElementById('cert-file-input')?.click()}
                        disabled={busy}
                        className="add-certificate-modal-i103" style={{ background: 'var(--vdms-surface)', color: 'var(--vdms-text)', borderRadius: 6 }}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setExtractedSummary(null);
                          setExtractedItems([]);
                          setUnmatchedCertNotice(null);
                          const fi = document.getElementById('cert-file-input') as HTMLInputElement | null;
                          if (fi) fi.value = '';
                        }}
                        disabled={busy}
                        className="add-certificate-modal-i104" style={{ color: clay.pillDangerText }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (file) {
                            switchToBulkWithFiles([file]);
                          }
                        }}
                        disabled={busy}
                        className="add-certificate-modal-i103" style={{ background: 'var(--vdms-surface)', color: clay.accent, borderRadius: 6 }}
                        title="Convert to bulk staging and add more certificate files"
                      >
                        + Add More to Batch
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (busy || extracting) return;
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleFilesSelected(Array.from(e.dataTransfer.files));
                      }
                    }}
                    className="add-certificate-modal-i105" style={{ borderRadius: 10, background: 'rgba(14, 116, 144, 0.02)', cursor: busy || extracting ? 'default' : 'pointer' }}
                    onClick={() => {
                      if (!busy && !extracting) {
                        document.getElementById('cert-file-input')?.click();
                      }
                    }}
                  >
                    <Icon
                      iconName="CloudUpload"
                      className="add-certificate-modal-i106"
                    />
                    <div className="add-certificate-modal-i107">
                      Drop certificate document(s) here or click to browse
                    </div>
                    <div className="add-certificate-modal-i108">
                      Drop 1 file for standard single review, or multiple files for automated bulk batch scanning
                    </div>
                  </div>
                )}
              </div>

              {/* Option to manually enter details without uploading a file */}
              {!showFormFields && (
                <div className="add-certificate-modal-i109">
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="add-certificate-modal-i110" style={{ color: clay.accent }}
                  >
                    Or enter certificate details manually without file →
                  </button>
                  <span className="add-certificate-modal-i111">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBulkMode(true);
                      const fileInput = document.getElementById('cert-bulk-add-more') as HTMLInputElement | null;
                      fileInput?.click();
                    }}
                    className="add-certificate-modal-i110" style={{ color: clay.accent }}
                  >
                    Or select multiple files for bulk upload →
                  </button>
                </div>
              )}

              {/* Prominent Duplicate / Renewal Banner in Single Mode */}
              {duplicate && duplicate.existing_certificate && (() => {
                const ex = duplicate.existing_certificate;
                const kind = duplicate.match_type;
                const tone = kind === 'renewal'
                  ? { bg: 'rgba(16, 124, 65, 0.08)', border: 'rgba(16, 124, 65, 0.35)', fg: '#107c41', icon: 'Sync', title: 'Certificate renewal detected' }
                  : kind === 'exact_duplicate'
                    ? { bg: 'rgba(185, 28, 28, 0.07)', border: 'rgba(185, 28, 28, 0.35)', fg: '#b91c1c', icon: 'Warning', title: 'This certificate is already on file' }
                    : { bg: 'rgba(180, 83, 9, 0.08)', border: 'rgba(180, 83, 9, 0.35)', fg: '#b45309', icon: 'Warning', title: 'A newer certificate is already on file' };
                const matchDesc = duplicate.matched_on === 'certificate_number' ? 'Matching Certificate Number' : duplicate.matched_on === 'filename' ? 'Matching File Name' : 'Matching Certificate Type';
                const exLabel = `${ex.certificate_number ? ex.certificate_number + ' · ' : ''}valid ${fmtDate(ex.issue_date)} to ${fmtDate(ex.expiry_date, ex.has_no_expiry)}`;
                const choices: Array<{ value: DuplicateChoice; label: string; hint: string }> = kind === 'renewal'
                  ? [
                      { value: 'renew', label: 'Renew and archive the previous version (recommended)', hint: 'The old details and file move to its version history.' },
                      { value: 'separate', label: 'Add as a separate certificate', hint: 'Keeps both active.' },
                    ]
                  : kind === 'exact_duplicate'
                    ? [
                      { value: 'replace', label: 'Replace the file only (recommended)', hint: 'Keeps the existing record and swaps in this document.' },
                      { value: 'separate', label: 'Add as an additional certificate', hint: 'For example a second crane or licence of the same type.' },
                    ]
                  : [
                      { value: 'separate', label: 'Add it anyway as a separate certificate', hint: 'Both stay active; the newer one is not touched.' },
                    ];
                return (
                  <div
                    role="group"
                    aria-label="Existing certificate found"
                    className="add-certificate-modal-i112" style={{ background: tone.bg, border: `1.5px solid ${tone.border}`, borderRadius: 8 }}
                  >
                    <div className="add-certificate-modal-i113" style={{ color: tone.fg }}>
                      <Icon iconName={tone.icon} aria-hidden="true" className="add-certificate-modal-i114" /> {tone.title}
                      <span className="add-certificate-modal-i115">
                        ({matchDesc})
                      </span>
                    </div>
                    <div className="add-certificate-modal-i116">
                      <strong>Active record on file:</strong> {exLabel}
                      {ex.filename ? ` • File: ${ex.filename}` : ''}
                      {(issueDate || expiryDate) && (
                        <span className="add-certificate-modal-i117">
                          This document: {fmtDate(issueDate)} to {fmtDate(expiryDate, hasNoExpiry)}
                        </span>
                      )}
                    </div>
                    <div className="add-certificate-modal-i118">
                      {choices.map(c => (
                        <label
                          key={c.value}
                          className="add-certificate-modal-i119" style={{ cursor: busy ? 'default' : 'pointer', borderRadius: 6, background: dupChoice === c.value ? 'rgba(255,255,255,0.7)' : 'transparent', border: dupChoice === c.value ? `1px solid ${tone.border}` : '1px solid transparent' }}
                        >
                          <input
                            type="radio"
                            name="cert-dup-choice"
                            checked={dupChoice === c.value}
                            onChange={() => setDupChoice(c.value)}
                            disabled={busy}
                            className="add-certificate-modal-i11"
                          />
                          <span>
                            <span className="add-certificate-modal-i84">{c.label}</span>
                            <span className="add-certificate-modal-i120">{c.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="add-certificate-modal-i121">
                      Not what you meant? Use Cancel to leave without saving.
                    </div>
                  </div>
                );
              })()}

              {showFormFields && (
                <>
                  {/* 1. Target Vessel * (FIRST) */}
                  <SearchableSelect
                    label="Target Vessel *"
                    options={vesselSelectOptions}
                    selectedKey={vesselId}
                    onChange={key => setVesselId(key)}
                    placeholder="Choose target vessel..."
                    disabled={busy}
                  />

                  {/* 2. Certificate Type * (SECOND - after Target Vessel) */}
                  <div className="add-certificate-modal-i122">
                    <div className="add-certificate-modal-i123">
                      <div className="add-certificate-modal-i19">
                        <label className="add-certificate-modal-i124">
                          Certificate Type *
                        </label>
                        {unmatchedCertNotice && (
                          <span
                            className="add-certificate-modal-i125" style={{ color: '#b45309', background: 'rgba(217, 119, 6, 0.12)' }}
                          >
                            ⚠️ Not in Catalog
                          </span>
                        )}
                      </div>
                      {!unmatchedCertNotice && (
                        <button
                          type="button"
                          onClick={() => setShowCreateTypeModal(true)}
                          className="add-certificate-modal-i126" style={{ color: clay.accent }}
                        >
                          <Icon iconName="Add" className="add-certificate-modal-i127" /> New Type
                        </button>
                      )}
                    </div>
                    <SearchableSelect
                      options={masterSelectOptions}
                      selectedKey={masterId}
                      onChange={key => handleMasterChange(Number(key))}
                      placeholder="Choose certificate type..."
                      disabled={busy}
                    />

                    {/* Direct Alert when certificate type is not in catalog */}
                    {unmatchedCertNotice && (
                      <div
                        className="add-certificate-modal-i128" style={{ borderRadius: 8, background: 'rgba(217, 119, 6, 0.08)', color: '#b45309' }}
                      >
                        <div className="add-certificate-modal-i129" style={{ minWidth: 0 }}>
                          <Icon iconName="Warning" className="add-certificate-modal-i130" />
                          <span className="add-certificate-modal-i131">
                            <strong>"{suggestedTypeName || 'Certificate Type'}"</strong> is not present in database. Click Add Type to create it.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCreateTypeModal(true)}
                          className="add-certificate-modal-i132" style={{ background: '#d97706', color: '#ffffff', borderRadius: 6 }}
                        >
                          <Icon iconName="Add" className="add-certificate-modal-i24" /> Add Type
                        </button>
                      </div>
                    )}

                    {vesselMatchStatus && (
                      <div
                        className="add-certificate-modal-i133" style={{ background: vesselMatchStatus.isApplicable ? '#f0fdf4' : '#fffbeb', border: `1px solid ${vesselMatchStatus.isApplicable ? '#bbf7d0' : '#fde68a'}`, color: vesselMatchStatus.isApplicable ? '#166534' : '#92400e' }}
                      >
                        <Icon
                          iconName={vesselMatchStatus.isApplicable ? 'CheckMark' : 'Warning'}
                          className="add-certificate-modal-i24" style={{ color: vesselMatchStatus.isApplicable ? '#16a34a' : '#d97706' }}
                        />
                        <span>{vesselMatchStatus.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Auto-Detected Document Findings (Existing Clean Layout) */}
                  {extractedItems.length > 0 && !extracting && (
                    <div
                      className="add-certificate-modal-i134" style={{ borderRadius: 8, background: 'rgba(16, 124, 65, 0.06)' }}
                    >
                      <div className="add-certificate-modal-i135">
                        <div className="add-certificate-modal-i136">
                          <Icon iconName="CompletedSolid" className="add-certificate-modal-i89" />
                          <span>Auto-Detected Document Findings:</span>
                        </div>
                        <span className="add-certificate-modal-i137">Auto-filled in form below</span>
                      </div>
                      <div className="add-certificate-modal-i138" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                        {extractedItems.map((item, idx) => {
                          const isFullWidth = item.label.includes('Vessel') || item.label === 'Certificate Type' || item.value.length > 30;
                          const isVessel = item.label.includes('Vessel');
                          return (
                            <div
                              key={idx}
                              className="add-certificate-modal-i139" style={{ gridColumn: isFullWidth ? '1 / -1' : undefined }}
                            >
                              <span className="add-certificate-modal-i82" style={{ color: item.isWarning ? '#d97706' : '#107c41' }}>•</span>
                              <span className="add-certificate-modal-i140">{item.label}:</span>
                              <span
                                className="add-certificate-modal-i141" style={{ color: item.isWarning ? '#b45309' : 'var(--vdms-text)', whiteSpace: isVessel ? 'nowrap' : 'normal', wordBreak: isVessel ? 'normal' : 'break-word' }}
                              >
                                {item.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. Certificate Number & Issuing Authority */}
                  <div className="add-certificate-modal-i142" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                    <div>
                      <div className="add-certificate-modal-i143">
                        <label className="add-certificate-modal-i124">
                          Certificate Number
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. 23SN0018-SAFCON"
                        value={certificateNumber}
                        onChange={e => setCertificateNumber(e.target.value)}
                        disabled={busy}
                        style={{ ...dmsControlStyle(), width: '100%', height: 34, boxSizing: 'border-box', fontSize: 12 }}
                      />
                    </div>
                    <div>
                      <div className="add-certificate-modal-i143">
                        <label className="add-certificate-modal-i124">
                          Issuing Authority *
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. ClassNK / DNV / Flag"
                        value={issuingAuthority}
                        onChange={e => setIssuingAuthority(e.target.value)}
                        disabled={busy}
                        style={{ ...dmsControlStyle(), width: '100%', height: 34, boxSizing: 'border-box', fontSize: 12 }}
                      />
                    </div>
                  </div>

                  {/* 5. Issue Date & Expiry Date with Permanent Validity Toggle - Perfectly Aligned */}
                  <div className="add-certificate-modal-i142" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                    <div>
                      <div className="add-certificate-modal-i143">
                        <label className="add-certificate-modal-i124">
                          Issue Date *
                        </label>
                      </div>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={e => handleIssueDateChange(e.target.value)}
                        disabled={busy}
                        style={{ ...dmsControlStyle(), width: '100%', height: 34, boxSizing: 'border-box', fontSize: 12 }}
                      />
                    </div>
                    <div>
                      <div className="add-certificate-modal-i144">
                        <label className="add-certificate-modal-i124">
                          Expiry Date {!hasNoExpiry && '*'}
                        </label>
                        <label className="add-certificate-modal-i145" style={{ color: hasNoExpiry ? clay.accent : 'var(--vdms-text-muted)' }}>
                          <input
                            type="checkbox"
                            checked={hasNoExpiry}
                            onChange={e => setHasNoExpiry(e.target.checked)}
                            disabled={busy}
                            className="add-certificate-modal-i146" style={{ width: 13, accentColor: clay.accent }}
                          />
                          Permanent / No Expiry
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
                          height: 34,
                          boxSizing: 'border-box',
                          fontSize: 12,
                          opacity: hasNoExpiry ? 0.35 : 1,
                          background: hasNoExpiry ? 'var(--vdms-surface-alt)' : undefined,
                        }}
                      />
                      {dateError && (
                        <div className="add-certificate-modal-i147" style={{ color: clay.pillDangerText }}>{dateError}</div>
                      )}
                    </div>
                  </div>

                  {/* 6. Responsible Person */}
                  <div>
                    <div className="add-certificate-modal-i143">
                      <label className="add-certificate-modal-i124">
                        Responsible Person / Department
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Technical Superintendent / DPA"
                      value={responsiblePerson}
                      onChange={e => setResponsiblePerson(e.target.value)}
                      disabled={busy}
                      style={{ ...dmsControlStyle(), width: '100%', height: 34, boxSizing: 'border-box', fontSize: 12 }}
                    />
                  </div>
                </>
              )}
            </>
          )}
          </div>

          {/* Footer Actions (Compact) */}
          <div
            className="add-certificate-modal-i148" style={{ justifyContent: isBulkMode ? 'space-between' : 'flex-end' }}
          >
            {isBulkMode ? (
              <>
                <div className="add-certificate-modal-i17">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Clear all staged files and return to single certificate upload?')) {
                        resetForm();
                      }
                    }}
                    disabled={bulkSaving}
                    className="add-certificate-modal-i149" style={{ color: clay.accent }}
                  >
                    ← Clear & Return to Single Mode
                  </button>
                  <span className="add-certificate-modal-i150">•</span>
                  <span className="add-certificate-modal-i150">
                    {bulkItems.length} file(s) staged
                  </span>
                </div>
                <div className="add-certificate-modal-i4">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={bulkSaving}
                    style={{ ...dmsBtn('secondary'), height: 32, padding: '0 16px', fontSize: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkSave}
                    disabled={bulkSaving || isProcessingQueueRef.current || bulkItems.length === 0}
                    style={{
                      ...dmsBtn('primary', !bulkSaving && !isProcessingQueueRef.current && bulkItems.length > 0),
                      height: 32,
                      padding: '0 20px',
                      fontSize: 12,
                      gap: 6,
                    }}
                  >
                    {bulkSaving ? (
                      <>
                        <Icon iconName="ProgressRingDots" className="add-certificate-modal-i29" />
                        <span>Saving Certificates...</span>
                      </>
                    ) : (
                      <>
                        <Icon iconName="CloudUpload" className="add-certificate-modal-i29" />
                        <span>Save All Certificates ({bulkItems.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={busy}
                  style={{ ...dmsBtn(uploadWarning ? 'primary' : 'secondary', !uploadWarning), height: 32, padding: '0 16px', fontSize: 12 }}
                >
                  {uploadWarning ? 'Close' : 'Cancel'}
                </button>
                {!uploadWarning && showFormFields && (
                  <button
                    type="submit"
                    disabled={busy || loadingOptions}
                    style={{ ...dmsBtn('primary', !busy && !loadingOptions), height: 32, padding: '0 18px', fontSize: 12 }}
                  >
                    {busy ? 'Saving...' : duplicate && dupChoice === 'renew' ? 'Renew Certificate' : duplicate && dupChoice === 'replace' ? 'Replace File' : 'Add Certificate'}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>

      <CertificateApprovalSentModal
        isOpen={Boolean(approvalSentInfo || bulkApprovalSummary)}
        routingInfo={approvalSentInfo}
        bulkSummary={bulkApprovalSummary}
        onClose={() => {
          setApprovalSentInfo(null);
          setBulkApprovalSummary(null);
          handleClose();
        }}
      />

      <CreateCertificateTypeModal
        host={host}
        isOpen={showCreateTypeModal}
        initialName={suggestedTypeName}
        onClose={() => {
          setShowCreateTypeModal(false);
          setRowTargetForCreateType(null);
        }}
        onSuccess={newMaster => {
          setMasters(prev => {
            const exists = prev.some(m => m.id === newMaster.id);
            return exists ? prev : [...prev, newMaster];
          });

          if (rowTargetForCreateType) {
            setBulkItems(prev => prev.map(r => {
              if (r.id !== rowTargetForCreateType) return r;
              const updatedFindings = [
                ...(r.extractedFindings || []).filter(f => f.label !== 'Detected Type' && f.label !== 'Certificate Type'),
                { label: 'Certificate Type', value: newMaster.name },
              ];
              const updatedUndetected = (r.undetectedFields || []).filter(f => f !== 'Certificate Type');
              return {
                ...r,
                masterId: Number(newMaster.id),
                masterName: newMaster.name,
                issuingAuthority: r.issuingAuthority || newMaster.issuing_authority || '',
                unmatchedCertNotice: undefined,
                suggestedTypeName: undefined,
                extractedFindings: updatedFindings,
                undetectedFields: updatedUndetected,
              };
            }));
            setRowTargetForCreateType(null);
          } else {
            setMasterId(Number(newMaster.id));
            setUnmatchedCertNotice(null);
            setSuggestedTypeName('');
            if (newMaster.issuing_authority) {
              setIssuingAuthority(newMaster.issuing_authority);
            }
            const updateCertTypeInItems = (prev: ExtractedItem[]): ExtractedItem[] => {
              const hasCertType = prev.some(item => item.label === 'Certificate Type');
              if (hasCertType) {
                return prev.map(item =>
                  item.label === 'Certificate Type' ? { label: 'Certificate Type', value: newMaster.name } : item
                );
              }
              const vesselIdx = prev.findIndex(item => item.label.includes('Vessel'));
              if (vesselIdx >= 0) {
                const updated = [...prev];
                updated.splice(vesselIdx + 1, 0, { label: 'Certificate Type', value: newMaster.name });
                return updated;
              }
              return [{ label: 'Certificate Type', value: newMaster.name }, ...prev];
            };
            setExtractedItems(prev => updateCertTypeInItems(prev));
            setSingleExtractedFindings(prev => updateCertTypeInItems(prev));
            setSingleUndetectedFields(prev => prev.filter(u => !u.toLowerCase().includes('certificate type')));
          }
        }}
      />
    </div>,
    document.body
  );
}
