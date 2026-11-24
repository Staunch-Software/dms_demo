import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { SiteSelector } from '../SiteSelector';
import { DmsPageHeader, dmsBtn, DMS_FONT_DISPLAY } from '../dmsDesignSystem';

/**
 * Reports — every document in every vessel folder (all groups) in one
 * Excel-like table: Document Name, Vessel, Main Folder, Group, Category.
 *
 * Each column header has a filter drop-down like Excel's (search, select all,
 * tick values, sort A→Z / Z→A); the values offered follow the other active
 * filters. "Download Excel" exports exactly the rows on screen (same filters,
 * applied server-side) — GET /api/reports/documents-excel.
 *
 * Data: GET /api/reports/drawings-manuals?site_key= (cached document index).
 */

interface ReportRow { name: string; vessel: string; main_folder: string; group: string; category: string; web_url: string; id?: string }
type ColKey = 'name' | 'vessel' | 'main_folder' | 'group' | 'category';

const COLUMNS: Array<{ key: ColKey; label: string; width: string }> = [
  { key: 'name', label: 'Document Name', width: '36%' },
  { key: 'vessel', label: 'Vessel Name', width: '15%' },
  { key: 'main_folder', label: 'Main Folder', width: '17%' },
  { key: 'group', label: 'Group', width: '16%' },
  { key: 'category', label: 'Category', width: '16%' },
];
const PAGE = 300;
const LINE = 'var(--vdms-line)';

function unique(rows: ReportRow[], key: ColKey): string[] {
  return Array.from(new Set(rows.map(r => r[key]))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function FilterMenu(props: {
  label: string;
  values: string[];
  selected: Set<string> | null;
  onApply: (next: Set<string> | null) => void;
  onSort: (dir: 'asc' | 'desc') => void;
  onClose: () => void;
  anchor: DOMRect;
  theme?: string;
}): React.ReactPortal {
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState<Set<string>>(new Set(props.selected || props.values));
  const ref = React.useRef<HTMLDivElement>(null);
  const shown = props.values.filter(v => v.toLowerCase().indexOf(search.trim().toLowerCase()) >= 0);
  const allShownOn = shown.length > 0 && shown.every(v => draft.has(v));

  React.useEffect(() => {
    // Clicks on a column's filter button toggle the menu themselves.
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !(t.closest && t.closest('[data-report-filter-btn]'))) props.onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggleAll = (): void => {
    const next = new Set(draft);
    shown.forEach(v => (allShownOn ? next.delete(v) : next.add(v)));
    setDraft(next);
  };
  const apply = (): void => {
    props.onApply(draft.size === props.values.length ? null : new Set(draft));
    props.onClose();
  };

  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, color: clay.text, background: 'none', border: 'none', width: '100%', textAlign: 'left' };
  // Rendered on <body> with fixed position: inside the table's scroll area
  // the menu was clipped and its OK / Clear buttons were unreachable.
  const width = 270;
  const left = Math.max(8, Math.min(props.anchor.right - width, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - props.anchor.bottom - 12;
  const openUp = spaceBelow < 320 && props.anchor.top > spaceBelow;
  const maxH = Math.max(260, (openUp ? props.anchor.top - 12 : spaceBelow) - 4);
  const pos: React.CSSProperties = openUp
    ? { bottom: window.innerHeight - props.anchor.top + 4 }
    : { top: props.anchor.bottom + 4 };
  return ReactDOM.createPortal(
    <div data-vessel-theme={props.theme} style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
    <div ref={ref} role="dialog" aria-label={`Filter ${props.label}`}
      style={{ position: 'fixed', left, ...pos, zIndex: 100002, width, maxHeight: maxH, display: 'flex', flexDirection: 'column', background: clay.surface, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: '0 12px 30px rgba(11,42,74,0.25)', padding: 8, boxSizing: 'border-box' }}>
      <button type="button" style={item} onClick={() => { props.onSort('asc'); props.onClose(); }}><Icon iconName="SortUp" /> Sort A → Z</button>
      <button type="button" style={item} onClick={() => { props.onSort('desc'); props.onClose(); }}><Icon iconName="SortDown" /> Sort Z → A</button>
      <div className="document-report-page-i1" style={{ borderTop: `1px solid ${LINE}` }} />
      <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
        className="document-report-page-i2" style={{ width: '100%', borderRadius: 6, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }} />
      <div className="document-report-page-i3">
        <label style={{ ...item, fontWeight: 600 }}>
          <input type="checkbox" checked={allShownOn} onChange={toggleAll} /> (Select all)
        </label>
        {shown.map(v => (
          <label key={v} style={item}>
            <input type="checkbox" checked={draft.has(v)} onChange={() => {
              const next = new Set(draft);
              if (next.has(v)) next.delete(v); else next.add(v);
              setDraft(next);
            }} />
            <span className="document-report-page-i4">{v || '(blank)'}</span>
          </label>
        ))}
        {shown.length === 0 && <div className="document-report-page-i5" style={{ color: clay.textMuted }}>No matches</div>}
      </div>
      <div className="document-report-page-i6">
        <button type="button" onClick={() => { props.onApply(null); props.onClose(); }}
          style={{ ...dmsBtn('secondary'), height: 28, fontSize: 12, padding: '0 10px' }}>Clear</button>
        <button type="button" onClick={apply} disabled={draft.size === 0}
          style={{ ...dmsBtn('primary', draft.size > 0), height: 28, fontSize: 12, padding: '0 12px' }}>OK</button>
      </div>
    </div>
    </div>,
    document.body,
  );
}

export function DocumentReportPage({ host, embedded }: { host: VesselEmail; embedded?: boolean }): React.ReactElement {
  const sites = React.useMemo(() => {
    const seen = new Set<string>();
    return (host.state.documentSites || []).filter(s => {
      const k = String(s.site_key || '').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [host.state.documentSites]);

  const nksReportSite = sites.find(s => /nks|docman/i.test(`${s.site_key || ''} ${s.sp_site_name || ''}`));
  const defaultReportSiteKey = (host.state.activeDocumentSite && host.state.activeDocumentSite !== 'all')
    ? host.state.activeDocumentSite
    : nksReportSite?.site_key || (sites[0] && sites[0].site_key) || 'ozellardms';
  const [siteKey, setSiteKey] = React.useState<string>(defaultReportSiteKey);
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [filters, setFilters] = React.useState<Partial<Record<ColKey, Set<string> | null>>>({});
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<{ key: ColKey; dir: 'asc' | 'desc' } | null>(null);
  const [openMenu, setOpenMenu] = React.useState<ColKey | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<DOMRect | null>(null);
  const [limit, setLimit] = React.useState(PAGE);
  const [downloading, setDownloading] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);
  // Embedded in the Vessel DMS page: size the table's scroll area to the space actually left in the
  // window (from its top edge down to the bottom), re-measured on resize / scroll / data changes.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!embedded) return undefined;
    const measure = (): void => {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setFitHeight(Math.max(320, Math.floor(window.innerHeight - top - 24)));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [embedded, loading]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const qs = siteKey && siteKey !== 'all' ? `?site_key=${encodeURIComponent(siteKey)}` : '';
    fetch(`${host._base()}/api/reports/drawings-manuals${qs}`, { headers: host._headers() })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.detail || data.message || `Could not load the report (${r.status}).`);
        return data;
      })
      .then(d => { if (!cancelled) { setRows(d.rows || []); setFilters({}); setLimit(PAGE); } })
      .catch(e => { if (!cancelled) { setRows([]); setError((e as Error).message); } })
      .then(() => { if (!cancelled) setLoading(false); }, () => undefined);
    return () => { cancelled = true; };
  }, [siteKey, nonce]);

  const matches = (r: ReportRow, skip?: ColKey): boolean => {
    for (const c of COLUMNS) {
      if (c.key === skip) continue;
      const f = filters[c.key];
      if (f && !f.has(r[c.key])) return false;
    }
    const q = search.trim().toLowerCase();
    return !q || COLUMNS.some(c => r[c.key].toLowerCase().indexOf(q) >= 0);
  };

  const visible = React.useMemo(() => {
    const out = rows.filter(r => matches(r));
    if (sort) {
      const m = sort.dir === 'asc' ? 1 : -1;
      out.sort((a, b) => m * a[sort.key].localeCompare(b[sort.key], undefined, { sensitivity: 'base', numeric: true }));
    }
    return out;
  }, [rows, filters, search, sort]);

  const activeCount = COLUMNS.filter(c => filters[c.key]).length + (search.trim() ? 1 : 0);

  const download = async (): Promise<void> => {
    if (downloading) return;
    setDownloading(true);
    try {
      const params: string[] = [];
      if (siteKey && siteKey !== 'all') params.push(`site_key=${encodeURIComponent(siteKey)}`);
      COLUMNS.forEach(c => {
        const f = filters[c.key];
        if (f) f.forEach(v => params.push(`${c.key}=${encodeURIComponent(v)}`));
      });
      if (search.trim()) params.push(`q=${encodeURIComponent(search.trim())}`);
      const res = await fetch(`${host._base()}/api/reports/documents-excel${params.length ? `?${params.join('&')}` : ''}`, { headers: host._headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (match && match[1]) || `Vessel-Documents-${siteKey}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message || 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const th: React.CSSProperties = { fontFamily: DMS_FONT_DISPLAY, position: 'sticky', top: 0, zIndex: 2, background: clay.surfaceRaised, textAlign: 'left', padding: '9px 10px', fontSize: 12, fontWeight: 700, color: clay.textMuted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `2px solid ${LINE}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontFamily: DMS_FONT_DISPLAY, fontWeight: 500, padding: '7px 10px', fontSize: 13, color: clay.text, borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };

  return (
    <div className={embedded ? 'document-report-page-i7 document-report-page-embedded' : 'document-report-page-i7'} style={{ minWidth: 0, fontFamily: DMS_FONT_DISPLAY }}>
      {(() => {
        const actions = (
          <>
            <button type="button" onClick={() => setNonce(n => n + 1)} disabled={loading} style={dmsBtn('secondary', !loading)}>
              <Icon iconName="Refresh" className="document-report-page-i8" /> Refresh
            </button>
            <button type="button" onClick={() => void download()} disabled={downloading || loading || visible.length === 0}
              style={dmsBtn('primary', !(downloading || loading || visible.length === 0))}>
              <Icon iconName="ExcelDocument" className="document-report-page-i8" /> {downloading ? 'Preparing…' : `Download Excel (${visible.length.toLocaleString()})`}
            </button>
          </>
        );
        // Embedded in the Vessel DMS page: that page already owns the header,
        // so only the report's own actions are shown, right-aligned.
        if (embedded) return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{actions}</div>;
        return (
          <DmsPageHeader title="Reports" subtitle="Every document in every vessel folder — all groups — in one table. Filter it like Excel, then download exactly what you see.">
            {actions}
          </DmsPageHeader>
        );
      })()}

      <div className="document-report-page-i9">
        <div className="document-report-page-i10" style={{ color: clay.textMuted }}>
          <Icon iconName="SharepointLogo" style={{ color: clay.accent }} /> <span>Site</span>
          <SiteSelector
            ariaLabel="Site"
            minWidth={230}
            value={siteKey}
            onChange={setSiteKey}
            options={[
              ...sites.map(s => ({ key: s.site_key, label: s.sp_site_name || s.site_key })),
              { key: 'all', label: 'All SharePoint Sites' },
            ]}
          />
        </div>
        <div className="document-report-page-i11">
          <Icon iconName="Search" className="document-report-page-i12" style={{ color: clay.textMuted }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setLimit(PAGE); }} placeholder="Search document, vessel, category…"
            className="document-report-page-i13" style={{ width: '100%', borderRadius: 8, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text, fontFamily: DMS_FONT_DISPLAY }} />
        </div>
        {activeCount > 0 && (
          <button type="button" onClick={() => { setFilters({}); setSearch(''); setSort(null); }}
            style={{ ...dmsBtn('secondary'), height: 32, fontSize: 12.5 }}>
            <Icon iconName="ClearFilter" className="document-report-page-i14" /> Clear filters ({activeCount})
          </button>
        )}
        <span className="document-report-page-i15" style={{ color: clay.textMuted }}>
          {loading ? 'Loading…' : `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} documents`}
        </span>
      </div>

      {error && <div className="document-report-page-i16" style={{ borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}

      {/* The rounded, bordered frame clips (overflow hidden); the inner box does the scrolling. With both on one
          element the native scrollbar and sticky header paint over the right-hand corners and leave them square. */}
      <div className="document-report-page-i17" style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: clay.surface }}>
      <div className="document-report-page-i18" ref={scrollRef} style={embedded && fitHeight ? { height: fitHeight, maxHeight: fitHeight } : undefined}>
        <table className="document-report-page-i19" style={{ width: '100%', minWidth: 900 }}>
          <colgroup>
            <col className="document-report-page-i20" />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'right' }}>#</th>
              {COLUMNS.map(c => {
                const active = !!filters[c.key];
                return (
                  <th key={c.key} style={th}>
                    <div className="document-report-page-i21">
                      <span>{c.label}</span>
                      {sort && sort.key === c.key && <Icon iconName={sort.dir === 'asc' ? 'SortUp' : 'SortDown'} className="document-report-page-i22" />}
                      <button type="button" aria-label={`Filter ${c.label}`} title={`Filter ${c.label}`}
                        data-report-filter-btn=""
                        onClick={e => { setMenuAnchor(e.currentTarget.getBoundingClientRect()); setOpenMenu(openMenu === c.key ? null : c.key); }}
                        className="document-report-page-i23" style={{ width: 24, border: `1px solid ${active ? clay.accent : LINE}`, background: active ? clay.accentSoft : clay.surface, color: active ? clay.accentDark : clay.textMuted }}>
                        <Icon iconName={active ? 'FilterSolid' : 'ChevronDown'} className="document-report-page-i24" />
                      </button>
                      {openMenu === c.key && menuAnchor && (
                        <FilterMenu label={c.label} anchor={menuAnchor} theme={host.state.themeMode}
                          values={unique(rows.filter(r => matches(r, c.key)), c.key)}
                          selected={filters[c.key] || null}
                          onApply={next => { setFilters(f => ({ ...f, [c.key]: next })); setLimit(PAGE); }}
                          onSort={dir => setSort({ key: c.key, dir })}
                          onClose={() => setOpenMenu(null)} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 30, color: clay.textMuted }}>
                {rows.length ? 'No documents match these filters.' : 'No vessel documents found for this site yet.'}
              </td></tr>
            )}
            {visible.slice(0, limit).map((r, i) => (
              <tr key={(r.id || r.name) + i} style={{ background: i % 2 ? clay.surfaceRaised : clay.surface }}>
                <td style={{ ...td, textAlign: 'right', color: clay.textMuted, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                <td style={{ ...td, wordBreak: 'break-word' }}>
                  {r.web_url
                    ? <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="document-report-page-i25" style={{ color: clay.accent }}>{r.name}</a>
                    : r.name}
                </td>
                <td style={td}>{r.vessel}</td>
                <td style={td}>{r.main_folder}</td>
                <td style={td}>{r.group}</td>
                <td style={td}>{r.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > limit && (
          <div className="document-report-page-i26">
            <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ ...dmsBtn('secondary'), height: 32 }}>
              Show {Math.min(PAGE, visible.length - limit).toLocaleString()} more ({(visible.length - limit).toLocaleString()} left)
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
