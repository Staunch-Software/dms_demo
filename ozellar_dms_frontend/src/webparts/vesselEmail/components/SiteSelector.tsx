import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';

export interface SiteSelectorOption {
  key: string;
  label: string;
  /** Shown but not pickable (e.g. a folder that doesn't exist in the current scope). */
  disabled?: boolean;
  /** Heading rendered above the first option of each run with the same group. */
  group?: string;
}

export interface SiteSelectorProps {
  value: string;
  options: SiteSelectorOption[];
  onChange: (key: string) => void;
  ariaLabel?: string;
  minWidth?: number;
  /** Explicit width (e.g. '100%' or pixel number). Defaults to '100%'. */
  width?: string | number;
  /** Show the filter box. When false the list is short enough to scan; the (visually hidden) input still drives keyboard navigation. */
  searchable?: boolean;
  /** Globe / SharePoint icons beside each option. Turn off when the options aren't sites. */
  showIcons?: boolean;
  searchPlaceholder?: string;
  /** 34px / 500-weight trigger for dense filter toolbars. */
  compact?: boolean;
  disabled?: boolean;
  title?: string;
  /** Floor for the popover width when the trigger itself is narrow (filter toolbars). */
  popoverMinWidth?: number;
  /** Cap the option list at this many rows (34px each) and scroll the rest; the search box stays pinned above. */
  visibleRows?: number;
  /** One size and weight for every line in the list (headings, options, selected row, search box). */
  uniformText?: boolean;
}

const INK = '#1F2937';
const MUTED = '#6B7280';
const TEAL = '#0F766E';
const LINE = '#D6DEE8';
const LINE_STRONG = '#94A3B8';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const POP_MAX_H = 320;
const ROW_H = 34;


function iconFor(key: string): string {
  return key === 'all' ? 'Globe' : 'SharepointLogo';
}

export function SiteSelector({ value, options, onChange, ariaLabel = 'SharePoint site', minWidth = 200, width, searchable = true, showIcons = true, searchPlaceholder = 'Search sites', compact = false, disabled = false, title, popoverMinWidth = 0, visibleRows, uniformText = false }: SiteSelectorProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ left: number; top?: number; bottom?: number; width: number; up: boolean }>({ left: 0, top: 0, width: 240, up: false });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useRef('vdms-site-' + Math.random().toString(36).slice(2, 8)).current;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().indexOf(q) !== -1) : options;
  }, [options, query]);
  const selected = options.filter(o => o.key === value || (o.key && value && o.key.toLowerCase() === value.toLowerCase()))[0];

  const place = React.useCallback((): void => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, popoverMinWidth);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const up = window.innerHeight - r.bottom < POP_MAX_H && r.top > window.innerHeight - r.bottom;
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width, up } : { left, top: r.bottom + 6, width, up });
  }, []);

  const close = React.useCallback((refocus: boolean): void => {
    setShown(false);
    setOpen(false);
    setQuery('');
    if (refocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  const openPop = (): void => {
    place();
    setQuery('');
    const idx = options.map(o => o.key).indexOf(value);
    setActive(idx < 0 ? 0 : idx);
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => { setShown(true); if (inputRef.current) inputRef.current.focus(); });
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if ((popRef.current && popRef.current.contains(t)) || (triggerRef.current && triggerRef.current.contains(t))) return;
      close(false);
    };
    const onMove = (): void => place();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, close, place]);

  React.useEffect(() => {
    if (!open || !popRef.current) return;
    const row = popRef.current.querySelector('[data-idx="' + active + '"]') as HTMLElement | null;
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [active, open, visible.length]);

  const choose = (key: string): void => {
    close(true);
    if (key !== value && (!value || key.toLowerCase() !== value.toLowerCase())) onChange(key);
  };

  const onPopKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(visible.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, visible.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visible[active]; if (o && !o.disabled) choose(o.key); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <>
      <div style={{ minWidth, width, position: 'relative' }} title={title}>
        <button
          ref={triggerRef}
          type="button"
          className={'vdms-site-trigger' + (open ? ' is-open' : '') + (compact ? ' is-compact' : '')}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? uid + '-list' : undefined}
          onClick={() => (open ? close(false) : openPop())}
          onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openPop(); } }}
        >
          {showIcons && <span className="vdms-site-ico"><Icon iconName={iconFor(value)} aria-hidden="true" /></span>}
          <span className="site-selector-i1" style={{ minWidth: 0 }}>{selected ? selected.label : ''}</span>
          <span className="vdms-site-end" style={{ color: MUTED, fontSize: 10, transition: 'transform .15s ease', transform: open ? 'rotate(180deg)' : 'none' }}><Icon iconName="ChevronDown" aria-hidden="true" /></span>
        </button>
      </div>
      {open && ReactDOM.createPortal(
        <div
          ref={popRef}
          className={'vdms-site-pop' + (uniformText ? ' is-uniform' : '') + (pos.up ? ' is-up' : '') + (shown ? ' is-shown' : '')}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
          onKeyDown={onPopKey}
        >
          <div
            className={searchable ? 'vdms-site-row vdms-site-search' : undefined}
            style={searchable ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
          >
            {searchable && <span className="vdms-site-ico" style={{ color: MUTED, fontSize: 12 }}><Icon iconName="Search" aria-hidden="true" /></span>}
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              role="combobox"
              aria-expanded={true}
              aria-controls={uid + '-list'}
              aria-activedescendant={visible[active] ? uid + '-opt-' + active : undefined}
              autoComplete="off"
              onChange={e => { setQuery(e.target.value); setActive(0); }}
            />
          </div>
          <div id={uid + '-list'} className="vdms-site-list" role="listbox" aria-label={ariaLabel} style={visibleRows ? { maxHeight: visibleRows * ROW_H } : undefined}>
            {visible.length === 0 ? (
              <div className="vdms-site-empty">No matching sites</div>
            ) : visible.map((o, i) => {
              const isSel = o.key === value;
              const prev = i > 0 ? visible[i - 1] : undefined;
              const heading = o.group && (!prev || prev.group !== o.group) ? <div key={'g:' + o.group + ':' + i} className="vdms-site-group" role="presentation">{o.group}</div> : null;
              return (
                <React.Fragment key={o.key}>
                {heading}
                <div
                  id={uid + '-opt-' + i}
                  data-idx={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  title={o.label}
                  className={'vdms-site-row vdms-site-opt' + (isSel ? ' is-selected' : '') + (i === active ? ' is-active' : '') + (o.disabled ? ' is-disabled' : '')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { if (!o.disabled) choose(o.key); }}
                >
                  {showIcons && <span className="vdms-site-ico"><Icon iconName={iconFor(o.key)} aria-hidden="true" /></span>}
                  <span className="vdms-site-txt">{o.label}</span>
                  <span className="vdms-site-end">{isSel && <Icon iconName="CheckMark" aria-hidden="true" />}</span>
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
