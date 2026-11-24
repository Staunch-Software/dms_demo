import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';

/**
 * Documents Copilot — a chat that finds documents from a plain-English
 * question ("latest manuals for Belle Lune", "how many drawings do we
 * have?", "PDFs uploaded last week") across every site in Site Management.
 *
 * A floating button pinned bottom-right on every page (mounted once by the
 * app shell); it opens a chat panel. Each answer can be refined with a
 * follow-up ("only drawings") — the previous answer's filters are sent back
 * as context — and every result opens the file in SharePoint.
 *
 * Backend: app/copilot/ —
 *   GET  /api/copilot/status  -> { configured }
 *   POST /api/copilot/query   -> { answer, mode, filters, results, total,
 *                                  breakdown, top_vessels, suggestions }
 * Works without an AI key (rule-based); with Azure OpenAI configured in the
 * backend .env it understands questions more freely.
 */

interface CopilotResult {
  id: string;
  name: string;
  vessel: string | null;
  group: string;
  file_type: string;
  site: string;
  site_name: string;
  path: string;
  modified: string;
  modified_by: string | null;
  size: string;
  web_url: string | null;
}
interface CopilotFilters {
  vessel: string | null; group: string | null; file_type: string | null;
  period: string | null; person: string | null; intent: string; keywords: string; site?: string | null;
}
interface CopilotResponse {
  answer: string;
  mode: 'ai' | 'keyword';
  filters: CopilotFilters;
  results: CopilotResult[];
  total: number;
  breakdown: { drawings: number; manuals: number; to_be_classified: number; other: number } | null;
  top_vessels: Array<{ name: string; count: number }>;
  by_site?: Array<{ name: string; count: number; vessels: number }>;
  suggestions: string[];
}
interface Turn { id: number; question: string; response?: CopilotResponse; error?: string }

const STARTERS: string[] = [
  'Which sites have our documents?',
  'How many drawings do we have?',
  'Documents uploaded this week',
  'What still needs classifying?',
  'Largest files',
];

const LINE = 'var(--vdms-line)';
const BRAND = 'linear-gradient(135deg, #0e7490 0%, #0b2a4a 100%)';

/** Minimal **bold** / *italic* rendering for the answer line. */
function renderRich(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] ? <strong key={i++}>{m[1]}</strong> : <em key={i++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf: { icon: 'PDF', color: '#dc2626' },
  word: { icon: 'WordDocument', color: '#2563eb' },
  excel: { icon: 'ExcelDocument', color: '#16a34a' },
  powerpoint: { icon: 'PowerPointDocument', color: '#ea580c' },
  image: { icon: 'FileImage', color: '#9333ea' },
  drawing: { icon: 'FileCAD', color: '#0e7490' },
  email: { icon: 'Mail', color: '#0891b2' },
  archive: { icon: 'ZipFolder', color: '#a16207' },
};

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return (j && (j.detail || j.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

function Chip(props: { label: React.ReactNode; onClick?: () => void; title?: string }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className="copilot-search-panel-i1" style={{ border: `1px solid ${LINE}`, background: clay.surface, color: clay.accentDark, cursor: props.onClick ? 'pointer' : 'default' }}
    >
      {props.label}
    </button>
  );
}

function ResultCard({ item, onOpen }: { item: CopilotResult; onOpen: (r: CopilotResult) => void }): React.ReactElement {
  const fi = FILE_ICONS[item.file_type] || { icon: 'Page', color: clay.textMuted };
  const meta = [item.vessel, item.group !== 'Other' ? item.group : null, item.site_name].filter(Boolean).join(' · ');
  return (
    <div
      onClick={() => onOpen(item)}
      title={item.path}
      className="copilot-search-panel-i2" style={{ background: clay.surface, borderRadius: 10, border: `1px solid ${LINE}`, cursor: item.web_url ? 'pointer' : 'default' }}
    >
      <Icon iconName={fi.icon} aria-hidden="true" className="copilot-search-panel-i3" style={{ color: fi.color }} />
      <div className="copilot-search-panel-i4" style={{ minWidth: 0 }}>
        <div className="copilot-search-panel-i5" style={{ color: clay.text }}>
          {item.name}
        </div>
        <div className="copilot-search-panel-i6" style={{ color: clay.textMuted }}>
          {meta}{meta ? ' · ' : ''}{item.modified}{item.modified_by ? ` · ${item.modified_by}` : ''}
        </div>
      </div>
      {item.web_url && <Icon iconName="OpenInNewWindow" aria-hidden="true" className="copilot-search-panel-i7" style={{ color: clay.accent }} />}
    </div>
  );
}

export function CopilotSearchPanel({ host }: { host: VesselEmail }): React.ReactElement | React.ReactPortal {
  const [open, setOpen] = React.useState(false);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [m365Url, setM365Url] = React.useState<string>('https://m365.cloud.microsoft/chat');
  const [question, setQuestion] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [siteKey, setSiteKey] = React.useState<string>(host.state.dashboardSiteFilter || 'all');
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = React.useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const nextId = React.useRef(1);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (!open || configured !== null) return;
    let cancelled = false;
    fetch(`${host._base()}/api/copilot/status`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : { configured: false }))
      .then(data => {
        if (cancelled) return;
        setConfigured(!!data.configured);
        if (data.m365_url) setM365Url(data.m365_url);
      })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; };
  }, [open, configured, host]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, busy]);

  React.useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sites = React.useMemo(() => {
    const seen = new Set<string>();
    return (host.state.documentSites || [])
      .filter(s => {
        const k = String(s.site_key || '').toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map(s => ({ key: s.site_key, label: s.sp_site_name || s.site_key }));
  }, [host.state.documentSites]);

  const lastFilters = (): CopilotFilters | undefined => {
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i].response) return turns[i].response!.filters;
    return undefined;
  };

  const ask = async (override?: string): Promise<void> => {
    const text = (override ?? question).trim();
    if (!text || busy) return;
    const id = nextId.current++;
    setTurns(t => [...t, { id, question: text }]);
    setQuestion('');
    setBusy(true);
    try {
      const r = await fetch(`${host._base()}/api/copilot/query`, {
        method: 'POST',
        headers: host._headers(),
        body: JSON.stringify({
          question: text,
          site_key: siteKey,
          context: lastFilters() || null,
          history: turns.filter(t => t.response).slice(-4).map(t => ({ question: t.question, answer: t.response!.answer })),
        }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const data: CopilotResponse = await r.json();
      setTurns(t => t.map(x => (x.id === id ? { ...x, response: data } : x)));
    } catch (e) {
      const msg = (e as Error).message || 'Copilot could not answer that.';
      setTurns(t => t.map(x => (x.id === id ? { ...x, error: msg } : x)));
    } finally {
      setBusy(false);
    }
  };

  const openResult = (item: CopilotResult): void => {
    if (item.web_url) window.open(item.web_url, '_blank', 'noopener');
  };

  const renderTurn = (turn: Turn): React.ReactElement => {
    const res = turn.response;
    const showAll = !!expanded[turn.id];
    const shown = res ? (showAll ? res.results : res.results.slice(0, 6)) : [];
    return (
      <div key={turn.id} className="copilot-search-panel-i8">
        <div className="copilot-search-panel-i9" style={{ background: BRAND }}>
          {turn.question}
        </div>
        {turn.error && (
          <div className="copilot-search-panel-i10" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 12 }}>
            {turn.error}
          </div>
        )}
        {res && (
          <div className="copilot-search-panel-i11" style={{ background: clay.surfaceRaised, border: `1px solid ${LINE}` }}>
            <div className="copilot-search-panel-i12" style={{ color: clay.text }}>{renderRich(res.answer)}</div>

            {res.breakdown && (res.breakdown.drawings + res.breakdown.manuals + res.breakdown.to_be_classified) > 0 && (
              <div className="copilot-search-panel-i13">
                {res.breakdown.drawings > 0 && res.filters.group !== 'drawings' && (
                  <Chip label={`Drawings · ${res.breakdown.drawings.toLocaleString()}`} onClick={() => void ask('only drawings')} />
                )}
                {res.breakdown.manuals > 0 && res.filters.group !== 'manuals' && (
                  <Chip label={`Manuals · ${res.breakdown.manuals.toLocaleString()}`} onClick={() => void ask('only manuals')} />
                )}
                {res.breakdown.to_be_classified > 0 && res.filters.group !== 'to_be_classified' && (
                  <Chip label={`To be classified · ${res.breakdown.to_be_classified.toLocaleString()}`} onClick={() => void ask('only to be classified')} />
                )}
              </div>
            )}

            {res.by_site && res.by_site.length > 1 && (
              <div className="copilot-search-panel-i13">
                {res.by_site.map(b => (
                  <Chip key={b.name}
                    label={<><Icon iconName="Globe" className="copilot-search-panel-i14" />{b.name} · {b.count.toLocaleString()}</>}
                    title={b.vessels ? `${b.vessels} vessels` : undefined}
                    onClick={() => void ask(`overview of ${b.name}`)} />
                ))}
              </div>
            )}

            {res.top_vessels.length > 1 && (
              <div className="copilot-search-panel-i13">
                {res.top_vessels.map(v => (
                  <Chip key={v.name} label={<><Icon iconName="Ferry" className="copilot-search-panel-i14" />{v.name} · {v.count.toLocaleString()}</>}
                    onClick={() => void ask(`${turn.question} for ${v.name}`)} />
                ))}
              </div>
            )}

            {shown.length > 0 && (
              <div className="copilot-search-panel-i15">
                {shown.map(item => <ResultCard key={item.id} item={item} onOpen={openResult} />)}
                {res.results.length > shown.length && (
                  <button type="button" onClick={() => setExpanded(e => ({ ...e, [turn.id]: true }))}
                    className="copilot-search-panel-i16" style={{ color: clay.accent }}>
                    Show {res.results.length - shown.length} more
                  </button>
                )}
              </div>
            )}

            {res.suggestions.length > 0 && (
              <div className="copilot-search-panel-i17" style={{ borderTop: `1px dashed ${LINE}` }}>
                {res.suggestions.map(s => <Chip key={s} label={s} onClick={() => void ask(s)} />)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Rendered into <body>: SharePoint wraps web parts in transformed
  // containers, which turn position:fixed into "bottom of the web part" —
  // on a long page the button ended up far below the screen. Above the
  // app shell, which is itself a body-level overlay (AppLayout, z 99999).
  const content = (
    <div
      className="vdms-copilot-root"
      data-vessel-theme={host.state.themeMode}
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      {(() => {
        const showLabel = !open && !isMobile && isHovered;
        return (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            title={open ? 'Close Copilot' : 'Ask Copilot about your documents'}
            aria-label={open ? 'Close Copilot' : 'Open Copilot'}
            className="copilot-search-panel-i18" style={{ position: 'fixed', right: isMobile ? 16 : 24, bottom: isMobile ? 16 : 24, zIndex: 100000, height: isMobile ? 44 : 46, minWidth: isMobile ? 44 : 46, width: showLabel ? undefined : (isMobile ? 44 : 46), padding: showLabel ? '0 18px 0 14px' : 0, borderRadius: showLabel ? 24 : 999, background: BRAND, boxShadow: isHovered ? '0 10px 28px rgba(11, 42, 74, 0.45)' : '0 6px 18px rgba(11, 42, 74, 0.3)', transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <Icon iconName={open ? 'Cancel' : 'Robot'} aria-hidden="true" style={{ fontSize: isMobile ? 16 : 18 }} />
            {showLabel && <span>Ask Copilot</span>}
          </button>
        );
      })()}

      {open && (
        <div
          role="dialog"
          aria-label="Documents Copilot"
          className="copilot-search-panel-i19" style={{ position: 'fixed', right: isMobile ? 12 : 24, bottom: isMobile ? 68 : 84, zIndex: 100000, maxWidth: isMobile ? 'calc(100vw - 24px)' : 'calc(100vw - 32px)', height: isMobile ? 520 : 620, maxHeight: isMobile ? 'calc(100vh - 90px)' : 'calc(100vh - 120px)', background: clay.surface, border: `1px solid ${LINE}` }}
        >
          {/* Header */}
          <div className="copilot-search-panel-i20" style={{ background: BRAND }}>
            <div className="copilot-search-panel-i21" style={{ borderRadius: 10, background: 'rgba(255,255,255,0.16)' }}>
              <Icon iconName="Robot" aria-hidden="true" className="copilot-search-panel-i22" />
            </div>
            <div className="copilot-search-panel-i4" style={{ minWidth: 0 }}>
              <div className="copilot-search-panel-i23">Documents Copilot</div>
              <div className="copilot-search-panel-i24" style={{ opacity: 0.85 }}>
                Finds documents across your vessels and sites
              </div>
            </div>
            {turns.length > 0 && (
              <button type="button" onClick={() => { setTurns([]); setExpanded({}); }} title="New conversation"
                className="copilot-search-panel-i25" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', borderRadius: 8 }}>
                <Icon iconName="Refresh" aria-hidden="true" className="copilot-search-panel-i26" />
              </button>
            )}
          </div>

          {/* Site scope */}
          <div className="copilot-search-panel-i27" style={{ borderBottom: `1px solid ${LINE}`, color: clay.textMuted }}>
            <Icon iconName="Globe" aria-hidden="true" className="copilot-search-panel-i28" />
            <span>Search in</span>
            <select value={siteKey} onChange={e => setSiteKey(e.target.value)}
              className="copilot-search-panel-i29" style={{ borderRadius: 6, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }}>
              <option value="all">All SharePoint Sites</option>
              {sites.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {/* Microsoft 365 Copilot (company licence) for questions about document contents */}
          <a href={m365Url} target="_blank" rel="noopener noreferrer"
            title="Opens Microsoft 365 Copilot with your company account — answers from document contents, within your permissions"
            className="copilot-search-panel-i30" style={{ borderBottom: `1px solid ${LINE}`, background: clay.surfaceRaised, color: clay.accentDark }}>
            <Icon iconName="Robot" aria-hidden="true" className="copilot-search-panel-i26" />
            <span className="copilot-search-panel-i4">Ask about what's <em>inside</em> documents in Microsoft 365 Copilot</span>
            <Icon iconName="OpenInNewWindow" aria-hidden="true" className="copilot-search-panel-i28" />
          </a>

          {/* Conversation */}
          <div ref={scrollRef} className="copilot-search-panel-i31">
            {turns.length === 0 && (
              <div className="copilot-search-panel-i32">
                <div className="copilot-search-panel-i33" style={{ color: clay.text }}>
                  Hi! Ask me about your documents in plain English — a vessel, a type of document, a date or a person.
                </div>
                <div className="copilot-search-panel-i34" style={{ color: clay.textMuted }}>
                  e.g. <em>“latest manuals for Belle Lune”</em>, <em>“PDFs uploaded last month”</em>, <em>“overview of Bow Fighter”</em>
                </div>
                <div className="copilot-search-panel-i13">
                  {STARTERS.map(s => <Chip key={s} label={s} onClick={() => void ask(s)} />)}
                </div>
              </div>
            )}
            {turns.map(renderTurn)}
            {busy && (
              <div className="copilot-search-panel-i35" style={{ color: clay.textMuted }}>
                <Icon iconName="Search" aria-hidden="true" /> Searching documents…
              </div>
            )}
          </div>

          {/* Input */}
          <div className="copilot-search-panel-i36" style={{ borderTop: `1px solid ${LINE}` }}>
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void ask(); }}
              placeholder={turns.length ? 'Ask a follow-up, e.g. "only drawings"' : 'Ask about your documents…'}
              maxLength={500}
              className="copilot-search-panel-i37" style={{ borderRadius: 10, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }}
            />
            <button
              type="button"
              onClick={() => void ask()}
              disabled={busy || !question.trim()}
              aria-label="Send"
              className="copilot-search-panel-i38" style={{ borderRadius: 10, background: busy || !question.trim() ? clay.accentSoft : BRAND, cursor: busy || !question.trim() ? 'not-allowed' : 'pointer' }}
            >
              <Icon iconName="Send" aria-hidden="true" className="copilot-search-panel-i39" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
  return typeof document !== 'undefined' ? ReactDOM.createPortal(content, document.body) : content;
}
