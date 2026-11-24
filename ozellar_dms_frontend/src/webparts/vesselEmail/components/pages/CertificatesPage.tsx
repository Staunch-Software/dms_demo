import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import {
  DmsPageHeader,
  dmsBtn,
  dmsTone,
  dmsControlStyle,
  DMS_FONT_DISPLAY,
  DMS_TABLE_CARD,
  DMS_TABLE,
  DMS_TH,
  DMS_TR,
  DMS_TD,
  DMS_ON_ACCENT,
} from '../dmsDesignSystem';
import { isMobileWidth, isTabletOrBelow } from '../responsive';
import { AddCertificateModal } from '../modals/AddCertificateModal';
import { RenewCertificateModal } from '../modals/RenewCertificateModal';
import { CertificateHistoryModal } from '../modals/CertificateHistoryModal';
import { EditCertificateModal } from '../modals/EditCertificateModal';
import { VesselChecklistView } from './VesselChecklistView';
import { SearchableSelect } from '../SearchableSelect';
import { VesselMultiSelect } from '../VesselMultiSelect';
import { CategoryMultiSelect } from '../CategoryMultiSelect';

export const CERT_ABBREVIATIONS: Record<string, string> = {
  'Anti-Fouling System Certificate': 'AFS',
  'Anti-Fouling System Certificate (AFS)': 'AFS',
  'Ballast Water Management Certificate': 'BWM',
  'Ballast Water Management Certificate (BWM)': 'BWM',
  'International Air Pollution Prevention Certificate': 'IAPP',
  'International Air Pollution Prevention Certificate (IAPP)': 'IAPP',
  'International Energy Efficiency Certificate': 'IEEC',
  'International Energy Efficiency Certificate (IEEC)': 'IEEC',
  'International Oil Pollution Prevention Certificate': 'IOPP',
  'International Oil Pollution Prevention Certificate (IOPP)': 'IOPP',
  'International Sewage Pollution Prevention Certificate': 'ISPP',
  'International Sewage Pollution Prevention Certificate (ISPP)': 'ISPP',
  'Cargo Ship Safety Construction Certificate': 'SAFCON',
  'Cargo Ship Safety Equipment Certificate': 'SAFEQ',
  'Cargo Ship Safety Radio Certificate': 'SAFRAD',
  'Safety Management Certificate (SMC)': 'SMC',
  'Safety Management Certificate': 'SMC',
  'Document of Compliance (DOC)': 'DOC',
  'Document of Compliance': 'DOC',
  'International Ship Security Certificate (ISSC)': 'ISSC',
  'International Ship Security Certificate': 'ISSC',
  'Maritime Labour Certificate (MLC)': 'MLC',
  'Maritime Labour Certificate': 'MLC',
  'International Load Line Certificate': 'ILLC',
  'International Load Line Certificate (ILLC)': 'ILLC',
  'International Tonnage Certificate': 'ITC',
  'International Tonnage Certificate (ITC)': 'ITC',
  'Minimum Safe Manning Document': 'MSMD',
  'Continuous Synopsis Record (CSR)': 'CSR',
  'Continuous Synopsis Record': 'CSR',
  'Cargo Securing Manual Approval': 'CSM',
  'Ship Energy Efficiency Management Plan (SEEMP)': 'SEEMP',
  'Ship Energy Efficiency Management Plan': 'SEEMP',
  'Garbage Management Plan Certificate': 'GMP',
  'Statements of Compliance (SOC)': 'SOC',
  'Engine International Air Pollution Prevention Certificate': 'EIAPP',
  'Engine International Air Pollution Prevention': 'EIAPP',
  'Certificate of Class - Hull': 'Class Hull',
  'Certificate of Class - Machinery': 'Class Mach',
  'Certificate of Registry': 'Registry',
  'Radio Station License': 'Radio Lic',
  'Civil Liability Convention Certificate (CLC)': 'CLC',
  'Civil Liability Convention Certificate': 'CLC',
  'Bunker Convention Certificate (BCC)': 'BCC',
  'Bunker Convention Certificate': 'BCC',
  'Wreck Removal Convention Certificate (WRC)': 'WRC',
  'Wreck Removal Convention Certificate': 'WRC',
  'Inventory of Hazardous Materials (IHM)': 'IHM',
};

export function getCertificateAbbreviation(fullName: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (CERT_ABBREVIATIONS[trimmed]) return CERT_ABBREVIATIONS[trimmed];

  const match = trimmed.match(/\(([A-Z0-9-]{2,10})\)/);
  if (match) return match[1];

  for (const [key, abbr] of Object.entries(CERT_ABBREVIATIONS)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(trimmed.toLowerCase())) {
      return abbr;
    }
  }

  if (trimmed.length <= 10) return trimmed;

  const words = trimmed.replace(/Certificate|Doc|Document|International/gi, '').trim().split(/\s+/);
  if (words.length >= 2) {
    const acronym = words.map(w => w[0]?.toUpperCase()).join('');
    if (acronym.length >= 2 && acronym.length <= 6) return acronym;
  }

  return trimmed.substring(0, 8);
}

interface KpiStats {
  overdue: number;
  due_7_days: number;
  due_30_days: number;
  due_90_days: number;
  missing_required: number;
  valid: number;
  total: number;
}

interface CertificateItem {
  id: number;
  vessel_id: number;
  vessel_name: string;
  vessel_imo?: string | null;
  vessel_type?: string | null;
  certificate_master_id: number;
  certificate_name: string;
  category: string;
  sub_category?: string | null;
  certificate_number?: string | null;
  issuing_authority?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  has_no_expiry?: boolean;
  default_validity_years?: number | null;
  default_validity_months?: number | null;
  responsible_person?: string | null;
  endorsement_date?: string | null;
  days_to_expiry?: number | null;
  status: 'valid' | 'due_soon' | 'overdue' | 'missing' | string;
  sharepoint_file_url?: string | null;
  sharepoint_item_id?: string | null;
  filename?: string | null;
}

interface MatrixColumn {
  id: number;
  name: string;
  category: string;
}

interface MatrixRow {
  vessel_id: number;
  vessel_name: string;
  vessel_imo?: string;
  vessel_type?: string;
  compliance_rate: number;
  required_count: number;
  valid_count: number;
  mandatory_held?: number;
  mandatory_total?: number;
  optional_held?: number;
  optional_total?: number;
  na_count?: number;
  combined_held?: number;
  combined_total?: number;
  count_valid?: number;
  count_due_7?: number;
  count_due_30?: number;
  count_due_90?: number;
  count_overdue?: number;
  certificates: Array<{
    certificate_master_id: number;
    certificate_name: string;
    category: string;
    status: 'valid' | 'due_soon' | 'overdue' | 'missing';
    certificate?: { id: number; expiry: string | null; url?: string | null } | null;
  }>;
}

export function CertificatesPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<'list' | 'matrix' | 'checklist'>('list');

  // KPI counts
  const [kpis, setKpis] = React.useState<KpiStats>({
    overdue: 0,
    due_7_days: 0,
    due_30_days: 0,
    due_90_days: 0,
    missing_required: 0,
    valid: 0,
    total: 0,
  });

  // Filter states
  const [selectedKpiFilter, setSelectedKpiFilter] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Site options derived from host documentSites
  const siteOptions = React.useMemo(() => {
    const rawSites = (host.state.documentSites || []).filter((s: any) => {
      const key = String(s.site_key || s.site_id || s.sp_site_name || '').toLowerCase();
      return !key.includes('personal') && !key.includes('search');
    });
    const map = new Map<string, any>();
    rawSites.forEach((s: any) => {
      const k = String(s.site_key || s.site_id || s.sp_site_name || '').toLowerCase();
      if (!map.has(k)) map.set(k, s);
    });
    return [
      { key: 'all', label: 'All SharePoint Sites' },
      ...Array.from(map.values()).map((s: any) => ({
        key: String(s.site_key || s.site_id || s.sp_site_name || ''),
        label: s.sp_site_name || s.site_key || s.site_id || 'SharePoint Site',
      })),
    ];
  }, [host.state.documentSites]);

  // Fixed permanently to ozellardms — all certificates are stored on OzellarDMS.
  const certificateSiteFilter: string = 'ozellardms';

  // Vessel filter is multi-select. null = every vessel (the default); otherwise the chosen vessel ids.
  const [vesselSel, setVesselSel] = React.useState<string[] | null>(null);
  const registeredVessels = React.useMemo(() => {
    const siteLow = (certificateSiteFilter || 'all').trim().toLowerCase();
    return (host.state.vessels || [])
      .filter((v: any) => v.source !== 'sharepoint' && /^\d+$/.test(String(v.id)))
      .filter((v: any) => {
        if (siteLow === 'all') return true;
        const sk = String(v.provisioned_site_key || '').trim().toLowerCase();
        const sids = (v.provisioned_site_ids || []).map((s: any) => String(s).trim().toLowerCase());
        return sk === siteLow || sids.includes(siteLow) || sk.includes(siteLow) || sids.some((s: string) => s.includes(siteLow));
      });
  }, [host.state.vessels, certificateSiteFilter]);
  const allVesselIds = React.useMemo(() => registeredVessels.map((v: any) => String(v.id)), [registeredVessels]);
  const selectedVesselIds: string[] = vesselSel === null ? allVesselIds : vesselSel;
  const vesselSelKey = vesselSel === null ? 'all' : vesselSel.join(',');
  // The server filters on a single vessel only; with several vessels chosen we load all and narrow client-side.
  const vesselFilter = vesselSel !== null && vesselSel.length === 1 ? vesselSel[0] : 'all';

  // Certificate items & matrix
  const [certificates, setCertificates] = React.useState<CertificateItem[]>([]);
  const [matrixData, setMatrixData] = React.useState<{ columns: MatrixColumn[]; rows: MatrixRow[] }>({
    columns: [],
    rows: [],
  });

  // Category options: dynamically derived from active certificate types only.
  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    matrixData.columns.forEach(c => {
      const cat = (c.category || '').trim();
      if (cat) set.add(cat);
    });
    certificates.forEach(c => {
      const cat = (c.category || '').trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort();
  }, [matrixData.columns, certificates]);

  // Category filter is multi-select. null = every category (the default); otherwise the chosen categories.
  const [categorySel, setCategorySel] = React.useState<string[] | null>(null);
  const selectedCategoryKeys: string[] = categorySel === null ? categoryOptions : categorySel;
  const categorySelKey = categorySel === null ? 'all' : categorySel.join(',');
  const categoryFilter = categorySel !== null && categorySel.length === 1 ? categorySel[0] : (categorySel === null ? 'all' : categorySel.join(','));
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modal dialog states
  const [addModalOpen, setAddModalOpen] = React.useState<boolean>(false);
  const [renewingCert, setRenewingCert] = React.useState<CertificateItem | null>(null);
  const [historyCert, setHistoryCert] = React.useState<CertificateItem | null>(null);
  const [editingCert, setEditingCert] = React.useState<CertificateItem | null>(null);
  const [modalInitialMode, setModalInitialMode] = React.useState<'view' | 'edit'>('edit');
  const [openActionMenuId, setOpenActionMenuId] = React.useState<number | null>(null);

  // Close actions dropdown menu on outside click
  React.useEffect(() => {
    if (openActionMenuId === null) return;
    const handleDocClick = (): void => setOpenActionMenuId(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openActionMenuId]);
  // Add opened from the vessel checklist: vessel and certificate type already chosen
  const [addPreset, setAddPreset] = React.useState<{ vesselId: number; masterId: number } | null>(null);
  const [checklistRefreshKey, setChecklistRefreshKey] = React.useState<number>(0);
  const [isExportingExcel, setIsExportingExcel] = React.useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = React.useState<boolean>(false);

  // Delete is for admins; the backend enforces it too.
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`${host._base()}/api/settings-tab-settings/config`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!cancelled) setIsAdmin(!!d?.is_admin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const windowWidth = host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isMobile = isMobileWidth(windowWidth);
  const isTablet = isTabletOrBelow(windowWidth);

  // Keep vessels updated when site changes or page refreshes
  const reloadVesselsForSite = React.useCallback(async (siteKey: string) => {
    try {
      const url = `${host._base()}/api/vessels${siteKey && siteKey !== 'all' ? `?site_key=${encodeURIComponent(siteKey)}` : ''}`;
      const res = await fetch(url, { headers: host._headers(), cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && typeof host.setState === 'function') {
          host.setState({ vessels: data });
        }
      }
    } catch {
      // ignore
    }
  }, [host]);

  // Site filter is fixed to ozellardms — all certificates are stored on OzellarDMS.

  // Fetch KPI statistics
  const fetchKpis = React.useCallback(async () => {
    try {
      const kpiUrl = (vid: string | null): string => {
        const p = new URLSearchParams();
        if (vid) p.append('vessel_id', vid);
        if (certificateSiteFilter && certificateSiteFilter !== 'all') {
          p.append('site_key', certificateSiteFilter);
        }
        const qs = p.toString() ? `?${p.toString()}` : '';
        return `${host._base()}/api/certificates/kpis${qs}`;
      };
      let data: any = null;
      if (vesselSel !== null && vesselSel.length !== 1) {
        // Several (or no) vessels: add up each vessel's counts.
        const parts = await Promise.all(vesselSel.map(async vid => {
          const r = await fetch(kpiUrl(vid), { headers: host._headers(), cache: 'no-store' });
          return r.ok ? r.json() : {};
        }));
        const sum = (keys: string[]): number => parts.reduce((t: number, p: any) => t + Number(keys.map(k => p?.[k]).filter(v => v !== undefined)[0] ?? 0), 0);
        data = {
          overdue: sum(['overdue']), due_7_days: sum(['due_7_days', 'due_in_7']), due_30_days: sum(['due_30_days', 'due_in_30']),
          due_90_days: sum(['due_90_days', 'due_in_90']), missing_required: sum(['missing_required', 'missing']),
          valid: sum(['valid']), total_certificates: sum(['total_certificates', 'total']),
        };
      } else {
        const res = await fetch(kpiUrl(vesselFilter !== 'all' ? vesselFilter : null), { headers: host._headers(), cache: 'no-store' });
        if (res.ok) data = await res.json();
      }
      if (data) {
        setKpis({
          overdue: Number(data.overdue ?? 0),
          due_7_days: Number(data.due_7_days ?? data.due_in_7 ?? 0),
          due_30_days: Number(data.due_30_days ?? data.due_in_30 ?? 0),
          due_90_days: Number(data.due_90_days ?? data.due_in_90 ?? 0),
          missing_required: Number(data.missing_required ?? data.missing ?? 0),
          valid: Number(data.valid ?? 0),
          total: Number(data.total_certificates ?? data.total ?? 0),
        });
      }
    } catch {
      // Keep previous KPI values on transient network error
    }
  }, [host, vesselSelKey, certificateSiteFilter]);

  // Fetch Certificates list
  const fetchCertificates = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (certificateSiteFilter && certificateSiteFilter !== 'all') {
        params.append('site_key', certificateSiteFilter);
      }
      if (vesselFilter !== 'all') params.append('vessel_id', vesselFilter);
      if (categorySel !== null && categorySel.length > 0 && categorySel.length < categoryOptions.length) {
        params.append('category', categorySel.join(','));
      }
      if (selectedKpiFilter) params.append('status', selectedKpiFilter);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${host._base()}/api/certificates${qs}`, {
        headers: host._headers(),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Failed to load certificates (HTTP ${res.status})`);
      }
      const data = await res.json();
      setCertificates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error loading certificates');
    } finally {
      setLoading(false);
    }
  }, [host, vesselSelKey, categorySelKey, selectedKpiFilter, categoryOptions.length, certificateSiteFilter]);

  // Fetch Matrix
  const fetchMatrix = React.useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (certificateSiteFilter && certificateSiteFilter !== 'all') {
        p.append('site_key', certificateSiteFilter);
      }
      const qs = p.toString() ? `?${p.toString()}` : '';
      const res = await fetch(`${host._base()}/api/certificates/compliance-matrix${qs}`, {
        headers: host._headers(),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setMatrixData(data);
      }
    } catch {
      // Silently fall back
    }
  }, [host, certificateSiteFilter]);

  // Refresh all (awaits every request so the Refresh button can show progress)
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    setChecklistRefreshKey(k => k + 1);
    try {
      await Promise.all([fetchKpis(), fetchCertificates(), fetchMatrix(), reloadVesselsForSite(certificateSiteFilter)]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchKpis, fetchCertificates, fetchMatrix, reloadVesselsForSite, certificateSiteFilter]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const [syncingSharePoint, setSyncingSharePoint] = React.useState<boolean>(false);
  const handleSyncFromSharePoint = async (): Promise<void> => {
    setSyncingSharePoint(true);
    try {
      const base = host._base();
      const sk = certificateSiteFilter || 'all';
      const r = await fetch(`${base}/api/certificates/sync-sharepoint?site_key=${encodeURIComponent(sk)}`, {
        method: 'POST',
        headers: host._headers(),
      });
      if (r.ok) {
        const res = await r.json();
        const added = Number(res.new_certificates_imported ?? res.imported?.length ?? 0);
        const pruned = Number(res.pruned_deleted ?? 0);
        if (added > 0 || pruned > 0) {
          host.setState({ modalMsg: `SharePoint sync complete: ${added} new certificate(s) imported, ${pruned} deleted.` });
        } else {
          host.setState({ modalMsg: 'SharePoint sync complete: All certificates up to date.' });
        }
        setTimeout(() => host.setState({ modalMsg: null }), 4000);
      }
    } catch (e) {
      console.warn('SharePoint cert sync failed:', e);
    } finally {
      setSyncingSharePoint(false);
      void refreshAll();
    }
  };



  const handleDelete = async (cert: CertificateItem): Promise<void> => {
    const ok = window.confirm(
      `Delete "${cert.certificate_name}" for ${cert.vessel_name}?\n\nThis will permanently delete the certificate from both the database and SharePoint.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`${host._base()}/api/certificates/${cert.id}`, {
        method: 'DELETE',
        headers: host._headers(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || j?.message || `Failed to delete certificate (HTTP ${res.status})`);
      }
      host._handleSpoDocumentDeletion({
        id: `cert_${cert.id}`,
        name: cert.certificate_name,
        parentId: null,
        isFolder: false,
        serverRelativePath: `Certificates / ${cert.vessel_name} / ${cert.certificate_name}`,
        children: [],
      }, {
        deletedByEmail: host.props.userEmail || null,
        deletedByName: host.props.userDisplayName || null,
        siteName: host.state.activeDocumentSite || 'OzellarDMS',
        originalPath: `Certificates / ${cert.vessel_name}`,
      });
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Error deleting certificate');
    }
  };

  // Filter list by search query (client-side quick search)
  const filteredList = React.useMemo(() => {
    const chosen = vesselSel === null ? null : new Set(vesselSel);
    const chosenCats = categorySel === null ? null : new Set(categorySel.map(c => c.toLowerCase()));
    let base = chosen ? certificates.filter(c => chosen.has(String(c.vessel_id))) : certificates;
    if (chosenCats) {
      base = base.filter(c => c.category && chosenCats.has(c.category.toLowerCase()));
    }
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(c => {
      const matchName = (c.certificate_name || '').toLowerCase().includes(q);
      const matchVessel = (c.vessel_name || '').toLowerCase().includes(q);
      const matchImo = (c.vessel_imo || '').toLowerCase().includes(q);
      const matchNum = (c.certificate_number || '').toLowerCase().includes(q);
      const matchAuth = (c.issuing_authority || '').toLowerCase().includes(q);
      return matchName || matchVessel || matchImo || matchNum || matchAuth;
    });
  }, [certificates, searchQuery, vesselSelKey, categorySelKey]);

  // Matrix honours the same vessel / category / search controls as the list.
  const matrixView = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const columns = matrixData.columns.filter(col => {
      if (categorySel === null) return true;
      const cat = (col.category || '').toLowerCase();
      return categorySel.some(c => c.toLowerCase() === cat);
    });
    const colIds = new Set(columns.map(c => c.id));
    const rows = matrixData.rows
      .filter(r => vesselSel === null || vesselSel.indexOf(String(r.vessel_id)) !== -1)
      .filter(
        r => !q || (r.vessel_name || '').toLowerCase().includes(q) || (r.vessel_imo || '').toLowerCase().includes(q)
      )
      .map(r => {
        const certificates = r.certificates.filter(c => colIds.has(c.certificate_master_id));
        const mandHeld = r.mandatory_held ?? r.valid_count ?? 0;
        const mandTotal = r.mandatory_total ?? r.required_count ?? 0;
        const optHeld = r.optional_held ?? 0;
        const optTotal = r.optional_total ?? 0;
        const naCount = r.na_count ?? 0;
        const combinedHeld = r.combined_held ?? (mandHeld + optHeld + naCount);
        const combinedTotal = r.combined_total ?? (mandTotal + optTotal + naCount);

        // The server's rate covers every required certificate; once the matrix is narrowed by category the
        // pill must describe what is on screen (valid + due-soon count as compliant, same as the server).
        const narrowed = certificates.length !== r.certificates.length;
        if (!narrowed) {
          const complianceRate = combinedTotal > 0
            ? Math.round((combinedHeld / combinedTotal) * 1000) / 10
            : (r.compliance_rate ?? 100);
          return {
            ...r,
            certificates,
            combined_held: combinedHeld,
            combined_total: combinedTotal,
            compliance_rate: complianceRate,
          };
        }
        const required_count = certificates.length;
        const valid_count = certificates.filter(c => c.status === 'valid' || c.status === 'due_soon').length;
        const compliance_rate = required_count > 0 ? Math.round((valid_count / required_count) * 1000) / 10 : 100;
        return {
          ...r,
          certificates,
          required_count,
          valid_count,
          mandatory_held: valid_count,
          mandatory_total: required_count,
          combined_held: valid_count,
          combined_total: required_count,
          compliance_rate,
        };
      });
    return { columns, rows };
  }, [matrixData, vesselSelKey, categorySelKey, searchQuery]);

  // Fleet Compliance Totals across visible rows in Matrix View
  // Scroll synchronization between matrix body and matrix footer
  const matrixScrollRef = React.useRef<HTMLDivElement>(null);
  const matrixFooterScrollRef = React.useRef<HTMLDivElement>(null);
  const [hasMatrixVerticalScroll, setHasMatrixVerticalScroll] = React.useState(true);

  React.useEffect(() => {
    const el = matrixScrollRef.current;
    if (!el) return;
    const checkScroll = () => {
      setHasMatrixVerticalScroll(el.scrollHeight > el.clientHeight);
    };
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [matrixView.rows.length, activeTab]);

  const handleMatrixScroll = React.useCallback(() => {
    if (matrixScrollRef.current && matrixFooterScrollRef.current) {
      matrixFooterScrollRef.current.scrollLeft = matrixScrollRef.current.scrollLeft;
    }
  }, []);

  const matrixColGroup = (
    <colgroup>
      <col style={{ width: '23%', minWidth: 220 }} />
      <col style={{ width: '14%', minWidth: 120 }} />
      <col className="certificates-page-i1" style={{ minWidth: 85 }} />
      <col className="certificates-page-i1" style={{ minWidth: 85 }} />
      <col className="certificates-page-i2" style={{ minWidth: 60 }} />
      <col className="certificates-page-i3" style={{ minWidth: 70 }} />
      <col className="certificates-page-i3" style={{ minWidth: 75 }} />
      <col className="certificates-page-i3" style={{ minWidth: 75 }} />
      <col className="certificates-page-i3" style={{ minWidth: 75 }} />
      <col className="certificates-page-i3" style={{ minWidth: 75 }} />
    </colgroup>
  );

  const fleetSummary = React.useMemo(() => {
    let totalMandatoryHeld = 0;
    let totalMandatoryReq = 0;
    let totalOptionalHeld = 0;
    let totalOptionalTotal = 0;
    let totalNA = 0;
    let totalCombinedHeld = 0;
    let totalCombinedTotal = 0;
    let totalValid = 0;
    let totalDue7 = 0;
    let totalDue30 = 0;
    let totalDue90 = 0;
    let totalOverdue = 0;

    for (const r of matrixView.rows) {
      const mandHeld = r.mandatory_held ?? r.valid_count ?? 0;
      const mandTotal = r.mandatory_total ?? r.required_count ?? 0;
      const optHeld = r.optional_held ?? 0;
      const optTotal = r.optional_total ?? 0;
      const naCount = r.na_count ?? 0;
      const combHeld = r.combined_held ?? (mandHeld + optHeld + naCount);
      const combTotal = r.combined_total ?? (mandTotal + optTotal + naCount);

      totalMandatoryHeld += mandHeld;
      totalMandatoryReq += mandTotal;
      totalOptionalHeld += optHeld;
      totalOptionalTotal += optTotal;
      totalNA += naCount;
      totalCombinedHeld += combHeld;
      totalCombinedTotal += combTotal;

      totalValid += r.count_valid ?? r.valid_count ?? 0;
      totalDue7 += r.count_due_7 ?? 0;
      totalDue30 += r.count_due_30 ?? 0;
      totalDue90 += r.count_due_90 ?? 0;
      totalOverdue += r.count_overdue ?? 0;
    }

    const avgRate = totalCombinedTotal > 0
      ? Math.round((totalCombinedHeld / totalCombinedTotal) * 1000) / 10
      : (totalMandatoryReq > 0 ? Math.round((totalMandatoryHeld / totalMandatoryReq) * 1000) / 10 : 100);

    return {
      totalMandatoryHeld,
      totalMandatoryReq,
      totalOptionalHeld,
      totalOptionalTotal,
      totalNA,
      totalCombinedHeld,
      totalCombinedTotal,
      totalValid,
      totalDue7,
      totalDue30,
      totalDue90,
      totalOverdue,
      avgRate,
    };
  }, [matrixView.rows]);

  // One-click export for Fleet Compliance Matrix formatted for PSC and vetting audits (honours active filters)
  const handleExportMatrix = React.useCallback(async (format: 'excel' | 'pdf') => {
    const isExcel = format === 'excel';
    if (isExcel) setIsExportingExcel(true);
    else setIsExportingPdf(true);

    try {
      const params = new URLSearchParams();
      if (certificateSiteFilter && certificateSiteFilter !== 'all') {
        params.append('site_key', certificateSiteFilter);
      }
      // Pass the filtered vessel IDs currently visible in the matrix
      const visibleVesselIds = matrixView.rows.map(r => String(r.vessel_id));
      if (visibleVesselIds.length > 0 && visibleVesselIds.length < (allVesselIds.length || 999)) {
        params.append('vessel_ids', visibleVesselIds.join(','));
      } else if (vesselSel && vesselSel.length > 0) {
        params.append('vessel_ids', vesselSel.join(','));
      }
      if (categorySel !== null && categorySel.length < categoryOptions.length) {
        params.append('category', categorySel.join(','));
      }
      if (searchQuery && searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (selectedKpiFilter) {
        params.append('status', selectedKpiFilter);
      }

      const qs = params.toString() ? `?${params.toString()}` : '';
      const endpoint = isExcel
        ? `${host._base()}/api/certificates/compliance-matrix/export-excel${qs}`
        : `${host._base()}/api/certificates/compliance-matrix/export-pdf${qs}`;

      const res = await fetch(endpoint, {
        headers: host._headers(),
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const todayStr = new Date().toISOString().split('T')[0];
      a.download = isExcel
        ? `Fleet-Compliance-Matrix-${todayStr}.xlsx`
        : `Fleet-Compliance-Matrix-${todayStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Export error: ${err?.message || 'Could not download matrix report.'}`);
    } finally {
      if (isExcel) setIsExportingExcel(false);
      else setIsExportingPdf(false);
    }
  }, [host, matrixView, vesselSel, categorySelKey, searchQuery, selectedKpiFilter, allVesselIds, categoryOptions.length]);

  // Navigate to Cert Checklist filtered to a single vessel
  const handleOpenVesselChecklist = React.useCallback((vesselId: number | string | undefined | null) => {
    if (!vesselId) return;
    setVesselSel([String(vesselId)]);
    setActiveTab('checklist');
  }, []);

  // Status Badge Helper (Icon-only, compact & no-wrap)
  const renderStatusBadge = (cert: CertificateItem): React.ReactElement => {
    // Overdue (< 0 days)
    if (cert.status === 'overdue' || (typeof cert.days_to_expiry === 'number' && !cert.has_no_expiry && cert.days_to_expiry < 0)) {
      const tooltip = typeof cert.days_to_expiry === 'number' && cert.days_to_expiry < 0
        ? `Overdue - Expired ${-cert.days_to_expiry} day${cert.days_to_expiry === -1 ? '' : 's'} ago`
        : 'Overdue - Immediate action required';
      return (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="certificates-page-i4" style={{ width: 26, background: clay.pillDangerBg, color: clay.pillDangerText }}
        >
          <Icon iconName="StatusErrorFull" className="certificates-page-i5" />
        </span>
      );
    }

    // Due in <= 7 Days: Warning Triangle (Orange Alert)
    if (typeof cert.days_to_expiry === 'number' && !cert.has_no_expiry && cert.days_to_expiry <= 7) {
      const tooltip = `Due in ${cert.days_to_expiry} day${cert.days_to_expiry === 1 ? '' : 's'} - Urgent survey required`;
      return (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="certificates-page-i6" style={{ width: 26, background: '#ffedd5', color: '#ea580c' }}
        >
          <Icon iconName="Warning" className="certificates-page-i5" />
        </span>
      );
    }

    // Due in <= 30 Days: Clock (Renewal Window Open)
    if (cert.status === 'due_soon' || (typeof cert.days_to_expiry === 'number' && !cert.has_no_expiry && cert.days_to_expiry <= 30)) {
      const tooltip = typeof cert.days_to_expiry === 'number'
        ? `Expiring Soon - ${cert.days_to_expiry} day${cert.days_to_expiry === 1 ? '' : 's'} left (Renewal window open)`
        : 'Expiring Soon - Renewal window open';
      return (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="certificates-page-i7" style={{ width: 26, background: clay.pillWarnBg, color: clay.pillWarnText }}
        >
          <Icon iconName="Clock" className="certificates-page-i5" />
        </span>
      );
    }

    // Due in <= 90 Days: HourGlass (Sky Blue - Planning & Preparation)
    if (typeof cert.days_to_expiry === 'number' && !cert.has_no_expiry && cert.days_to_expiry <= 90) {
      const tooltip = `Due in ${cert.days_to_expiry} days - Planning & preparation`;
      return (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="certificates-page-i8" style={{ width: 26, background: '#e0f2fe', color: '#0284c7' }}
        >
          <Icon iconName="HourGlass" className="certificates-page-i5" />
        </span>
      );
    }
    if (cert.status === 'missing') {
      return (
        <span
          title="Missing - Unfulfilled mandatory certificate"
          aria-label="Missing - Unfulfilled mandatory certificate"
          className="certificates-page-i9" style={{ width: 26 }}
        >
          <Icon iconName="DocumentSearch" className="certificates-page-i5" />
        </span>
      );
    }
    return (
      <span
        title="Valid - Statutory compliance verified"
        aria-label="Valid - Statutory compliance verified"
        className="certificates-page-i10" style={{ width: 26, background: clay.pillActiveBg, color: clay.pillActiveText }}
      >
        <Icon iconName="StatusCircleCheckmark" className="certificates-page-i5" />
      </span>
    );
  };

  // Helper for KPI card click
  const handleKpiClick = (statusKey: string): void => {
    if (selectedKpiFilter === statusKey) {
      setSelectedKpiFilter(null); // toggle off
    } else {
      setSelectedKpiFilter(statusKey);
    }
  };

  return (
    <div
      
      className="vdms-certificates-page certificates-page-i11" style={{ width: '100%' }}
    >
      {/* Page Header (Increased Size & Tightened Padding) */}
      <div
        className="certificates-page-i12 vdms-certificates__header"
      >
        <div className="certificates-page-i13 vdms-certificates__title" style={{ minWidth: 0 }}>
          <h1
            className="certificates-page-i14" style={{ letterSpacing: '-0.025em', fontFamily: DMS_FONT_DISPLAY }}
          >
            Certificates & Compliance
          </h1>
          <span
            className="certificates-page-i15"
          >
            · Fleet statutory compliance, surveys, and expiry alerts
          </span>
        </div>
        <div className="certificates-page-i16 vdms-certificates__actions">
          <button
            type="button"
            onClick={() => { void refreshAll(); }}
            disabled={refreshing || syncingSharePoint}
            style={{
              ...dmsBtn('secondary'),
              height: 32,
              padding: '0 13px',
              fontSize: 12,
              gap: 5,
              opacity: (refreshing || syncingSharePoint) ? 0.6 : 1,
              cursor: (refreshing || syncingSharePoint) ? 'progress' : 'pointer',
            }}
            title="Reload KPIs, records and matrix"
          >
            <Icon iconName="Refresh" className="certificates-page-i17" /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => { void handleSyncFromSharePoint(); }}
            disabled={syncingSharePoint || refreshing}
            style={{
              ...dmsBtn('secondary'),
              height: 32,
              padding: '0 13px',
              fontSize: 12,
              gap: 5,
              opacity: (syncingSharePoint || refreshing) ? 0.6 : 1,
              cursor: (syncingSharePoint || refreshing) ? 'progress' : 'pointer',
            }}
            title="Scan SharePoint vessel folders to auto-import newly added or updated certificates"
          >
            <Icon iconName="Sync" className="certificates-page-j1" /> {syncingSharePoint ? 'Syncing SharePoint…' : 'Sync SharePoint'}
          </button>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            style={{ ...dmsBtn('primary'), height: 32, padding: '0 14px', fontSize: 12, gap: 5 }}
          >
            <Icon iconName="Add" className="certificates-page-i17" /> Add Certificate
          </button>
        </div>
      </div>

      {/* 5 Clickable KPI Metric Cards (Compact) */}
      <div
        className="certificates-page-i18 vdms-certificates__kpis" style={{ gridTemplateColumns: isMobile
            ? '1fr 1fr'
            : isTablet
            ? 'repeat(3, 1fr)'
            : 'repeat(5, 1fr)' }}
      >
        {/* Card 1: Overdue */}
        <div
          onClick={() => handleKpiClick('overdue')}
          className="certificates-page-i19" style={{ background: 'var(--vdms-surface)', borderRadius: 10, border: `2px solid ${selectedKpiFilter === 'overdue' ? clay.pillDangerText : 'var(--vdms-line)'}`, boxShadow: clay.shadowRaised }}
        >
          <div className="certificates-page-i20">
            <span className="certificates-page-i21" style={{ color: clay.pillDangerText }}>
              Overdue
            </span>
            <span
              className="certificates-page-i22" style={{ width: 26, background: clay.pillDangerBg, color: clay.pillDangerText }}
            >
              <Icon iconName="StatusErrorFull" className="certificates-page-i5" />
            </span>
          </div>
          <div className="certificates-page-i23">
            {kpis.overdue ?? 0}
          </div>
          <div className="certificates-page-i24">Require Immediate Action</div>
        </div>

        {/* Card 2: Due in 7 Days */}
        <div
          onClick={() => handleKpiClick('due_7_days')}
          className="certificates-page-i25" style={{ background: 'var(--vdms-surface)', borderRadius: 10, border: `2px solid ${selectedKpiFilter === 'due_7_days' ? '#ea580c' : 'var(--vdms-line)'}`, boxShadow: clay.shadowRaised }}
        >
          <div className="certificates-page-i20">
            <span className="certificates-page-i26">
              Due &le; 7 Days
            </span>
            <span
              className="certificates-page-i27" style={{ width: 26, background: '#ffedd5', color: '#ea580c' }}
            >
              <Icon iconName="Warning" className="certificates-page-i5" />
            </span>
          </div>
          <div className="certificates-page-i23">
            {kpis.due_7_days ?? 0}
          </div>
          <div className="certificates-page-i24">Urgent Survey Required</div>
        </div>

        {/* Card 3: Due in 30 Days */}
        <div
          onClick={() => handleKpiClick('due_30_days')}
          className="certificates-page-i25" style={{ background: 'var(--vdms-surface)', borderRadius: 10, border: `2px solid ${selectedKpiFilter === 'due_30_days' ? '#d97706' : 'var(--vdms-line)'}`, boxShadow: clay.shadowRaised }}
        >
          <div className="certificates-page-i20">
            <span className="certificates-page-i28">
              Due &le; 30 Days
            </span>
            <span
              className="certificates-page-i29" style={{ width: 26, background: clay.pillWarnBg, color: clay.pillWarnText }}
            >
              <Icon iconName="Clock" className="certificates-page-i5" />
            </span>
          </div>
          <div className="certificates-page-i23">
            {kpis.due_30_days ?? 0}
          </div>
          <div className="certificates-page-i24">Renewal Windows Open</div>
        </div>

        {/* Card 4: Due in 90 Days */}
        <div
          onClick={() => handleKpiClick('due_90_days')}
          className="certificates-page-i25" style={{ background: 'var(--vdms-surface)', borderRadius: 10, border: `2px solid ${selectedKpiFilter === 'due_90_days' ? '#0284c7' : 'var(--vdms-line)'}`, boxShadow: clay.shadowRaised }}
        >
          <div className="certificates-page-i20">
            <span className="certificates-page-i21" style={{ color: '#0284c7' }}>
              Due &le; 90 Days
            </span>
            <span
              className="certificates-page-i30" style={{ width: 26, background: '#e0f2fe', color: '#0284c7' }}
            >
              <Icon iconName="HourGlass" className="certificates-page-i5" />
            </span>
          </div>
          <div className="certificates-page-i23">
            {kpis.due_90_days ?? 0}
          </div>
          <div className="certificates-page-i24">Planning & Preparation</div>
        </div>

        {/* Card 5: Missing / Required */}
        <div
          onClick={() => handleKpiClick('missing')}
          className="certificates-page-i25" style={{ background: 'var(--vdms-surface)', borderRadius: 10, border: `2px solid ${selectedKpiFilter === 'missing' ? '#7c3aed' : 'var(--vdms-line)'}`, boxShadow: clay.shadowRaised }}
        >
          <div className="certificates-page-i20">
            <span className="certificates-page-i31">
              Missing
            </span>
            <span
              className="certificates-page-i32" style={{ width: 26 }}
            >
              <Icon iconName="DocumentSearch" className="certificates-page-i5" />
            </span>
          </div>
          <div className="certificates-page-i23">
            {kpis.missing_required ?? 0}
          </div>
          <div className="certificates-page-i24">Unfulfilled Mandatory Req.</div>
        </div>
      </div>

      {/* Mode Switcher & Filter Toolbar (Guaranteed Single Row) */}
      <div
        className="vdms-cert-toolbar"
        style={{
          background: 'var(--vdms-surface)',
          borderRadius: 12,
          border: '1px solid var(--vdms-line)',
          padding: '8px 14px',
          boxShadow: clay.shadowRaised,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          gap: 10,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {/* Left Side: Tabs + Inline Active KPI Filter Pill */}
        <div className="vdms-cert-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className="certificates-page-i33" style={{ borderRadius: 8, background: activeTab === 'list' ? clay.accentGradient : 'transparent', color: activeTab === 'list' ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: activeTab === 'list' ? clay.shadowButton : 'none' }}
          >
            <Icon iconName="Table" className="certificates-page-i17" /> Records ({filteredList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className="certificates-page-i33" style={{ borderRadius: 8, background: activeTab === 'matrix' ? clay.accentGradient : 'transparent', color: activeTab === 'matrix' ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: activeTab === 'matrix' ? clay.shadowButton : 'none' }}
          >
            <Icon iconName="GridViewMedium" className="certificates-page-i17" /> Matrix View
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className="certificates-page-i33" style={{ borderRadius: 8, background: activeTab === 'checklist' ? clay.accentGradient : 'transparent', color: activeTab === 'checklist' ? DMS_ON_ACCENT : 'var(--vdms-text)', boxShadow: activeTab === 'checklist' ? clay.shadowButton : 'none' }}
          >
            <Icon iconName="CheckList" className="certificates-page-i17" /> Cert Checklist
          </button>

          {selectedKpiFilter && (
            <div
              className="certificates-page-i34" style={{ background:
                  selectedKpiFilter === 'overdue'
                    ? clay.pillDangerBg
                    : selectedKpiFilter === 'due_7_days'
                    ? '#fef3c7'
                    : selectedKpiFilter === 'due_30_days'
                    ? '#ffedd5'
                    : selectedKpiFilter === 'missing'
                    ? '#f3e8ff'
                    : clay.accentSoft, border: `1px solid ${
                  selectedKpiFilter === 'overdue'
                    ? clay.pillDangerText + '50'
                    : selectedKpiFilter === 'due_7_days'
                    ? '#d9770650'
                    : selectedKpiFilter === 'due_30_days'
                    ? '#ea580c50'
                    : selectedKpiFilter === 'missing'
                    ? '#7c3aed50'
                    : clay.accent + '50'
                }`, color:
                  selectedKpiFilter === 'overdue'
                    ? clay.pillDangerText
                    : selectedKpiFilter === 'due_7_days'
                    ? '#b45309'
                    : selectedKpiFilter === 'due_30_days'
                    ? '#c2410c'
                    : selectedKpiFilter === 'missing'
                    ? '#7c3aed'
                    : clay.accent }}
            >
              <Icon iconName="Filter" className="certificates-page-i35" />
              <span>{selectedKpiFilter.replace(/_/g, ' ').toUpperCase()}</span>
              <Icon
                iconName="Cancel"
                className="certificates-page-i36"
                onClick={() => setSelectedKpiFilter(null)}
                title="Clear KPI filter"
              />
            </div>
          )}
        </div>

        {/* Right Side: Search & Filter Controls (Single Row, No Wrap, Fully Utilized Space) */}
        <div className="vdms-cert-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', flexShrink: 0, minWidth: 0, justifyContent: 'flex-end' }}>
          {/* Vessel multi-select (applies to Records, Matrix and Checklist) */}
          <VesselMultiSelect
            options={registeredVessels.map((v: any) => ({ id: String(v.id), name: v.name }))}
            selectedIds={selectedVesselIds}
            onChange={ids => setVesselSel(ids.length === allVesselIds.length ? null : ids)}
            width={240}
          />

          {/* Category multi-select (styled identical to Vessel multi-select) */}
          <CategoryMultiSelect
            options={categoryOptions.map(cat => ({
              id: cat,
              name: cat,
              iconName:
                cat === 'Safety' ? 'ShieldAlert'
                : cat === 'Environment' ? 'World'
                : cat === 'Hull & Machinery' ? 'Engineering'
                : cat === 'Registry' ? 'Flag'
                : 'Certificate',
            }))}
            selectedIds={selectedCategoryKeys}
            onChange={ids => setCategorySel(ids.length === categoryOptions.length ? null : ids)}
            width={240}
          />

          {/* Search Box */}
          <div className="certificates-page-i37 vdms-certificates__search" style={{ width: 260, minWidth: 180 }}>
            <Icon
              iconName="Search"
              className="certificates-page-i38"
            />
            <input
              type="text"
              placeholder="Search cert or vessel..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                ...dmsControlStyle(),
                width: '100%',
                height: 36,
                paddingLeft: 30,
                paddingRight: 10,
                fontSize: 12.5,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="certificates-page-i39" style={{ borderRadius: 10, background: clay.pillDangerBg, color: clay.pillDangerText }}
        >
          {error}
        </div>
      )}

      {/* Main Content Pane */}
      {activeTab === 'checklist' ? (
        /* ── PER-VESSEL CHECKLIST ── */
        <VesselChecklistView
          host={host}
          refreshKey={checklistRefreshKey}
          vesselIds={selectedVesselIds.map(Number)}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
          onAdd={(vesselId, masterId) => { setAddPreset({ vesselId, masterId }); setAddModalOpen(true); }}
          onEdit={(cert, mode) => {
            setEditingCert(cert);
            setModalInitialMode(mode || 'edit');
          }}
          onRenew={cert => setRenewingCert(cert)}
          onHistory={cert => setHistoryCert(cert)}
        />
      ) : activeTab === 'list' ? (
        /* ── CERTIFICATE LIST TABLE ── */
        <div
          className="vdms-certificates__pane vdms-certificates__pane--list"
          style={{
            ...DMS_TABLE_CARD,
            flex: '1 1 0',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
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
            <table className="vdms-cert-table" style={{ ...DMS_TABLE, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'auto', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', minWidth: 210, width: 230 }}>Vessel Name</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', minWidth: 180 }}>Certificate Name</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', minWidth: 130, width: 150 }}>Cert Number</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', width: 105 }}>Issue Date</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', width: 110 }}>Expiry Date</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', textAlign: 'center', width: 60 }}>Status</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', textAlign: 'center', width: 48 }}>Doc</th>
                  <th style={{ ...DMS_TH, position: 'sticky', top: 0, zIndex: 20, background: 'var(--vdms-surface-alt)', textAlign: 'center', width: 68 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...DMS_TD, textAlign: 'center', padding: '36px 0', color: 'var(--vdms-text-muted)' }}>
                      No certificates match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredList.map(c => (
                    <tr key={c.id} style={DMS_TR}>
                      <td
                        onClick={() => handleOpenVesselChecklist(c.vessel_id)}
                        style={{
                          ...DMS_TD,
                          fontWeight: 700,
                          fontSize: 13.5,
                          color: 'var(--vdms-text)',
                          cursor: 'pointer',
                        }}
                        title={`Click to view Certificate Checklist for ${c.vessel_name}`}
                      >
                        <div
                          className="vdms-vessel-link-cell"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13.5,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'color 0.12s ease',
                          }}
                        >
                          <span className="vdms-vessel-name-span">{c.vessel_name}</span>
                          <Icon iconName="ChevronRightSmall" className="certificates-page-i40" style={{ opacity: 0.45 }} />
                        </div>
                      </td>
                      <td style={{ ...DMS_TD, fontWeight: 600, color: 'var(--vdms-text)' }}>
                        <div className="certificates-page-i41">
                          <span className="certificates-page-i42">{c.certificate_name}</span>
                          {c.category && (
                            <span className="certificates-page-i43">
                              {c.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...DMS_TD, fontVariantNumeric: 'tabular-nums' }}>
                        {c.certificate_number ? (
                          <span
                            className="vdms-cert-no-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCert(c);
                              setModalInitialMode('view');
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
                            {c.certificate_number}
                          </span>
                        ) : (
                          <span className="certificates-page-i44">—</span>
                        )}
                      </td>
                      <td style={{ ...DMS_TD, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {c.issue_date ? c.issue_date.slice(0, 10) : '—'}
                      </td>
                      <td style={{ ...DMS_TD, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {c.has_no_expiry ? (
                          <span className="certificates-page-i45" style={{ color: clay.accent }}>Permanent</span>
                        ) : (
                          c.expiry_date ? c.expiry_date.slice(0, 10) : '—'
                        )}
                        {typeof c.days_to_expiry === 'number' && !c.has_no_expiry && (
                          <div
                            className="certificates-page-i46" style={{ color:
                                c.days_to_expiry < 0
                                  ? clay.pillDangerText
                                  : c.days_to_expiry <= 30
                                  ? clay.pillWarnText
                                  : 'var(--vdms-text-muted)' }}
                          >
                            {c.days_to_expiry < 0
                              ? `Expired ${-c.days_to_expiry} day${c.days_to_expiry === -1 ? '' : 's'} ago`
                              : c.days_to_expiry === 0
                              ? 'Expires today'
                              : `${c.days_to_expiry} day${c.days_to_expiry === 1 ? '' : 's'} left`}
                          </div>
                        )}
                      </td>
                      <td style={{ ...DMS_TD, textAlign: 'center', width: 60, whiteSpace: 'nowrap' }}>
                        {renderStatusBadge(c)}
                      </td>
                      <td style={{ ...DMS_TD, textAlign: 'center', width: 48 }}>
                        {c.sharepoint_file_url ? (
                          <a
                            href={c.sharepoint_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Certificate in SharePoint"
                            className="certificates-page-i47" style={{ color: '#0284c7' }}
                          >
                            <Icon iconName="PDF" className="certificates-page-i48" style={{ color: '#0284c7' }} />
                          </a>
                        ) : (
                          <span title="No document uploaded yet" aria-label="No document uploaded yet" className="certificates-page-i49">—</span>
                        )}
                      </td>
                      <td style={{ ...DMS_TD, textAlign: 'center', whiteSpace: 'nowrap', width: 68 }}>
                        <div className="certificates-page-i50">
                          <button
                            type="button"
                            aria-label={`Actions for ${c.certificate_name}`}
                            title="Actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(prev => (prev === c.id ? null : c.id));
                            }}
                            style={{
                              ...dmsBtn('ghost'),
                              width: 28,
                              height: 28,
                              minWidth: 28,
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 6,
                              color: openActionMenuId === c.id ? clay.accent : 'var(--vdms-text-secondary)',
                              background: openActionMenuId === c.id ? 'var(--vdms-surface-alt, #f1f5f9)' : 'transparent',
                              border: openActionMenuId === c.id ? '1px solid var(--vdms-line)' : '1px solid transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                              <circle cx="8" cy="3" r="1.5" />
                              <circle cx="8" cy="8" r="1.5" />
                              <circle cx="8" cy="13" r="1.5" />
                            </svg>
                          </button>

                          {openActionMenuId === c.id && (
                            <div
                              role="menu"
                              className="certificates-page-i51" style={{ minWidth: 160, borderRadius: 8, border: '1px solid var(--vdms-line, #e2e8f0)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="vdms-action-dropdown-item"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setRenewingCert(c);
                                }}
                              >
                                <Icon iconName="RenewalCurrent" className="certificates-page-i52" style={{ color: clay.accent, width: 16 }} />
                                <span>Renew</span>
                              </button>
                              <button
                                type="button"
                                className="vdms-action-dropdown-item"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setEditingCert(c);
                                  setModalInitialMode('edit');
                                }}
                              >
                                <Icon iconName="Edit" className="certificates-page-i53" style={{ width: 16 }} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="vdms-action-dropdown-item"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setHistoryCert(c);
                                }}
                              >
                                <Icon iconName="History" className="certificates-page-i53" style={{ width: 16 }} />
                                <span>Version History</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── FLEET COMPLIANCE MATRIX ── */
        <div
          className="vdms-certificates__pane vdms-certificates__pane--matrix"
          style={{
            ...DMS_TABLE_CARD,
            flex: '1 1 0',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Matrix Header & Audit Export Bar */}
          <div
            className="certificates-page-i54"
          >
            <div>
              <div className="certificates-page-i55">
                <span className="certificates-page-i56">
                  Fleet Compliance Matrix
                </span>
                <span
                  className="certificates-page-i57" style={{ borderRadius: 12, background: clay.accentSoft, color: clay.accent }}
                >
                  PSC &amp; Oil Major Vetting Audit
                </span>
              </div>
              <div className="certificates-page-i58">
                {matrixView.rows.length} vessel{matrixView.rows.length === 1 ? '' : 's'} · Statutory &amp; mandatory compliance breakdown · One-click audit export
              </div>
            </div>

            {/* Export Buttons */}
            <div className="certificates-page-i55">
              <button
                type="button"
                onClick={() => void handleExportMatrix('excel')}
                disabled={isExportingExcel}
                style={{
                  ...dmsBtn('primary'),
                  height: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isExportingExcel ? 'wait' : 'pointer',
                  opacity: isExportingExcel ? 0.7 : 1,
                }}
                title="Export Fleet Compliance Matrix matching active filters (vessels, category, search, status) to Excel (.xlsx)"
              >
                <Icon iconName="ExcelDocument" aria-hidden="true" className="certificates-page-i5" />
                {isExportingExcel ? 'Exporting Excel…' : 'Export Excel (.xlsx)'}
              </button>

              <button
                type="button"
                onClick={() => void handleExportMatrix('pdf')}
                disabled={isExportingPdf}
                style={{
                  ...dmsBtn('secondary'),
                  height: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isExportingPdf ? 'wait' : 'pointer',
                  opacity: isExportingPdf ? 0.7 : 1,
                }}
                title="Export Fleet Compliance Matrix audit report matching active filters to landscape A4 PDF (.pdf)"
              >
                <Icon iconName="PDF" aria-hidden="true" className="certificates-page-i5" />
                {isExportingPdf ? 'Exporting PDF…' : 'Export PDF (.pdf)'}
              </button>
            </div>
          </div>

          {/* Scrollable Matrix Table (Vessel Content Rows only - Ship Type removed) */}
          <div
            ref={matrixScrollRef}
            onScroll={handleMatrixScroll}
            className="vdms-scroll-clean"
            style={{
              flex: '1 1 0',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'auto',
              width: '100%',
            }}
          >
            <table className="vdms-matrix-table" style={{ ...DMS_TABLE, borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed' }}>
              {matrixColGroup}
              <thead>
                <tr>
                  <th
                    style={{
                      ...DMS_TH,
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      minWidth: 220,
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                    }}
                  >
                    Vessel Name
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      minWidth: 120,
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                    }}
                  >
                    Compliance Rate
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      minWidth: 90,
                      padding: '12px 10px',
                    }}
                  >
                    Mandatory
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      minWidth: 90,
                      padding: '12px 10px',
                    }}
                  >
                    Optional
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      minWidth: 60,
                      padding: '12px 8px',
                    }}
                  >
                    N/A
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      color: '#15803d',
                      minWidth: 70,
                      padding: '12px 8px',
                    }}
                  >
                    Valid
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      color: '#b45309',
                      minWidth: 75,
                      padding: '12px 8px',
                    }}
                  >
                    ≤ 7 Days
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      color: '#c2410c',
                      minWidth: 75,
                      padding: '12px 8px',
                    }}
                  >
                    ≤ 30 Days
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      color: '#0284c7',
                      minWidth: 75,
                      padding: '12px 8px',
                    }}
                  >
                    ≤ 90 Days
                  </th>
                  <th
                    style={{
                      ...DMS_TH,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--vdms-surface-alt)',
                      color: '#b91c1c',
                      minWidth: 75,
                      padding: '12px 8px',
                    }}
                  >
                    Overdue
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixView.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      style={{ ...DMS_TD, textAlign: 'center', padding: '36px 0', color: 'var(--vdms-text-muted)' }}
                    >
                      No fleet compliance matrix data available.
                    </td>
                  </tr>
                ) : (
                  matrixView.rows.map(row => {
                    const mandHeld = row.mandatory_held ?? row.valid_count ?? 0;
                    const mandTotal = row.mandatory_total ?? row.required_count ?? 0;
                    const optHeld = row.optional_held ?? 0;
                    const optTotal = row.optional_total ?? 0;
                    const naCount = row.na_count ?? 0;
                    const combinedHeld = row.combined_held ?? (mandHeld + optHeld + naCount);
                    const combinedTotal = row.combined_total ?? (mandTotal + optTotal + naCount);
                    const cValid = row.count_valid ?? row.valid_count ?? 0;
                    const cDue7 = row.count_due_7 ?? 0;
                    const cDue30 = row.count_due_30 ?? 0;
                    const cDue90 = row.count_due_90 ?? 0;
                    const cOverdue = row.count_overdue ?? 0;

                    const pillBg =
                      row.compliance_rate >= 80
                        ? clay.pillActiveBg
                        : row.compliance_rate >= 50
                        ? clay.pillWarnBg
                        : clay.pillDangerBg;
                    const pillColor =
                      row.compliance_rate >= 80
                        ? clay.pillActiveText
                        : row.compliance_rate >= 50
                        ? clay.pillWarnText
                        : clay.pillDangerText;

                    return (
                      <tr
                        key={row.vessel_id}
                        className="vdms-matrix-row"
                        onClick={() => handleOpenVesselChecklist(row.vessel_id)}
                        style={{ ...DMS_TR, height: 48 }}
                        title={`Click to view Certificate Checklist for ${row.vessel_name}`}
                      >
                        <td
                          style={{
                            ...DMS_TD,
                            fontWeight: 700,
                            fontSize: 13.5,
                            color: 'var(--vdms-text)',
                            padding: '12px 14px',
                            height: 48,
                            verticalAlign: 'middle',
                          }}
                        >
                          <div
                            className="vdms-matrix-vessel-link"
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 13.5,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'color 0.12s ease',
                            }}
                          >
                            <span>{row.vessel_name}</span>
                            <Icon iconName="ChevronRightSmall" className="certificates-page-i40" style={{ opacity: 0.45 }} />
                          </div>
                        </td>
                        <td
                          style={{
                            ...DMS_TD,
                            textAlign: 'center',
                            padding: '12px 10px',
                            height: 48,
                            verticalAlign: 'middle',
                          }}
                        >
                          <span
                            className="certificates-page-i59" style={{ borderRadius: 12, background: pillBg, color: pillColor }}
                          >
                            {row.compliance_rate}% ({combinedHeld}/{combinedTotal})
                          </span>
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 10px', fontWeight: 700, color: 'var(--vdms-text)' }}>
                          {mandHeld} / {mandTotal}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 10px', fontWeight: 500, color: 'var(--vdms-text-muted)' }}>
                          {optHeld} / {optTotal}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 500, color: 'var(--vdms-text-faint)' }}>
                          {naCount}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: cValid > 0 ? '#15803d' : 'var(--vdms-text-faint)' }}>
                          {cValid}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: cDue7 > 0 ? '#b45309' : 'var(--vdms-text-faint)' }}>
                          {cDue7}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: cDue30 > 0 ? '#c2410c' : 'var(--vdms-text-faint)' }}>
                          {cDue30}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: cDue90 > 0 ? '#0284c7' : 'var(--vdms-text-faint)' }}>
                          {cDue90}
                        </td>
                        <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: cOverdue > 0 ? '#b91c1c' : 'var(--vdms-text-faint)' }}>
                          {cOverdue}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Fixed Fleet Compliance Total Footer (OUTSIDE the scroll area - clean of scrollbars) */}
          {matrixView.rows.length > 0 && (
            <div
              ref={matrixFooterScrollRef}
              className="certificates-page-i60" style={{ paddingRight: hasMatrixVerticalScroll ? 7 : 0 }}
            >
              <table className="vdms-matrix-table" style={{ ...DMS_TABLE, borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed' }}>
                {matrixColGroup}
                <tfoot>
                  <tr>
                    <td
                      style={{
                        ...DMS_TD,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        fontSize: 11.5,
                        letterSpacing: '0.04em',
                        padding: '12px 14px',
                        color: 'var(--vdms-text)',
                        background: 'var(--vdms-surface-alt)',
                        borderBottom: 'none',
                      }}
                    >
                      <div className="certificates-page-i61">
                        <span className="certificates-page-i62" style={{ background: '#15803d' }} />
                        <span>Fleet Compliance Total ({matrixView.rows.length} Vessels)</span>
                      </div>
                    </td>
                    <td
                      style={{
                        ...DMS_TD,
                        textAlign: 'center',
                        padding: '12px 10px',
                        background: 'var(--vdms-surface-alt)',
                        borderBottom: 'none',
                      }}
                    >
                      <span
                        className="certificates-page-i59" style={{ borderRadius: 12, background:
                            fleetSummary.avgRate >= 80
                              ? clay.pillActiveBg
                              : fleetSummary.avgRate >= 50
                              ? clay.pillWarnBg
                              : clay.pillDangerBg, color:
                            fleetSummary.avgRate >= 80
                              ? clay.pillActiveText
                              : fleetSummary.avgRate >= 50
                              ? clay.pillWarnText
                              : clay.pillDangerText }}
                      >
                        {fleetSummary.avgRate}% ({fleetSummary.totalCombinedHeld}/{fleetSummary.totalCombinedTotal})
                      </span>
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 10px', fontWeight: 800, color: 'var(--vdms-text)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalMandatoryHeld} / {fleetSummary.totalMandatoryReq}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 10px', fontWeight: 700, color: 'var(--vdms-text-muted)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalOptionalHeld} / {fleetSummary.totalOptionalTotal}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 700, color: 'var(--vdms-text-faint)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalNA}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: '#15803d', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalValid}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: fleetSummary.totalDue7 > 0 ? '#b45309' : 'var(--vdms-text-faint)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalDue7}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: fleetSummary.totalDue30 > 0 ? '#c2410c' : 'var(--vdms-text-faint)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalDue30}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: fleetSummary.totalDue90 > 0 ? '#0284c7' : 'var(--vdms-text-faint)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalDue90}
                    </td>
                    <td style={{ ...DMS_TD, textAlign: 'center', padding: '12px 8px', fontWeight: 800, color: fleetSummary.totalOverdue > 0 ? '#b91c1c' : 'var(--vdms-text-faint)', background: 'var(--vdms-surface-alt)', borderBottom: 'none' }}>
                      {fleetSummary.totalOverdue}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Certificate Modal */}
      <AddCertificateModal
        host={host}
        isOpen={addModalOpen}
        defaultVesselId={addPreset?.vesselId}
        defaultMasterId={addPreset?.masterId}
        onClose={() => { setAddModalOpen(false); setAddPreset(null); }}
        onSuccess={() => { void refreshAll(); }}
      />

      {/* Edit Certificate Modal */}
      <EditCertificateModal
        host={host}
        certificate={editingCert}
        isOpen={!!editingCert}
        initialMode={modalInitialMode}
        onClose={() => setEditingCert(null)}
        onSuccess={() => { void refreshAll(); }}
        availableCategories={categoryOptions}
      />

      {/* Renew Certificate Modal */}
      <RenewCertificateModal
        host={host}
        certificate={renewingCert}
        isOpen={!!renewingCert}
        onClose={() => setRenewingCert(null)}
        onSuccess={() => { void refreshAll(); }}
      />

      {/* Certificate History Modal */}
      <CertificateHistoryModal
        host={host}
        certificate={historyCert}
        isOpen={!!historyCert}
        onClose={() => setHistoryCert(null)}
      />
    </div>
  );
}
