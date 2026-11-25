import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { DMS_FONT_DISPLAY } from './dmsDesignSystem';


export interface CustomDropdownOption {
  key: string | number;
  text: string;
  subtext?: string;
  category?: string;
  iconName?: string;
  isCustomAction?: boolean;
  disabled?: boolean;
}

export interface CustomDropdownProps {
  label?: string;
  placeholder?: string;
  options: CustomDropdownOption[];
  selectedKey?: string | number | undefined | null;
  selectedKeys?: Array<string | number>;
  multiSelect?: boolean;
  onChange?: (key: string | number, option: CustomDropdownOption) => void;
  onMultiChange?: (keys: string[]) => void;
  disabled?: boolean;
  width?: number | string;
  height?: number | string;
  visibleRows?: number; // default: 5 visible options
  enableSearch?: boolean; // default: true
  searchPlaceholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CustomDropdown({
  label,
  placeholder = 'Select an option...',
  options,
  selectedKey,
  selectedKeys,
  multiSelect = false,
  onChange,
  onMultiChange,
  disabled = false,
  width = '100%',
  height,
  visibleRows = 4,
  enableSearch = true,
  searchPlaceholder = 'Type to search...',
  className,
  style,
}: CustomDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const [dropdownRect, setDropdownRect] = React.useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    openUpward: boolean;
  } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click (checks both trigger and portal floating panel)
  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Focus search input on open if enabled
  React.useEffect(() => {
    if (isOpen && enableSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, enableSearch]);

  // Separate custom action item (sticky at top) from regular list items
  const customAction = React.useMemo(() => {
    return options.find(o => o.isCustomAction);
  }, [options]);

  const regularOptions = React.useMemo(() => {
    return options.filter(o => !o.isCustomAction);
  }, [options]);

  // Filter regular options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return regularOptions;
    const q = searchQuery.toLowerCase().trim();
    return regularOptions.filter(o => {
      const matchText = (o.text || '').toLowerCase().includes(q);
      const matchSub = (o.subtext || '').toLowerCase().includes(q);
      const matchCat = (o.category || '').toLowerCase().includes(q);
      return matchText || matchSub || matchCat;
    });
  }, [regularOptions, searchQuery]);

  // Selected Option Object for single select
  const selectedOption = React.useMemo(() => {
    return options.find(o => String(o.key) === String(selectedKey));
  }, [options, selectedKey]);

  const selectedKeysSet = React.useMemo(() => {
    return new Set((selectedKeys || []).map(String));
  }, [selectedKeys]);

  const displayText = React.useMemo(() => {
    if (multiSelect) {
      const keys = (selectedKeys || []).map(String);
      if (keys.length === 0) return placeholder;
      const selectedOpts = regularOptions.filter(o => keys.indexOf(String(o.key)) !== -1);
      if (selectedOpts.length === 0) return placeholder;
      if (selectedOpts.length === 1) return selectedOpts[0].text;
      const joined = selectedOpts.map(o => o.text).join(', ');
      if (joined.length <= 22) return joined;
      return `${selectedOpts.length} selected`;
    }
    return selectedOption ? selectedOption.text : placeholder;
  }, [multiSelect, selectedKeys, selectedOption, placeholder, regularOptions]);

  const hasSelection = multiSelect
    ? (selectedKeys || []).length > 0
    : !!selectedOption && selectedOption.key !== '';

  const handleOptionClick = (opt: CustomDropdownOption): void => {
    if (opt.disabled) return;
    if (multiSelect) {
      const k = String(opt.key);
      const current = (selectedKeys || []).map(String);
      const next = current.indexOf(k) !== -1 ? current.filter(x => x !== k) : [...current, k];
      if (onMultiChange) {
        onMultiChange(next);
      }
    } else {
      if (onChange) {
        onChange(opt.key, opt);
      }
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  // Sizing for visible items in the scrollable list
  const hasSubtext = regularOptions.some(o => !!o.subtext);
  const rowHeight = hasSubtext ? 42 : 36;
  const listMaxHeight = rowHeight * visibleRows;

  // Scroll to selected item on open (single select)
  React.useEffect(() => {
    if (!isOpen || !listRef.current || searchQuery || multiSelect) return;
    const selEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selEl && selEl.scrollIntoView) {
      selEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, searchQuery, multiSelect]);

  // Floating position calculation: calculate fixed portal coordinates and flip upward if space below is tight
  React.useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownRect(null);
      return;
    }
    const updatePosition = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const count = Math.min(filteredOptions.length || 1, visibleRows);
      const estMenuHeight = (count * rowHeight)
        + (enableSearch ? 44 : 0)
        + (multiSelect ? 32 : 0)
        + (customAction ? 36 : 0)
        + 16;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const shouldOpenUp = spaceBelow < estMenuHeight + 10 && spaceAbove > spaceBelow;

      setDropdownRect({
        top: r.bottom + 4,
        bottom: window.innerHeight - r.top + 4,
        left: r.left,
        width: r.width,
        openUpward: shouldOpenUp,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, filteredOptions.length, visibleRows, rowHeight, enableSearch, multiSelect, customAction]);

  // Keyboard navigation: Escape closes dropdown
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onKeyDown={handleKeyDown}
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
          className="custom-dropdown-i1"
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        title={displayText}
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => {
              if (prev) setSearchQuery('');
              return !prev;
            });
          }
        }}
        className="custom-dropdown-i2" style={{ height: height ?? undefined, width: '100%', borderRadius: 8, border: `1px solid ${isOpen ? 'var(--vdms-line-strong, #94a3b8)' : 'var(--vdms-line, #cbd5e1)'}`, color: hasSelection ? 'var(--vdms-text, #1e293b)' : 'var(--vdms-text-muted, #64748b)', fontWeight: hasSelection ? 500 : 400, fontFamily: DMS_FONT_DISPLAY, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'border-color 0.15s ease, background 0.15s ease' }}
      >
        <div className="custom-dropdown-i3" style={{ minWidth: 0 }}>
          {selectedOption?.iconName && (
            <Icon iconName={selectedOption.iconName} className="custom-dropdown-i4" style={{ color: '#0284c7' }} />
          )}
          <span
            className="custom-dropdown-i5" style={{ color: hasSelection ? 'var(--vdms-text, #1e293b)' : 'var(--vdms-text-muted, #64748b)', fontSize: 13, fontFamily: DMS_FONT_DISPLAY, fontWeight: hasSelection ? 500 : 400 }}
          >
            {displayText}
          </span>
        </div>
        <Icon
          iconName={isOpen ? 'ChevronUp' : 'ChevronDown'}
          className="custom-dropdown-i6"
        />
      </button>

      {/* Custom Dropdown Floating Panel rendered in Portal to float in front of everything */}
      {isOpen && dropdownRect && ReactDOM.createPortal(
        <div
          ref={panelRef}
          className="custom-dropdown-i7"
          style={{
            position: 'fixed',
            left: dropdownRect.left,
            width: dropdownRect.width,
            top: dropdownRect.openUpward ? 'auto' : dropdownRect.top,
            bottom: dropdownRect.openUpward ? dropdownRect.bottom : 'auto',
            zIndex: 100099,
            border: '1px solid var(--vdms-line, #cbd5e1)',
            borderRadius: 8,
            boxShadow: dropdownRect.openUpward
              ? '0 -12px 30px rgba(15, 23, 42, 0.22), 0 -4px 10px rgba(15, 23, 42, 0.1)'
              : '0 12px 30px rgba(15, 23, 42, 0.22), 0 4px 10px rgba(15, 23, 42, 0.1)',
            background: 'var(--vdms-surface, #ffffff)',
            boxSizing: 'border-box',
            fontFamily: DMS_FONT_DISPLAY,
            fontSize: 13,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }}
        >
          {/* Always Sticky Custom Action at Top */}
          {customAction && (
            <div
              onClick={() => {
                if (onChange) onChange(customAction.key, customAction);
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="custom-dropdown-i8"
              style={{
                color: '#0284c7',
                background: 'rgba(2, 132, 199, 0.06)',
                borderBottom: '1px solid var(--vdms-line-soft, #f1f5f9)',
                fontFamily: DMS_FONT_DISPLAY,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.06)')}
            >
              <Icon iconName="Add" className="custom-dropdown-i4" style={{ fontWeight: 800, color: '#0284c7' }} />
              <span className="custom-dropdown-i5" style={{ fontSize: 13, fontWeight: 500, fontFamily: DMS_FONT_DISPLAY }}>
                {customAction.text}
              </span>
            </div>
          )}

          {/* Sticky Search Filter Input */}
          {enableSearch && (
            <div
              className="custom-dropdown-i9"
              style={{
                padding: '7px 8px',
                borderBottom: '1px solid var(--vdms-line-soft, #f1f5f9)',
                background: 'var(--vdms-surface, #ffffff)',
              }}
            >
              <div className="custom-dropdown-i10">
                <Icon
                  iconName="Search"
                  className="custom-dropdown-i11"
                  style={{ left: 8, fontSize: 12, color: 'var(--vdms-text-muted, #64748b)' }}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="custom-dropdown-i12"
                  style={{
                    width: '100%',
                    height: 30,
                    paddingLeft: 28,
                    paddingRight: searchQuery ? 24 : 8,
                    borderRadius: 6,
                    border: '1px solid var(--vdms-line, #cbd5e1)',
                    background: 'var(--vdms-surface-alt, #f8fafc)',
                    color: 'var(--vdms-text, #1e293b)',
                    fontSize: 12.5,
                    fontFamily: DMS_FONT_DISPLAY,
                  }}
                />
                {searchQuery && (
                  <Icon
                    iconName="Clear"
                    className="custom-dropdown-i13"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    style={{ right: 8, fontSize: 10, cursor: 'pointer' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Multi-select Quick Action Bar */}
          {multiSelect && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderBottom: '1px solid var(--vdms-line-soft, #f1f5f9)',
                background: 'var(--vdms-surface-alt, #f8fafc)',
                fontSize: 11.5,
                userSelect: 'none',
              }}
            >
              <button
                type="button"
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 4px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#0284c7',
                }}
                onClick={() => {
                  if (onMultiChange) onMultiChange(regularOptions.map(o => String(o.key)));
                }}
              >
                Select all ({regularOptions.length})
              </button>
              <button
                type="button"
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 4px',
                  borderRadius: 4,
                  cursor: (selectedKeys || []).length > 0 ? 'pointer' : 'default',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: (selectedKeys || []).length > 0 ? '#ef4444' : 'var(--vdms-text-muted, #94a3b8)',
                  opacity: (selectedKeys || []).length > 0 ? 1 : 0.5,
                }}
                disabled={(selectedKeys || []).length === 0}
                onClick={() => {
                  if (onMultiChange) onMultiChange([]);
                }}
              >
                Clear{(selectedKeys || []).length > 0 ? ` (${(selectedKeys || []).length})` : ''}
              </button>
            </div>
          )}

          {/* Scroll Area showing 4 options at once */}
          <div
            ref={listRef}
            className="vdms-custom-dropdown-list"
            style={{
              maxHeight: listMaxHeight,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                className="custom-dropdown-i14"
              >
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = multiSelect
                  ? selectedKeysSet.has(String(opt.key))
                  : String(opt.key) === String(selectedKey);

                return (
                  <div
                    key={String(opt.key)}
                    data-selected={isSelected ? 'true' : undefined}
                    title={opt.text}
                    onClick={() => handleOptionClick(opt)}
                    className="custom-dropdown-i15"
                    style={{
                      height: rowHeight,
                      minHeight: rowHeight,
                      background: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                      borderBottom: '1px solid var(--vdms-line-soft, #f8fafc)',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.45 : 1,
                      fontFamily: DMS_FONT_DISPLAY,
                    }}
                    onMouseEnter={e => {
                      if (!isSelected && !opt.disabled) e.currentTarget.style.background = 'var(--vdms-surface-alt, #f8fafc)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected && !opt.disabled) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {multiSelect && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          border: `1.5px solid ${isSelected ? '#0284c7' : 'var(--vdms-line-strong, #94a3b8)'}`,
                          background: isSelected ? '#0284c7' : 'var(--vdms-surface, #ffffff)',
                          color: '#ffffff',
                          boxSizing: 'border-box',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        {isSelected && <Icon iconName="CheckMark" style={{ fontSize: 9, fontWeight: 900, color: '#ffffff' }} />}
                      </span>
                    )}
                    {opt.iconName && (
                      <Icon iconName={opt.iconName} className="custom-dropdown-i4" style={{ color: '#0284c7' }} />
                    )}
                    <div className="custom-dropdown-i16">
                      <span
                        className="custom-dropdown-i5"
                        style={{
                          fontWeight: isSelected ? 500 : 400,
                          color: isSelected ? '#0284c7' : 'var(--vdms-text, #1e293b)',
                          fontSize: 13,
                          fontFamily: DMS_FONT_DISPLAY,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {opt.text}
                      </span>
                      {opt.subtext && (
                        <span className="custom-dropdown-i17" style={{ fontSize: 11, fontFamily: DMS_FONT_DISPLAY, fontWeight: 400 }}>
                          {opt.subtext}
                        </span>
                      )}
                    </div>
                    {!multiSelect && isSelected && (
                      <Icon iconName="CheckMark" className="custom-dropdown-i18" style={{ color: '#0284c7', marginLeft: 'auto' }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
