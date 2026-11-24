import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';

/**
 * Document-management summary shown on each Vessels-page card: how many
 * documents the vessel has, their size, when they were last updated, and how
 * they split across Drawings / Manuals / To Be Classified.
 *
 * Data: GET /api/dashboard/vessel-summary?site_key= (built from the cached
 * dashboard scan — no extra SharePoint calls). One request per site is
 * shared by every card on the page and reused for a minute.
 */

export interface VesselDocSummary {
  name: string;
  total: number;
  size_bytes: number;
  last_modified_epoch: number;
  last_modified_by: string | null;
  drawings: number;
  manuals: number;
  certificates?: number;
  to_be_classified: number;
  other: number;
}

interface SummaryResponse { scan_pending: boolean; vessels: Record<string, VesselDocSummary> }

/**
 * Vessels-page card size. true = the compact card (short banner, one-line
 * counts, small buttons); set to false to get the original larger card back.
 */
export const COMPACT_VESSEL_CARD = true;

/** true brings back the ship image banner on the card; false (current) uses the initials header. */
export const VESSEL_CARD_SHOW_IMAGE = false;

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<SummaryResponse> }>();

function loadSummary(host: VesselEmail, siteKey: string): Promise<SummaryResponse> {
  const hit = cache.get(siteKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const qs = siteKey && siteKey !== 'all' ? `?site_key=${encodeURIComponent(siteKey)}` : '';
  const promise = fetch(`${host._base()}/api/dashboard/vessel-summary${qs}`, { headers: host._headers() })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { cache.delete(siteKey); throw e; });
  cache.set(siteKey, { at: Date.now(), promise });
  return promise;
}

/** Drop cached figures (e.g. after the page's refresh button). */
export function clearVesselSummaryCache(): void { cache.clear(); }

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

function formatWhen(epoch: number): string {
  if (!epoch) return '—';
  const days = Math.floor((Date.now() - epoch) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(epoch).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const label: React.CSSProperties = {
  fontSize: 10, color: 'var(--vdms-text-3, #52708a)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
};

export function VesselDocumentPanel({ host, vesselName, siteKey, compact = false }: { host: VesselEmail; vesselName: string; siteKey: string; compact?: boolean }): React.ReactElement {
  const [state, setState] = React.useState<{ loading: boolean; pending: boolean; row: VesselDocSummary | null; error: boolean }>(
    { loading: true, pending: false, row: null, error: false },
  );

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    loadSummary(host, siteKey)
      .then((d) => {
        if (cancelled) return;
        const row = d.vessels[vesselName.trim().toLowerCase()] || null;
        setState({ loading: false, pending: d.scan_pending, row, error: false });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, pending: false, row: null, error: true }); });
    return () => { cancelled = true; };
  }, [host, vesselName, siteKey]);

  const box: React.CSSProperties = {
    background: 'var(--vdms-field, rgba(255,255,255,0.72))', borderRadius: 12, padding: '10px 12px',
    border: '1px solid var(--vdms-line, rgba(16,84,138,0.13))', display: 'flex', flexDirection: 'column', gap: 8,
    ...(compact ? { borderRadius: 10, padding: '10px 12px', gap: 6, flex: 1, justifyContent: 'center' } : null),
  };

  if (state.loading || state.pending) {
    return (
      <div style={box}>
        <span style={label}>Documents</span>
        <span className="vessel-document-panel-i1">
          <Icon iconName="Sync" className="vessel-document-panel-i2" />
          {state.pending ? 'Counting documents in SharePoint…' : 'Loading…'}
        </span>
      </div>
    );
  }
  if (state.error) {
    return (
      <div style={box}>
        <span style={label}>Documents</span>
        <span className="vessel-document-panel-i1">Document figures are unavailable right now.</span>
      </div>
    );
  }

  const row = state.row;
  if (!row || row.total === 0) {
    return (
      <div style={box}>
        <span style={label}>Documents</span>
        <span className="vessel-document-panel-i3">
          <Icon iconName="Page" className="vessel-document-panel-i4" />No documents yet
        </span>
      </div>
    );
  }

  const groups: { key: keyof VesselDocSummary; name: string; color: string; icon: string }[] = [
    { key: 'drawings', name: 'Drawings', color: clay.accent, icon: 'Design' },
    { key: 'manuals', name: 'Manuals', color: '#7c3aed', icon: 'ReadingMode' },
    { key: 'certificates', name: 'Certificates', color: '#059669', icon: 'Certificate' },
    { key: 'to_be_classified', name: 'To Be Classified', color: '#d97706', icon: 'Inbox' },
    { key: 'other', name: 'Other folders', color: '#94a3b8', icon: 'Page' },
  ];
  const shown = groups.filter((g) => ((row[g.key] as number) || 0) > 0);

  if (compact && row.drawings + row.manuals + (row.certificates || 0) + row.to_be_classified > 0) {
    // Compact card: balanced KPI tiles, proportion bar and metadata line.
    return (
      <div className="vdms-vdoc">
        {/* Soft stats panel: four tinted tiles (number + label), then the proportion bar and the update line. */}
        <div className="vdms-vdoc__tiles">
          {([
            // short / tiny: shorter spellings the stylesheet swaps in on narrow cards (see .vdms-vdoc__label)
            { key: 'drawings', label: 'Drawings', short: 'Drawings', tiny: 'Dwgs', bg: 'rgba(14,116,144,0.12)', fg: clay.accent },
            { key: 'manuals', label: 'Manuals', short: 'Manuals', tiny: 'Man.', bg: 'rgba(124,58,237,0.12)', fg: '#6d28d9' },
            { key: 'certificates', label: 'Certificates', short: 'Certs', tiny: 'Certs', bg: 'rgba(5,150,105,0.12)', fg: '#059669' },
            { key: 'to_be_classified', label: 'To classify', short: 'To sort', tiny: 'Sort', bg: 'rgba(217,119,6,0.14)', fg: '#b45309' },
          ] as const).map((t) => (
            <div key={t.key} title={t.key === 'to_be_classified' ? 'Documents waiting to be sorted into Drawings or Manuals' : t.label}
              className="vdms-vdoc__tile" style={{ background: t.bg }}>
              <div className="vdms-vdoc__num">{((row[t.key] as number) || 0).toLocaleString()}</div>
              <div className="vdms-vdoc__label" data-short={t.short} data-tiny={t.tiny} style={{ color: t.fg }}><span>{t.label}</span></div>
            </div>
          ))}
        </div>
        <div className="vdms-vdoc__bar">
          {shown.map((g) => (
            <div key={g.key} title={`${g.name}: ${row[g.key]}`} style={{ width: `${(((row[g.key] as number) || 0) / row.total) * 100}%`, background: g.color }} />
          ))}
        </div>
        <div className="vdms-vdoc__meta"
          title={row.last_modified_by ? `Last change by ${row.last_modified_by}` : undefined}>
          <Icon iconName="History" className="vessel-document-panel-i5" style={{ opacity: 0.8 }} />
          <span className="vdms-vdoc__meta-text">{formatWhen(row.last_modified_epoch)} · {formatBytes(row.size_bytes)}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div className="vessel-document-panel-i6">
        <span style={label}>Documents</span>
        <span className="vessel-document-panel-i7"
          title={row.last_modified_by ? `Last change by ${row.last_modified_by}` : undefined}>
          Updated {formatWhen(row.last_modified_epoch)} · {formatBytes(row.size_bytes)}
        </span>
      </div>
      {row.drawings + row.manuals + (row.certificates || 0) + row.to_be_classified === 0 ? (
        // Nothing sits in Drawings / Manuals / To Be Classified folders —
        // e.g. a site that isn't organised that way yet. One line instead
        // of a column of zeros.
        <div className="vessel-document-panel-i8">
          <b>{row.total.toLocaleString()}</b> file{row.total === 1 ? '' : 's'}
          <span className="vessel-document-panel-i9"> — not sorted into Drawings or Manuals yet</span>
        </div>
      ) : (<>
      {/* Proportion bar */}
      <div className="vessel-document-panel-i10">
        {shown.map((g) => (
          <div key={g.key} title={`${g.name}: ${row[g.key]}`} style={{ width: `${((row[g.key] as number) / row.total) * 100}%`, background: g.color }} />
        ))}
      </div>
      <div className="vessel-document-panel-i11">
        {groups.filter((g) => g.key !== 'other' || row.other > 0).map((g) => {
          const n = row[g.key] as number;
          const attention = g.key === 'to_be_classified' && n > 0;
          return (
            <div key={g.key} className="vessel-document-panel-i12" style={{ color: attention ? '#b45309' : 'var(--vdms-text)' }}
              title={attention ? 'Documents waiting to be sorted into Drawings or Manuals' : undefined}>
              <span className="vessel-document-panel-i13" style={{ background: g.color }} />
              <span className="vessel-document-panel-i14" style={{ fontWeight: attention ? 700 : 500 }}>{g.name}</span>
              <span className="vessel-document-panel-i15">{n.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      </>)}
    </div>
  );
}

/**
 * The document figures of one vessel as list-view cells (Drawings, Manuals,
 * To classify, mix bar, last update). Same data and cache as the card's
 * VesselDocumentPanel; renders a fragment so the parent row's grid lays it out.
 */
export function VesselDocStatsCells({ host, vesselName, siteKey }: { host: VesselEmail; vesselName: string; siteKey: string }): React.ReactElement {
  const [state, setState] = React.useState<{ loading: boolean; row: VesselDocSummary | null; error: boolean }>({ loading: true, row: null, error: false });
  const [tipOpen, setTipOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    loadSummary(host, siteKey)
      .then((d) => { if (!cancelled) setState({ loading: d.scan_pending, row: d.vessels[vesselName.trim().toLowerCase()] || null, error: false }); })
      .catch(() => { if (!cancelled) setState({ loading: false, row: null, error: true }); });
    return () => { cancelled = true; };
  }, [host, vesselName, siteKey]);

  const muted: React.CSSProperties = { fontSize: 12, color: 'var(--vdms-text-muted)' };
  const row = state.row;
  if (state.loading || state.error || !row) {
    const msg = state.loading ? 'Loading…' : state.error ? 'Unavailable' : 'No documents yet';
    return (
      <>
        <span style={muted}>—</span><span style={muted}>—</span><span style={muted}>—</span><span style={muted}>—</span>
        <span style={muted}>{msg}</span><span style={muted}>—</span>
      </>
    );
  }
  const num: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--vdms-text)' };
  const allParts = [
    { key: 'drawings', label: 'Drawings', color: clay.accent, n: row.drawings || 0 },
    { key: 'manuals', label: 'Manuals', color: '#7c3aed', n: row.manuals || 0 },
    { key: 'certificates', label: 'Certificates', color: '#059669', n: row.certificates || 0 },
    { key: 'to_be_classified', label: 'To classify', color: '#d97706', n: row.to_be_classified || 0 },
    { key: 'other', label: 'Other folders', color: '#94a3b8', n: row.other || 0 },
  ];
  const parts = allParts.filter((x) => x.n > 0);
  const pct = (n: number): string => `${row.total ? Math.round((n / row.total) * 100) : 0}%`;
  return (
    <>
      <span style={num}>{row.drawings.toLocaleString()}</span>
      <span style={num}>{row.manuals.toLocaleString()}</span>
      <span style={{ ...num, color: (row.certificates || 0) > 0 ? '#059669' : num.color }}>{(row.certificates || 0).toLocaleString()}</span>
      <span style={{ ...num, color: row.to_be_classified > 0 ? '#b45309' : num.color }}>{row.to_be_classified.toLocaleString()}</span>
      <div
        tabIndex={0}
        aria-label={`${vesselName}: ${allParts.map((x) => `${x.label} ${x.n}`).join(', ')}`}
        onMouseEnter={() => setTipOpen(true)} onMouseLeave={() => setTipOpen(false)}
        onFocus={() => setTipOpen(true)} onBlur={() => setTipOpen(false)}
        className="vessel-document-panel-i16"
      >
        <div className="vessel-document-panel-i10" style={{ width: '100%' }}>
          {parts.map((x) => <div key={x.key} style={{ width: `${(x.n / row.total) * 100}%`, background: x.color }} />)}
        </div>
        {tipOpen && (
          <div role="tooltip" className="vessel-document-panel-i17" style={{ minWidth: 200, borderRadius: 10 }}>
            <div className="vessel-document-panel-i18">{vesselName} · {row.total.toLocaleString()} files</div>
            {allParts.map((x) => (
              <div key={x.key} className="vessel-document-panel-i19">
                <span aria-hidden="true" className="vessel-document-panel-i20" style={{ background: x.color }} />
                <span>{x.label}</span>
                <span className="vessel-document-panel-i21">{x.n.toLocaleString()} · {pct(x.n)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span style={{ ...muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={row.last_modified_by ? `Last change by ${row.last_modified_by}` : undefined}>
        {formatWhen(row.last_modified_epoch)} · {formatBytes(row.size_bytes)}
      </span>
    </>
  );
}
