import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { clay } from './clayTheme';
import { DMS_FONT_DISPLAY } from './dmsDesignSystem';

export interface SearchableSelectOption {
  key: string | number;
  text: string;
  subtext?: string;
  category?: string;
  iconName?: string;
}

export interface SearchableSelectProps {
  label?: string;
  placeholder?: string;
  options: SearchableSelectOption[];
  selectedKey: string | number | undefined | null;
  onChange: (key: string | number, option: SearchableSelectOption) => void;
  disabled?: boolean;
  width?: number | string;
  style?: React.CSSProperties;
  /**
   * Opt-in compact layout: the panel is exactly as wide as the trigger, only `visibleRows` options show before the
   * list scrolls (the search box stays pinned), the trigger gets no focus glow, and ArrowUp/Down/Enter/Esc work.
   */
  fitPanelToTrigger?: boolean;
  visibleRows?: number;
}

export function SearchableSelect({
  label,
  placeholder = 'Select an option...',
  options,
  selectedKey,
  onChange,
  disabled = false,
  width = '100%',
  style,
  fitPanelToTrigger = false,
  visibleRows = 5,
}: SearchableSelectProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = React.useState<number>(0);
  const [popShift, setPopShift] = React.useState<number>(0);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Focus search input on open
  React.useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Selected Option Object
  const selectedOption = React.useMemo(() => {
    return options.find(o => String(o.key) === String(selectedKey));
  }, [options, selectedKey]);

  // Filtered options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(o => {
      const matchText = (o.text || '').toLowerCase().includes(q);
      const matchSub = (o.subtext || '').toLowerCase().includes(q);
      const matchCat = (o.category || '').toLowerCase().includes(q);
      return matchText || matchSub || matchCat;
    });
  }, [options, searchQuery]);

  const fitRowHeight = options.some(o => !!o.subtext) ? 52 : 42;

  const closePanel = (): void => { setIsOpen(false); setSearchQuery(''); };

  React.useEffect(() => {
    if (!fitPanelToTrigger || !isOpen) return;
    const row = listRef.current ? listRef.current.querySelector('[data-idx="' + activeIdx + '"]') as HTMLElement | null : null;
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, isOpen, fitPanelToTrigger]);

  // Maximum of 6 items visible at once: each item is ~42px tall, so max-height is ~252px
  const ITEM_HEIGHT = 42;
  const VISIBLE_COUNT = 6;
  const listMaxHeight = ITEM_HEIGHT * VISIBLE_COUNT;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width,
        position: 'relative',
        ...style,
      }}
    >
      {label && (
        <label
          className="searchable-select-i1"
        >
          {label}
        </label>
      )}


      {/* Trigger Button */}
      <button
        type="button"
        className={`vdms-select-trigger ${isOpen ? 'vdms-select-open' : ''}${fitPanelToTrigger ? ' vdms-select-flat' : ''}`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => !prev);
            setSearchQuery('');
            const at = options.findIndex(o => String(o.key) === String(selectedKey));
            setActiveIdx(at < 0 ? 0 : at);
            // Phones only (no CSS zoom there): keep the popover inside the screen by sliding it left.
            if (!fitPanelToTrigger && containerRef.current && typeof window !== 'undefined' && window.innerWidth <= 767) {
              const r = containerRef.current.getBoundingClientRect();
              const popW = Math.min(320, window.innerWidth - 16);
              const overflow = r.left + popW - (window.innerWidth - 8);
              setPopShift(Math.min(Math.max(0, overflow), Math.max(0, r.left - 8)));
            } else {
              setPopShift(0);
            }
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 36,
          padding: '0 12px',
          borderRadius: 8,
          border: `1px solid ${isOpen ? 'var(--vdms-line-strong, #cbd5e1)' : 'var(--vdms-line, #cbd5e1)'}`,
          background: 'var(--vdms-surface)',
          color: selectedOption ? 'var(--vdms-text)' : 'var(--vdms-text-faint)',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: DMS_FONT_DISPLAY,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          boxShadow: 'none',
          transition: 'border-color 0.15s ease',
        }}
      >
        <div className="searchable-select-i2" style={{ minWidth: 0 }}>
          {selectedOption?.iconName && (
            <Icon iconName={selectedOption.iconName} className="searchable-select-i3" style={{ color: clay.accent }} />
          )}
          <span
            className="searchable-select-i4" style={{ color: selectedOption ? 'var(--vdms-text)' : 'var(--vdms-text-muted)' }}
          >
            {selectedOption ? selectedOption.text : placeholder}
          </span>
        </div>
        <Icon
          iconName={isOpen ? 'ChevronUp' : 'ChevronDown'}
          className="searchable-select-i5"
        />
      </button>

      {/* Dropdown Floating Popover */}
      {isOpen && (
        <div
          className="searchable-select-i6" style={{ width: '100%', maxWidth: '100%', zIndex: 100050, background: 'var(--vdms-surface)', border: '1px solid var(--vdms-line, #cbd5e1)', borderRadius: 10, boxShadow: fitPanelToTrigger ? '0 6px 18px rgba(11, 42, 74, 0.10)' : '0 12px 32px rgba(11, 42, 74, 0.22), 0 2px 6px rgba(0,0,0,0.08)' }}
        >
          {/* Internal Search Input Container */}
          <div
            className="searchable-select-i7" style={{ padding: fitPanelToTrigger ? '8px' : '8px 10px', borderBottom: '1px solid var(--vdms-line-soft, #e2e8f0)' }}
          >
            {/* Visual Text Enter Area - Single Border with Embedded Icon */}
            <div className="searchable-select-i8" style={{ width: '100%' }}>
              <Icon
                iconName="Search"
                className="searchable-select-i9" style={{ left: fitPanelToTrigger ? 8 : 10 }}
              />
              <input
                ref={searchInputRef}
                type="text"
                className="vdms-single-border-search"
                placeholder="Search options..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setActiveIdx(0); }}
                onKeyDown={fitPanelToTrigger ? (e => {
                  if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filteredOptions.length - 1, i + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
                  else if (e.key === 'Enter') {
                    e.preventDefault();
                    const o = filteredOptions[activeIdx];
                    if (o) { onChange(o.key, o); closePanel(); }
                  }
                }) : undefined}
                style={{
                  width: '100%',
                  height: 32,
                  paddingLeft: fitPanelToTrigger ? 28 : 40,
                  paddingRight: searchQuery ? 28 : 8,
                  borderRadius: 6,
                  border: '1px solid var(--vdms-line, #cbd5e1)',
                  background: 'var(--vdms-surface, #ffffff)',
                  color: 'var(--vdms-text)',
                  fontSize: 12,
                  fontFamily: DMS_FONT_DISPLAY,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <Icon
                  iconName="Clear"
                  className="searchable-select-i10"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                />
              )}
            </div>
          </div>

          {/* Scrollable Items Area (Smooth modern scrollbar, full height) */}
          <div
            ref={listRef}
            className="vdms-scroll-clean"
            style={{
              maxHeight: fitPanelToTrigger ? visibleRows * fitRowHeight : 260,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                className="searchable-select-i11"
              >
                No matching options found
              </div>
            ) : (
              filteredOptions.map((option, optIdx) => {
                const isSelected = String(option.key) === String(selectedKey);
                return (
                  <div
                    key={option.key}
                    data-idx={optIdx}
                    onClick={() => {
                      onChange(option.key, option);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      ...(fitPanelToTrigger ? { padding: '0 16px', height: fitRowHeight, flexShrink: 0 } : { padding: '10px 12px', minHeight: ITEM_HEIGHT }),
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      background: isSelected ? clay.accentSoft : (fitPanelToTrigger && optIdx === activeIdx ? 'var(--vdms-surface-hover)' : 'transparent'),
                      borderBottom: '1px solid var(--vdms-line-soft)',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={e => {
                      if (fitPanelToTrigger) { setActiveIdx(optIdx); return; }
                      if (!isSelected) e.currentTarget.style.background = 'var(--vdms-surface-hover)';
                    }}
                    onMouseLeave={e => {
                      if (fitPanelToTrigger) return;
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="searchable-select-i12" style={{ minWidth: 0 }}>
                      {option.iconName && (
                        <Icon iconName={option.iconName} className="searchable-select-i13" style={{ color: clay.accent }} />
                      )}
                      <div className="searchable-select-i14" style={{ minWidth: 0 }}>
                        <span
                          className="searchable-select-i15" style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? clay.accent : 'var(--vdms-text)' }}
                        >
                          {option.text}
                        </span>
                        {option.subtext && (
                          <span className="searchable-select-i16">
                            {option.subtext}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Icon
                        iconName="CheckMark"
                        className="searchable-select-i17" style={{ color: clay.accent, fontWeight: 700 }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
