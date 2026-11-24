import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { clay } from './clayTheme';
import { DMS_FONT_DISPLAY } from './dmsDesignSystem';

export interface VesselMultiSelectOption { id: string; name: string; subtext?: string; }

export interface VesselMultiSelectProps {
  options: VesselMultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  width?: number;
  style?: React.CSSProperties;
  /** 'below' (default) always opens under the button. 'auto' floats the list (position: fixed) and opens it
   * upward when there is not enough room below - for use inside dialogs, so the list never stretches them. */
  placement?: 'below' | 'auto';
}

const POPUP_HEIGHT = 270; // header + search + 5 rows

/** Checkbox dropdown for choosing several vessels (Certificates Records / Matrix / Checklist). */
export function VesselMultiSelect({ options, selectedIds, onChange, width = 240, style, placement = 'below' }: VesselMultiSelectProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const [query, setQuery] = React.useState<string>('');
  const [floatStyle, setFloatStyle] = React.useState<React.CSSProperties | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // placement 'auto': place the list next to the button, above it when the space below is too small.
  React.useLayoutEffect(() => {
    if (!isOpen || placement !== 'auto') { setFloatStyle(null); return; }
    const place = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < POPUP_HEIGHT + 8 && r.top > below;
      setFloatStyle({
        position: 'fixed', left: r.left, width: r.width, minWidth: r.width,
        top: up ? 'auto' : r.bottom + 4,
        bottom: up ? window.innerHeight - r.top + 4 : 'auto',
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, placement]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  const selected = React.useMemo(() => {
    const s: Record<string, boolean> = {};
    selectedIds.forEach(id => { s[id] = true; });
    return s;
  }, [selectedIds]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().indexOf(q) !== -1);
  }, [options, query]);

  const label = (() => {
    if (options.length > 0 && selectedIds.length === options.length) return `All vessels (${options.length})`;
    if (selectedIds.length === 0) return 'Select vessels...';
    if (selectedIds.length === 1) {
      const o = options.filter(x => x.id === selectedIds[0])[0];
      return o ? o.name : '1 vessel selected';
    }
    return `${selectedIds.length} vessels selected`;
  })();

  const toggle = (id: string): void => {
    onChange(selected[id] ? selectedIds.filter(x => x !== id) : options.filter(o => selected[o.id] || o.id === id).map(o => o.id));
  };

  const linkBtn: React.CSSProperties = {
    border: 'none', background: 'transparent', padding: 0, minHeight: 0, height: 'auto', cursor: 'pointer',
    fontSize: 11.5, fontWeight: 700, color: clay.accent, boxShadow: 'none',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width, flex: `0 0 ${width}px`, minWidth: width, ...style }}>
      <button
        type="button"
        className={`vdms-vms-trigger${isOpen ? ' vdms-vms-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => { setIsOpen(o => !o); setQuery(''); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 36, padding: '0 12px',
          borderRadius: 8, background: 'var(--vdms-surface)', color: 'var(--vdms-text)', fontSize: 13, fontWeight: 600,
          fontFamily: DMS_FONT_DISPLAY, cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        <span className="vessel-multi-select-i1" style={{ minWidth: 0 }}>
          <Icon iconName="Ferry" className="vessel-multi-select-i2" style={{ color: clay.accent }} />
          <span className="vessel-multi-select-i3">{label}</span>
        </span>
        <Icon iconName={isOpen ? 'ChevronUp' : 'ChevronDown'} className="vessel-multi-select-i4" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="vessel-multi-select-i5" style={{ width: '100%', minWidth: '100%', zIndex: 100050, background: 'var(--vdms-surface)', border: '1px solid var(--vdms-line, #cbd5e1)', borderRadius: 10, ...(floatStyle || {}) }}
        >
          <div className="vessel-multi-select-i6" style={{ borderBottom: '1px solid var(--vdms-line-soft, #e2e8f0)' }}>
            <div className="vessel-multi-select-i7">
              <button type="button" style={linkBtn} onClick={() => onChange(options.map(o => o.id))}>Select all</button>
              <button type="button" style={{ ...linkBtn, color: 'var(--vdms-text-muted)' }} onClick={() => onChange([])}>Clear</button>
            </div>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search vessels..."
              aria-label="Search vessels"
              className="vessel-multi-select-i8" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--vdms-line, #cbd5e1)', background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}
            />
          </div>
          <div className="vessel-multi-select-i9" style={{ maxHeight: 5 * 34 }}>
            {filtered.length === 0 && (
              <div className="vessel-multi-select-i10">No vessels match.</div>
            )}
            {filtered.map(o => {
              const on = !!selected[o.id];
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className="vdms-vms-row"
                  onClick={() => toggle(o.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 32, padding: '4px 8px',
                    border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    fontSize: 12.5, fontWeight: 600, color: 'var(--vdms-text)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="vessel-multi-select-i11" style={{ width: 16, border: `1.5px solid ${on ? clay.accent : 'var(--vdms-line-strong, #94a3b8)'}`, background: on ? clay.accent : 'transparent' }}
                  >
                    {on && <Icon iconName="CheckMark" className="vessel-multi-select-i12" />}
                  </span>
                  <span className="vessel-multi-select-i3" style={{ minWidth: 0 }}>{o.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
