import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { SiteSelector } from '../SiteSelector';
import type { VesselRecord } from '../types/rows';
import type { AlertItem } from '../types/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Home / Dashboard
//
// An at-a-glance summary, not another browsing surface: live totals (GET
// /api/dashboard/stats), fleet status (GET /api/vessels, already loaded
// app-wide), monthly document activity (facets from GET
// /api/dashboard/documents, the same endpoint the Documents module itself
// uses) and real events/anomalies (GET /api/alerts/all, already polled
// app-wide for the header alert bell). Every document, every vessel and
// every site in full detail still lives in the Documents / Vessels / Sites
// modules — this page never re-renders those as tables.
//
// Plain inline styles + React 17 hooks only (SPFx / Fluent UI 8 constraint).
// ─────────────────────────────────────────────────────────────────────────────

export interface RealDashboardDoc {
  id: string;
  name: string;
  vessel: string;
  type: string;
  status?: 'Valid' | 'Expiring Soon' | 'Expired' | string;
  modified: string;
  modifiedEpoch: number;
  createdEpoch?: number;
  modifiedBy?: string;
  createdBy?: string;
  fileSize?: string;
  sizeBytes?: number;
  subFolderPath?: string;
  webUrl?: string;
  ext?: string;
  fileType?: string;
  site?: string;
  siteName?: string;
}

export interface DashboardSiteSummary {
  site_key: string;
  site_name: string;
  drive_id?: string;
  web_url?: string;
  files: number;
  folders: number;
  last_modified_epoch?: number | null;
  truncated?: boolean;
  /** Set when the backend couldn't scan this site (permission, throttling,
   * missing drive_id, ...) — files/folders are 0 in that case too, but this
   * field is what distinguishes "failed to fetch" from "actually empty". */
  error?: string | null;
  /** Set for a site that was just added (or just became visible) and whose
   * real file/folder counts haven't been scanned yet — files/folders are 0
   * placeholders here, not an actual empty count. The backend fills this in
   * with a background scan within moments; no user action needed. */
  stats_pending?: boolean;
  /** Backend attached a live running total (files/folders read so far) while
   * the full scan of this site is still in progress. */
  counting?: boolean;
  /** Live vessel count for this site — root-level (or one-level-nested)
   * folders whose name matches a Term Store vessel term, computed as part
   * of the same scan as files/folders (see backend
   * _term_store_vessel_folder_count). This is what "Total Vessels" sums. */
  vessels?: number;
  /** The official Term Store labels behind `vessels` — real, current
   * SharePoint vessel folder names for this site, not read from the
   * vessels DB table. */
  vessel_names?: string[];
}

export interface DashboardStats {
  total_documents: number;
  total_files?: number;
  total_folders?: number;
  total_sites?: number;
  total_vessels: number;
  /** Vessel folders in the selected site(s) that hold at least one document. */
  active_vessels?: number;
  /** Vessel folders in the selected site(s) with no documents yet. */
  vessels_without_documents?: number;
  /** Display names of those vessel folders (same set as vessels_without_documents), A–Z. */
  vessels_without_documents_list?: string[];
  sites?: DashboardSiteSummary[];
  truncated?: boolean;
  recent_documents: RealDashboardDoc[];
  documents?: RealDashboardDoc[];
  /** When these figures were computed (epoch ms). Counts are served from a
   * short-lived server cache, kept warm by a background job, rather than
   * recomputed on every page load — this is what "Refresh" invalidates. */
  last_refreshed_epoch?: number | null;
}

/**
 * All documents currently loaded for the dashboard (full list when the
 * stats endpoint returned it, otherwise the recent-documents sample).
 * Used by ReportsPage.
 */
export function extractRealDocuments(host: VesselEmail): RealDashboardDoc[] {
  const stats = host.state.dashboardStats;
  if (!stats) return [];
  if (stats.documents && stats.documents.length > 0) return stats.documents;
  return stats.recent_documents || [];
}

// Kept across visits to Home in the same page load, so leaving Home and
// coming back doesn't lose the last refresh.
let refreshNonce = 0;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatNumber(value: number | undefined | null): string {
  return typeof value === 'number' && isFinite(value) ? value.toLocaleString() : '—';
}

function formatDateTime(epoch?: number | null): string {
  if (!epoch) return '—';
  const d = new Date(epoch);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "vessel_unrecognised" → "Vessel unrecognised" (generic alert-type label). */
function humanize(value: string): string {
  const t = String(value || '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Alert';
}

/** The automatic vessel sync logs an entry on every run (once per 5 min while the app is open), even when it found nothing.
 *  Its detail reads "Vessel sync: N new folder(s) flagged for review, M Term Store entr(y|ies) created, K duplicate-name warning(s)." */
function isNoChangeVesselSync(a: AlertItem): boolean {
  if (a.alert_type !== 'crud_operation') return false;
  const detail = String(a.folder_path || '');
  if (!/^vessel sync:/i.test(detail)) return false;
  const nums = (detail.match(/\d+/g) || []).map(Number);
  return nums.length > 0 && nums.every(n => n === 0);
}

function timeAgo(epochMs: number | null | undefined): string {
  if (!epochMs) return '';
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function alertEpoch(a: AlertItem): number {
  const t = a.created_at ? new Date(a.created_at).getTime() : NaN;
  return isFinite(t) ? t : 0;
}

/** Anomaly-type alerts are the real, actionable "something needs a look"
 *  signal — as opposed to routine activity (folder created, email sent, …). */
const ANOMALY_ALERT_TYPES = new Set(['vessel_unrecognised', 'file_outside_structure', 'subfolder_anomaly']);

function iconForAlert(a: AlertItem): string {
  switch (a.alert_type) {
    case 'vessel_provisioned': return 'Ferry';
    case 'vessel_deleted':
    case 'document_deleted': return 'Delete';
    case 'folder_created': return 'FabricFolder';
    case 'crud_operation': return 'Sync';
    case 'vessel_unrecognised':
    case 'file_outside_structure':
    case 'subfolder_anomaly': return 'Warning';
    default: return 'History';
  }
}

interface Palette { surface: string; border: string; text: string; muted: string; }

const controlStyle = (border: string, surface: string, text: string): React.CSSProperties => ({
  padding: '7px 10px', borderRadius: 8, border: `1px solid ${border}`, fontSize: 12,
  background: surface, color: text, outline: 'none', minWidth: 0,
});

// ── Small building blocks shared by the chart/list cards below ──────────────

function SectionCard(props: { palette: Palette; children: React.ReactNode }): React.ReactElement {
  const { palette, children } = props;
  return (
    <div className="dashboard-page-i1 vdms-dashboard__card" style={{ background: palette.surface, border: `1px solid ${palette.border}`, boxShadow: clay.shadowRaised, minWidth: 0 }}>
      {children}
    </div>
  );
}

function EmptyNote(props: { palette: Palette; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="dashboard-page-i2" style={{ color: props.palette.muted }}>
      {props.children}
    </div>
  );
}

/** Flat SVG donut — no charting library installed, and one isn't worth
 *  adding for three static segments. */
function DonutChart(props: {
  segments: Array<{ value: number; color: string }>;
  centerValue: string;
  centerLabel: string;
  palette: Palette;
  size?: number;
}): React.ReactElement {
  const { segments, centerValue, centerLabel, palette, size = 118 } = props;
  const strokeWidth = Math.round(size * 0.145);
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let drawn = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dashboard-page-i3">
      <g transform={`rotate(-90 ${c} ${c})`}>
        {/* Background track */}
        <circle cx={c} cy={c} r={r} fill="none" stroke={palette.border} strokeWidth={strokeWidth} />
        {total === 0 ? (
          /* Empty state: faded grey full-circle so the chart always renders */
          <circle
            cx={c} cy={c} r={r} fill="none"
            stroke="#D1D5DB"
            strokeWidth={strokeWidth}
            strokeOpacity={0.55}
            strokeDasharray={`${circumference} 0`}
          />
        ) : (
          segments.filter(s => s.value > 0).map((s, i) => {
            const dash = (s.value / total) * circumference;
            const el = (
              <circle
                key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-drawn}
              />
            );
            drawn += dash;
            return el;
          })
        )}
      </g>
      <text x={c} y={c - 4} textAnchor="middle" dominantBaseline="middle" fill={total === 0 ? '#9CA3AF' : palette.text} className="dashboard-page-i4" style={{ fontSize: size * 0.2, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
        {centerValue}
      </text>
      <text x={c} y={c + size * 0.14} textAnchor="middle" dominantBaseline="middle" fill={palette.muted} className="dashboard-page-i5" style={{ fontSize: size * 0.082 }}>
        {centerLabel}
      </text>
    </svg>
  );
}

function formatLegendPct(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%';
  if (count === total) return '100%';
  const exact = (count / total) * 100;
  if (exact < 1) {
    return `${Math.max(0.1, Number(exact.toFixed(1)))}%`;
  }
  if (exact > 99) {
    return `${Math.min(99.9, Number(exact.toFixed(1)))}%`;
  }
  const round1 = Math.round(exact * 10) / 10;
  return Number.isInteger(round1) ? `${round1}%` : `${round1.toFixed(1)}%`;
}

function DonutLegendRow(props: { label: string; count: number; total: number; color: string; palette: Palette }): React.ReactElement {
  const { label, count, total, color, palette } = props;
  const pct = formatLegendPct(count, total);
  return (
    <div className="dashboard-page-i6">
      <span className="dashboard-page-i7" style={{ background: color }} />
      <span className="dashboard-page-i8" style={{ color: palette.text, minWidth: 0 }}>{label}</span>
      <span className="dashboard-page-i4" style={{ color: palette.text }}>{count}</span>
      <span className="dashboard-page-i9" style={{ color: palette.muted }}>{pct}</span>
    </div>
  );
}

function MiniBarChart(props: { data: Array<{ label: string; value: number }>; palette: Palette }): React.ReactElement {
  const { data, palette } = props;
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="dashboard-page-i10">
      {data.map(d => (
        <div key={d.label} className="dashboard-page-i11" style={{ minWidth: 0 }}>
          <div className="dashboard-page-i12" style={{ color: palette.text }}>{d.value > 0 ? d.value : ''}</div>
          <div className="dashboard-page-i13" style={{ width: '100%', height: Math.max(3, (d.value / max) * 82), background: clay.accentGradient }} />
          <div className="dashboard-page-i14" style={{ color: palette.muted }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Document Activity — real monthly volume from the Documents module's
// own facets (GET /api/dashboard/documents), not an invented expiry figure
// the backend doesn't compute. ───────────────────────────────────────────────
// ── Certificate Compliance — real fleet statutory & compliance data ─────────
interface ComplianceCardData {
  loading: boolean;
  complianceRate: number;
  complianceRateDisplay: string;
  mandatoryValid: number;
  mandatoryMissing: number;
  optionalHeld: number;
  notApplicable: number;
  totalTracked: number;
  totalVessels: number;
  mandatoryTotal: number;
}

const _complianceCache: Record<string, ComplianceCardData> = {};

function CertificateComplianceCard(props: { host: VesselEmail; siteKey: string; nonce: number; palette: Palette; fallbackVesselCount: number }): React.ReactElement {
  const { host, siteKey, nonce, palette, fallbackVesselCount } = props;
  const cacheKey = siteKey || 'all';
  const cached = _complianceCache[cacheKey];
  const [data, setData] = React.useState<ComplianceCardData>(() =>
    cached
      ? { ...cached, totalVessels: cached.totalVessels || fallbackVesselCount }
      : {
          loading: true,
          complianceRate: 100,
          complianceRateDisplay: '100%',
          mandatoryValid: 0,
          mandatoryMissing: 0,
          optionalHeld: 0,
          notApplicable: 0,
          totalTracked: 0,
          totalVessels: fallbackVesselCount,
          mandatoryTotal: 0,
        }
  );

  React.useEffect(() => {
    let cancelled = false;
    const base = host._base();
    if (!base) return undefined;

    const p = new URLSearchParams();
    if (siteKey && siteKey !== 'all') {
      p.append('site_key', siteKey);
    }
    const qs = p.toString() ? `?${p.toString()}` : '';

    Promise.all([
      fetch(`${base}/api/certificates/compliance-matrix${qs}`, { headers: host._headers(), cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${base}/api/certificates/kpis${qs}`, { headers: host._headers(), cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([matrix, kpis]) => {
      if (cancelled) return;
      if (matrix && Array.isArray(matrix.rows) && matrix.rows.length > 0) {
        const rows = matrix.rows;
        let mHeld = 0;
        let mTotal = 0;
        let optHeld = 0;
        let na = 0;
        rows.forEach((r: any) => {
          mHeld += Number(r.mandatory_held) || 0;
          mTotal += Number(r.mandatory_total) || 0;
          optHeld += Number(r.optional_held) || 0;
          na += Number(r.na_count) || 0;
        });
        const mMissing = Math.max(0, mTotal - mHeld);
        let compRateVal = 100;
        let compRateStr = '100%';
        if (mTotal > 0) {
          const rawPct = (mHeld / mTotal) * 100;
          compRateVal = Math.round(rawPct * 10) / 10;
          if (mHeld === 0) compRateStr = '0%';
          else if (mHeld === mTotal) compRateStr = '100%';
          else if (rawPct < 1) compRateStr = `${rawPct.toFixed(1)}%`;
          else if (rawPct > 99) compRateStr = `${rawPct.toFixed(1)}%`;
          else compRateStr = Number.isInteger(compRateVal) ? `${compRateVal}%` : `${compRateVal.toFixed(1)}%`;
        } else if (typeof kpis?.compliance_percentage === 'number') {
          compRateVal = kpis.compliance_percentage;
          compRateStr = `${compRateVal}%`;
        }
        const total = mHeld + mMissing + optHeld + na;
        const nextData: ComplianceCardData = {
          loading: false,
          complianceRate: compRateVal,
          complianceRateDisplay: compRateStr,
          mandatoryValid: mHeld,
          mandatoryMissing: mMissing,
          optionalHeld: optHeld,
          notApplicable: na,
          totalTracked: total,
          totalVessels: rows.length,
          mandatoryTotal: mTotal,
        };
        _complianceCache[cacheKey] = nextData;
        setData(nextData);
      } else if (kpis) {
        const mValid = Number(kpis.valid) || 0;
        const mMissing = Number(kpis.missing_required ?? kpis.missing) || 0;
        const mTotal = mValid + mMissing;
        const rawRate = Number(kpis.compliance_percentage) || (mTotal > 0 ? (mValid / mTotal) * 100 : 100);
        const compRateVal = Math.round(rawRate * 10) / 10;
        let compRateStr = '100%';
        if (mTotal > 0) {
          if (mValid === 0) compRateStr = '0%';
          else if (mValid === mTotal) compRateStr = '100%';
          else if (rawRate < 1) compRateStr = `${rawRate.toFixed(1)}%`;
          else if (rawRate > 99) compRateStr = `${rawRate.toFixed(1)}%`;
          else compRateStr = Number.isInteger(compRateVal) ? `${compRateVal}%` : `${compRateVal.toFixed(1)}%`;
        }
        const nextData: ComplianceCardData = {
          loading: false,
          complianceRate: compRateVal,
          complianceRateDisplay: compRateStr,
          mandatoryValid: mValid,
          mandatoryMissing: mMissing,
          optionalHeld: 0,
          notApplicable: 0,
          totalTracked: mValid + mMissing,
          totalVessels: fallbackVesselCount,
          mandatoryTotal: mTotal,
        };
        _complianceCache[cacheKey] = nextData;
        setData(nextData);
      } else {
        setData(d => ({ ...d, loading: false }));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, nonce]);

  const vCount = data.totalVessels > 0 ? data.totalVessels : fallbackVesselCount;

  return (
    <>
      <div className="dashboard-page-i15">
        <h3 className="dashboard-page-i16" style={{ color: palette.text }}>Certificate Compliance</h3>
        <span
          className="dashboard-page-i17" style={{ color: clay.accentDark, background: clay.accentSoft, borderRadius: 12 }}
          onClick={() => void host._goToView('certificates')}
          title="Open Certificates & Compliance"
        >
          {vCount} vessels
        </span>
      </div>

      {data.loading ? (
        <EmptyNote palette={palette}>Loading certificate compliance…</EmptyNote>
      ) : (
        <div className="dashboard-page-i18 vdms-dashboard__compliance">
          <DonutChart
            palette={palette}
            centerValue={data.totalTracked === 0 ? '0%' : data.complianceRateDisplay}
            centerLabel="COMPLIANT"
            segments={[
              { value: data.mandatoryValid, color: clay.pillActiveText },
              { value: data.mandatoryMissing, color: '#DC2626' },
              { value: data.optionalHeld, color: clay.pillWarnText },
              { value: data.notApplicable, color: palette.muted },
            ]}
          />
          <div className="dashboard-page-i19" style={{ minWidth: 150 }}>
            <DonutLegendRow
              label="Mandatory (Updated)"
              count={data.mandatoryValid}
              total={data.totalTracked}
              color={clay.pillActiveText}
              palette={palette}
            />
            <DonutLegendRow
              label="Mandatory (Not Updated)"
              count={data.mandatoryMissing}
              total={data.totalTracked}
              color="#DC2626"
              palette={palette}
            />
            <DonutLegendRow
              label="Optional"
              count={data.optionalHeld}
              total={data.totalTracked}
              color={clay.pillWarnText}
              palette={palette}
            />
            <DonutLegendRow
              label="Not Applicable (N/A)"
              count={data.notApplicable}
              total={data.totalTracked}
              color={palette.muted}
              palette={palette}
            />
          </div>
        </div>
      )}

      <div className="dashboard-page-i20" style={{ color: palette.muted }}>
        <span>
          Mandatory compliance: <strong>{data.complianceRateDisplay}</strong> ({data.mandatoryValid} of {data.mandatoryTotal} required updated)
        </span>
        <span
          className="dashboard-page-i21" style={{ color: clay.accent }}
          onClick={() => void host._goToView('certificates')}
        >
          View Matrix &rarr;
        </span>
      </div>
    </>
  );
}

function DocumentActivityTrend(props: { host: VesselEmail; siteKey: string; nonce: number; palette: Palette }): React.ReactElement {
  const { host, siteKey, nonce, palette } = props;
  const [months, setMonths] = React.useState<Array<{ month: string; count: number }> | null>(null);
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const base = host._base();
    if (!base) return undefined;
    setMonths(null);
    setError('');

    const fetchActivity = (): void => {
      const params = new URLSearchParams();
      if (siteKey && siteKey !== 'all') params.set('site_key', siteKey);
      params.set('date_field', 'modified');
      params.set('page', '1');
      params.set('page_size', '5'); // facets cover the whole site-scoped set regardless of page size
      host._fetchJson(`${base}/api/dashboard/documents?${params.toString()}`)
        .then((res: any) => {
          if (cancelled) return;
          if (res?.scan_pending) {
            retryTimer = setTimeout(fetchActivity, 2500);
            return;
          }
          setMonths(Array.isArray(res?.facets?.months) ? res.facets.months : []);
        })
        .catch((err: any) => { if (!cancelled) setError(err?.message || 'Could not load activity'); });
    };

    fetchActivity();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, nonce]);

  const last6 = React.useMemo(() => {
    const byMonth = new Map((months || []).map(m => [m.month, m.count]));
    const now = new Date();
    const out: Array<{ label: string; value: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ label: MONTH_NAMES[d.getMonth()], value: byMonth.get(key) || 0 });
    }
    return out;
  }, [months]);

  return (
    <>
      <div className="dashboard-page-i22">
        <h3 className="dashboard-page-i16" style={{ color: palette.text }}>Document Activity</h3>
      </div>
      <p className="dashboard-page-i23" style={{ color: palette.muted }}>Files added or modified, last 6 months</p>
      {error ? (
        <EmptyNote palette={palette}>Couldn't load activity — {error}</EmptyNote>
      ) : months === null ? (
        <EmptyNote palette={palette}>Loading…</EmptyNote>
      ) : last6.every(m => m.value === 0) ? (
        <EmptyNote palette={palette}>No document activity recorded yet</EmptyNote>
      ) : (
        <MiniBarChart data={last6} palette={palette} />
      )}
    </>
  );
}

// ── Compact activity/attention row ───────────────────────────────────────────
function ListRow(props: { icon: string; iconBg: string; iconColor: string; title: string; sub: string; when?: string; onClick?: () => void }): React.ReactElement {
  const { icon, iconBg, iconColor, title, sub, when, onClick } = props;
  return (
    <div
      className="vdms-list-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box', height: 48, padding: '0 8px', borderRadius: 10, flexShrink: 0, ...(onClick ? { cursor: 'pointer' } : null) }}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : null)}
    >
      <div className="dashboard-page-i24" style={{ minWidth: 32, background: iconBg, color: iconColor }}>
        <Icon iconName={icon} className="dashboard-page-i25" />
      </div>
      <div className="dashboard-page-i26" style={{ minWidth: 0 }}>
        <div className="dashboard-page-i27">{title}</div>
        <div className="dashboard-page-i28" style={{ opacity: 0.75 }}>{sub}</div>
      </div>
      {when && <div className="dashboard-page-i29" style={{ opacity: 0.6 }}>{when}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function renderDashboard(host: VesselEmail): React.ReactElement {
  const { vessels, dashboardStats } = host.state;
  const cardSurface = 'var(--vdms-glass)';
  const cardBorder = 'var(--vdms-line)';
  const primaryText = 'var(--vdms-text)';
  const mutedText = 'var(--vdms-text-muted)';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = String(host.props.userDisplayName || '').trim().split(/\s+/)[0] || 'there';
  const unreadAlerts = host._unreadAlertCount();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  const palette: Palette = { surface: cardSurface, border: cardBorder, text: primaryText, muted: mutedText };
  const isPending = Boolean(
    dashboardStats?.sites && dashboardStats.sites.some((s: any) => s.stats_pending)
  );
  const statsLoading = !dashboardStats || Boolean(host.state.dashboardStatsLoading) || isPending;

  // SharePoint site filter for the dashboard. Same "managed sites" heuristic
  // as the Vessels page's site filter, so the two dropdowns list the same
  // sites — but this one drives its own dashboardSiteFilter state, kept
  // separate so it doesn't disturb the Vessels/Documents site selections.
  const documentSites = host.state.documentSites || [];
  const filteredDocumentSites = documentSites.filter(site => {
    const siteKey = String(site.site_key || site.site_id || site.sp_site_name || '').toLowerCase();
    const siteName = String(site.sp_site_name || site.site_key || site.site_id || '').toLowerCase();
    // Exclude legacy client names if any slip through
    if (siteKey.includes('nks') || siteName.includes('nks') || siteKey.includes('docman')) return false;
    return true;
  });
  const dashboardSiteOptions = Array.from(new Map(
    filteredDocumentSites.map(site => [String(site.site_key || site.site_id || site.sp_site_name || '').toLowerCase(), site])
  ).values()).map(site => ({
    key: String(site.site_key || site.site_id || site.sp_site_name || ''),
    label: site.sp_site_name || site.site_key || site.site_id || 'SharePoint Site',
  }));

  const defaultDashboardKey = dashboardSiteOptions[0]?.key || 'demodms';
  const siteFilter = host.state.dashboardSiteFilter || defaultDashboardKey;

  const totalFiles = dashboardStats ? (dashboardStats.total_files ?? dashboardStats.total_documents) : undefined;
  const siteRows: DashboardSiteSummary[] = dashboardStats?.sites || [];
  const totalVessels = dashboardStats?.total_vessels ?? (vessels || []).length;

  // Fleet status for the selected site. Active = a vessel folder holding at
  // least one document (dashboard stats, computed per site by the backend);
  // In Maintenance = a DMS vessel record marked so. Older backends without
  // active_vessels fall back to the DMS records' status field.
  const siteFilterLow = siteFilter.toLowerCase();
  const vesselList: VesselRecord[] = (vessels || []).filter(v => {
    if (siteFilter === 'all') return true;
    const siteKey = String(v.provisioned_site_key || '').toLowerCase();
    const siteIds = (v.provisioned_site_ids || []).map(s => String(s).toLowerCase());
    return siteKey === siteFilterLow || siteIds.includes(siteFilterLow) || siteKey.includes(siteFilterLow);
  });
  let maintenanceVesselCount = 0;
  let activeVesselCount = 0, otherVesselCount = 0;
  vesselList.forEach(v => {
    const s = v.status || 'Active';
    if (s === 'In Maintenance') maintenanceVesselCount++;
    else if (s === 'Active') activeVesselCount++;
    else otherVesselCount++;
  });
  let fleetTotal = vesselList.length;
  if (dashboardStats && typeof dashboardStats.active_vessels === 'number') {
    fleetTotal = totalVessels || 0;
    maintenanceVesselCount = Math.min(maintenanceVesselCount, fleetTotal);
    activeVesselCount = Math.max(0, Math.min(dashboardStats.active_vessels, fleetTotal - maintenanceVesselCount));
    otherVesselCount = Math.max(0, fleetTotal - activeVesselCount - maintenanceVesselCount);
  }

  // Requires attention — real signals only: sites the backend failed to scan,
  // and unread anomaly alerts (unrecognised vessel folders, files uploaded
  // outside the DMS tree, unexpected subfolders). No invented "expiring /
  // expired document" counts: the backend doesn't track document expiry.
  const siteIssues = siteRows.filter(s => !!s.error);
  // Anomaly alerts carry the site they were found in (site_key, from /api/anomalies):
  // with a site selected only that site's alerts count.
  const sameSite = (a: string | null | undefined, b: string): boolean => String(a || '').trim().toLowerCase() === b.trim().toLowerCase();
  const unreadAnomalies = (host.state.alertsList || [])
    .filter(a => ANOMALY_ALERT_TYPES.has(a.alert_type) && !a.read && (siteFilter === 'all' || sameSite(a.site_key, siteFilter)))
    .sort((a, b) => alertEpoch(b) - alertEpoch(a));
  // Vessels whose folder holds no documents (names from the dashboard stats, so
  // it follows the selected site and each refresh); IMO from the vessel records.
  const normName = (n: string): string => String(n || '').trim().toLowerCase();
  const imoByName = new Map<string, string>();
  vesselList.forEach(v => { if (v.imo) imoByName.set(normName(v.name), String(v.imo)); });
  const noDocVessels: string[] = dashboardStats?.vessels_without_documents_list || [];
  const openAttentionFromDashboard = (name: string): void => {
    host.setState({
      alertsAttentionSite: siteFilter,
      alertsAttentionVessel: name,
      alertCategory: 'all',
      alertFilter: 'all',
      selectedAlertId: null,
    });
    void host._goToView('alerts');
  };
  const attentionItems: Array<{ key: string; icon: string; title: string; sub: string; when?: string; onClick?: () => void }> = [
    ...noDocVessels.map(name => ({
      key: `nodocs:${name}`, icon: 'Ferry', title: name,
      sub: imoByName.get(normName(name)) ? `IMO ${imoByName.get(normName(name))} · No Documents` : 'No Documents',
      onClick: () => openAttentionFromDashboard(name),
    })),
    ...siteIssues.map(s => ({
      key: `site:${s.site_key}`, icon: 'Warning',
      title: s.site_name || s.site_key, sub: s.error || 'Unable to load this site',
      onClick: () => {
        host.setState({
          alertsAttentionSite: s.site_key,
          alertsAttentionVessel: null,
          alertCategory: 'all',
          alertFilter: 'all',
          selectedAlertId: null,
        });
        void host._goToView('alerts');
      },
    })),
    ...unreadAnomalies.map(a => ({
      key: a.id, icon: iconForAlert(a),
      title: a.folder_name || a.vessel_name || humanize(a.alert_type),
      sub: humanize(a.alert_type), when: timeAgo(alertEpoch(a)),
      onClick: () => {
        host.setState({
          alertsAttentionSite: siteFilter,
          alertsAttentionVessel: null,
          alertCategory: 'all',
          alertFilter: 'all',
          selectedAlertId: a.id,
        });
        void host._goToView('alerts');
      },
    })),
  ];
  const attentionCount = attentionItems.length;

  // Routine "no changes" vessel syncs are left out so the list shows real activity.
  const recentActivity = [...(host.state.alertsList || [])]
    .filter(a => !isNoChangeVesselSync(a) && (siteFilter === 'all' || sameSite(a.site_key, siteFilter)))
    .sort((a, b) => alertEpoch(b) - alertEpoch(a))
    .slice(0, 6);

  const refresh = (): void => {
    void host._loadDashboardStats(true).then(() => {
      refreshNonce += 1;
      host.forceUpdate();
    });
  };

  const kpiCard = (opts: { label: string; value: number | undefined; icon: string; tone?: 'neutral' | 'success' | 'warning'; sub?: React.ReactNode; onClick?: () => void }): React.ReactElement => {
    const tone = opts.tone || 'neutral';
    const iconBg = tone === 'success' ? clay.pillActiveBg : tone === 'warning' ? clay.pillWarnBg : clay.accentSoft;
    const iconColor = tone === 'success' ? clay.pillActiveText : tone === 'warning' ? clay.pillWarnText : clay.accentDark;
    return (
      <div
        onClick={opts.onClick}
        className="dashboard-page-i30 vdms-dashboard__kpi" style={{ background: cardSurface, border: `1px solid ${cardBorder}`, boxShadow: clay.shadowRaised, cursor: opts.onClick ? 'pointer' : 'default' }}
      >
        <div className="dashboard-page-i31">
          <span className="dashboard-page-i32 vdms-dashboard__kpi-label" style={{ color: mutedText }}>{opts.label}</span>
          <div className="dashboard-page-i33" style={{ background: iconBg, color: iconColor }}>
            <Icon iconName={opts.icon} className="dashboard-page-i25" />
          </div>
        </div>
        <div className="dashboard-page-i34 vdms-dashboard__kpi-value" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: primaryText }}>
          {statsLoading ? <span className="dashboard-page-i35" style={{ color: mutedText }}>…</span> : formatNumber(opts.value)}
        </div>
        {opts.sub}
      </div>
    );
  };

  const sectionHeader = (title: string, right?: React.ReactNode): React.ReactElement => (
    <div className="dashboard-page-i15">
      <h3 className="dashboard-page-i16" style={{ color: primaryText }}>{title}</h3>
      {right}
    </div>
  );

  // "View all" on the attention card / KPI: the attention list for the site currently selected above.
  const viewAllAttentionLink = (show: boolean): React.ReactElement | undefined => show ? (
    <button
      type="button"
      className="vdms-link-btn"
      onClick={e => {
        e.stopPropagation();
        host.setState({ alertsAttentionSite: siteFilter, alertsAttentionVessel: null, alertCategory: 'all', alertFilter: 'all', selectedAlertId: null });
        void host._goToView('alerts');
      }}
      style={{ background: 'none', border: 'none', outline: 'none', boxShadow: 'none', color: clay.accentDark, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
    >
      View all →
    </button>
  ) : undefined;
  const viewAllAlertsLink = (show: boolean): React.ReactElement | undefined => show ? (
    <button type="button" className="vdms-link-btn" onClick={() => { void host._goToView('alerts'); }} style={{ background: 'none', border: 'none', outline: 'none', boxShadow: 'none', color: clay.accentDark, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
      View all →
    </button>
  ) : undefined;

  return (
    <div className="dashboard-page-i36 vdms-dashboard">
      {/* Header: page title + subtitle (left), site filter + refresh (right) */}
      <div className="dashboard-page-i37 vdms-dashboard__header">
        <div>
          <h1 className="dashboard-page-i38" style={{ letterSpacing: '-0.02em', color: primaryText, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
            Dashboard
          </h1>
          <p className="dashboard-page-i39" style={{ color: mutedText }}>Vessel compliance and document overview</p>
        </div>
        <div className="dashboard-page-i40 vdms-dashboard__actions">
          <SiteSelector
            value={siteFilter}
            width={230}
            minWidth={190}
            onChange={key => host._handleDashboardSiteChange(key)}
            options={[{ key: 'all', label: 'All SharePoint Sites' }, ...dashboardSiteOptions.map(site => ({ key: site.key, label: site.label }))]}
          />
          <button
            type="button"
            onClick={refresh}
            title="Re-count files, folders and vessels"
            className="dashboard-page-i41" style={{ borderRadius: 8, border: `1px solid ${cardBorder}`, background: cardSurface, color: primaryText, boxShadow: clay.shadowRaised }}
          >
            <Icon iconName="Refresh" className="dashboard-page-i42" /> Refresh
          </button>
        </div>
      </div>

      {/* Greeting banner card — clean solid surface */}
      <div className="dashboard-page-i43 vdms-dashboard__banner" style={{ border: `1px solid ${cardBorder}`, boxShadow: clay.shadowRaised }}>
        <div className="dashboard-page-i44">
          <div className="dashboard-page-i45" style={{ color: clay.accent }}>{dateLabel}</div>
          <div className="dashboard-page-i46" style={{ color: primaryText }}>
            {greeting}, {firstName} — {unreadAlerts > 0 ? `${unreadAlerts} alert${unreadAlerts === 1 ? '' : 's'} need${unreadAlerts === 1 ? 's' : ''} attention.` : 'the fleet is all caught up.'}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="dashboard-page-i47 vdms-dashboard__kpis">
        {kpiCard({ label: 'Total Vessels', value: totalVessels, icon: 'Ferry', onClick: () => void host._goToView('vessels') })}
        {kpiCard({
          label: 'Active Vessels', value: activeVesselCount, icon: 'CheckMark', tone: 'success',
          sub: fleetTotal > 0 ? <span className="dashboard-page-i48" style={{ color: mutedText }}>with documents, of {fleetTotal}</span> : undefined,
          onClick: () => void host._goToView('vessels'),
        })}
        {kpiCard({ label: 'Total Documents', value: totalFiles, icon: 'Page', onClick: () => void host._goToView('list') })}
        {kpiCard({
          label: 'Needs Attention', value: attentionCount, icon: 'Warning', tone: attentionCount > 0 ? 'warning' : 'success',
          sub: viewAllAttentionLink(attentionCount > 0),
          onClick: attentionCount > 0 ? () => {
            host.setState({ alertsAttentionSite: siteFilter, alertsAttentionVessel: null, alertCategory: 'all', alertFilter: 'all', selectedAlertId: null });
            void host._goToView('alerts');
          } : undefined,
        })}
      </div>

      {/* Fleet status + document activity */}
      <div className="dashboard-page-i49 vdms-dashboard__rows">
        <SectionCard palette={palette}>
          <CertificateComplianceCard
            host={host}
            siteKey={siteFilter}
            nonce={refreshNonce}
            palette={palette}
            fallbackVesselCount={fleetTotal}
          />
        </SectionCard>

        <SectionCard palette={palette}>
          <DocumentActivityTrend host={host} siteKey={siteFilter} nonce={refreshNonce} palette={palette} />
        </SectionCard>
      </div>

      {/* Requires attention + recent activity */}
      <div className="dashboard-page-i49 vdms-dashboard__rows">
        <SectionCard palette={palette}>
          {sectionHeader('Requires Attention', viewAllAttentionLink(attentionCount > 0))}
          {attentionItems.length === 0 ? (
            <EmptyNote palette={palette}>{statsLoading ? 'Nothing needs attention right now' : (siteFilter === 'all' ? 'All vessels have documents' : 'No issues found for this site.')}</EmptyNote>
          ) : (
            <div className="dashboard-page-i50" style={{ color: primaryText }}>
              {attentionItems.map(item => (
                <ListRow key={item.key} icon={item.icon} iconBg={clay.pillWarnBg} iconColor={clay.pillWarnText} title={item.title} sub={item.sub} when={item.when} onClick={item.onClick} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard palette={palette}>
          {sectionHeader('Recent Activity', viewAllAlertsLink(recentActivity.length > 0))}
          {recentActivity.length === 0 ? (
            <EmptyNote palette={palette}>No recent activity yet</EmptyNote>
          ) : (
            <div className="dashboard-page-i51" style={{ color: primaryText }}>
              {recentActivity.map(a => (
                <ListRow
                  key={a.id}
                  icon={iconForAlert(a)}
                  iconBg={clay.accentSoft}
                  iconColor={clay.accentDark}
                  title={a.alert_type === 'crud_operation' ? (a.folder_name || 'Activity').replace(/^Vessel Sync$/, 'Vessel sync') : (a.folder_name || a.vessel_name || humanize(a.alert_type))}
                  sub={a.alert_type === 'crud_operation' && a.folder_path ? a.folder_path.replace(/^vessel sync:\s*/i, '') : humanize(a.alert_type)}
                  when={timeAgo(alertEpoch(a))}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
