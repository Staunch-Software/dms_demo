import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { clay } from './clayTheme';
import { dmsControlStyle } from './dmsDesignSystem';

export interface DmsSelectOption {
  value: string;
  label: string;
}

export interface DmsSelectProps {
  value: string;
  options: DmsSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** 'md' for forms (38px), 'sm' for filters / table cells (28px). */
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** Red outline, e.g. a required cell that is still empty. */
  invalid?: boolean;
  /** Optional last row, e.g. "+ Specify other...". */
  extraAction?: { label: string; onSelect: () => void };
  /** The search box only appears when there are more options than this. */
  searchThreshold?: number;
  style?: React.CSSProperties;
}

/**
 * Shared dropdown: rounded menu, optional search, highlighted selected row with a
 * check mark. The menu is portalled and fixed-positioned so it is never clipped by a
 * scrolling modal body or table.
 */
export function DmsSelect(props: DmsSelectProps): React.ReactElement {
  const { value, options, onChange, placeholder = 'Select...', size = 'md', disabled, invalid, extraAction, searchThreshold = 7, style } = props;
  const [open, setOpen] = React.useState<boolean>(false);
  const [query, setQuery] = React.useState<string>('');
  const [hover, setHover] = React.useState<string | null>(null);
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number; flipUp: boolean } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const sm = size === 'sm';
  const selected = options.filter(o => o.value === value)[0];
  const showSearch = options.length > searchThreshold;

  const place = React.useCallback((): void => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const menuH = Math.min(320, 70 + options.length * 36);
    const flipUp = window.innerHeight - r.bottom < menuH && r.top > menuH;
    setRect({ left: r.left, top: flipUp ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 160), flipUp });
  }, [options.length]);

  React.useEffect(() => {
    if (!open) return undefined;
    let raf = 0;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (btnRef.current && btnRef.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    const onMove = (e: Event): void => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      if (raf) return;
      raf = window.requestAnimationFrame(() => { raf = 0; place(); });
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().indexOf(query.toLowerCase().trim()) !== -1)
    : options;

  const pick = (v: string): void => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const itemFont = sm ? 12 : 14;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!open) { place(); } setQuery(''); setOpen(o => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...dmsControlStyle(),
          height: sm ? 28 : 38,
          fontSize: sm ? 11.5 : 14,
          lineHeight: '20px',
          padding: sm ? '0 8px' : '0 12px',
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          border: invalid ? '1px solid #f87171' : open ? `1px solid ${clay.accent}` : undefined,
          ...style,
        }}
      >
        <span
          className="dms-select-i1" style={{ color: selected ? 'var(--vdms-text)' : 'var(--vdms-text-muted)' }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <Icon iconName={open ? 'ChevronUp' : 'ChevronDown'} className="dms-select-i2" />
      </button>

      {open && rect && ReactDOM.createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="dms-select-i3" style={{ position: 'fixed', left: rect.left, top: rect.flipUp ? undefined : rect.top, bottom: rect.flipUp ? window.innerHeight - rect.top : undefined, width: rect.width, zIndex: 100050, borderRadius: 10, background: 'var(--vdms-surface)' }}
        >
          {showSearch && (
            <div className="dms-select-i4">
              <Icon iconName="Search" className="dms-select-i5" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
                style={{ ...dmsControlStyle(), height: 32, width: '100%', boxSizing: 'border-box', paddingLeft: 26, fontSize: 12.5 }}
              />
            </div>
          )}
          <div className="dms-select-i6">
            {filtered.map(o => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setHover(o.value)}
                  onMouseLeave={() => setHover(null)}
                  onMouseDown={e => { e.preventDefault(); pick(o.value); }}
                  onClick={e => { if (e.detail === 0) pick(o.value); }}
                  className="dms-select-i7" style={{ padding: sm ? '6px 8px' : '8px 12px', borderRadius: 6, background: isSel ? clay.accentSoft : hover === o.value ? 'var(--vdms-surface-alt)' : 'transparent', color: isSel ? clay.accent : 'var(--vdms-text)', fontWeight: isSel ? 700 : 500, fontSize: itemFont }}
                >
                  <span>{o.label}</span>
                  {isSel && <Icon iconName="CheckMark" className="dms-select-i8" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="dms-select-i9">No matches</div>
            )}
          </div>
          {extraAction && (
            <div className="dms-select-i10">
              <button
                type="button"
                onMouseEnter={() => setHover('__extra__')}
                onMouseLeave={() => setHover(null)}
                onMouseDown={e => { e.preventDefault(); setOpen(false); extraAction.onSelect(); }}
                onClick={e => { if (e.detail === 0) { setOpen(false); extraAction.onSelect(); } }}
                className="dms-select-i11" style={{ width: '100%', padding: sm ? '6px 8px' : '8px 12px', borderRadius: 6, background: hover === '__extra__' ? 'var(--vdms-surface-alt)' : 'transparent', color: clay.accent, fontSize: itemFont }}
              >
                {extraAction.label}
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
