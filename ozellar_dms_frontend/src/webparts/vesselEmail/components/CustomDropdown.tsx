import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { DMS_FONT_DISPLAY } from './dmsDesignSystem';

export interface CustomDropdownOption {
  key: string | number;
  text: string;
  subtext?: string;
  category?: string;
  iconName?: string;
  isCustomAction?: boolean;
}

export interface CustomDropdownProps {
  label?: string;
  placeholder?: string;
  options: CustomDropdownOption[];
  selectedKey: string | number | undefined | null;
  onChange: (key: string | number, option: CustomDropdownOption) => void;
  disabled?: boolean;
  width?: number | string;
  visibleRows?: number; // default: 5 visible options
  enableSearch?: boolean; // default: true
  style?: React.CSSProperties;
}

export function CustomDropdown({
  label,
  placeholder = 'Select an option...',
  options,
  selectedKey,
  onChange,
  disabled = false,
  width = '100%',
  visibleRows = 5,
  enableSearch = true,
  style,
}: CustomDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

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

  // Selected Option Object
  const selectedOption = React.useMemo(() => {
    return options.find(o => String(o.key) === String(selectedKey));
  }, [options, selectedKey]);

  // Sizing for 5 visible items in the scrollable list
  const hasSubtext = regularOptions.some(o => !!o.subtext);
  const rowHeight = hasSubtext ? 42 : 36;
  const listMaxHeight = rowHeight * visibleRows;

  // Scroll to selected item on open
  React.useEffect(() => {
    if (!isOpen || !listRef.current || searchQuery) return;
    const selEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selEl && selEl.scrollIntoView) {
      selEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, searchQuery]);

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
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => {
              if (prev) setSearchQuery('');
              return !prev;
            });
          }
        }}
        className="custom-dropdown-i2" style={{ width: '100%', borderRadius: 8, border: `1px solid ${isOpen ? 'var(--vdms-line-strong, #94a3b8)' : 'var(--vdms-line, #cbd5e1)'}`, color: selectedOption ? 'var(--vdms-text, #1e293b)' : 'var(--vdms-text-muted, #64748b)', fontWeight: selectedOption ? 600 : 500, fontFamily: DMS_FONT_DISPLAY, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'border-color 0.15s ease, background 0.15s ease' }}
      >
        <div className="custom-dropdown-i3" style={{ minWidth: 0 }}>
          {selectedOption?.iconName && (
            <Icon iconName={selectedOption.iconName} className="custom-dropdown-i4" style={{ color: '#0284c7' }} />
          )}
          <span
            className="custom-dropdown-i5" style={{ color: selectedOption ? 'var(--vdms-text, #1e293b)' : 'var(--vdms-text-muted, #64748b)' }}
          >
            {selectedOption ? selectedOption.text : placeholder}
          </span>
        </div>
        <Icon
          iconName={isOpen ? 'ChevronUp' : 'ChevronDown'}
          className="custom-dropdown-i6"
        />
      </button>

      {/* Custom Dropdown Floating Panel */}
      {isOpen && (
        <div
          className="custom-dropdown-i7" style={{ width: '100%', maxWidth: '100%', zIndex: 100050, border: '1px solid var(--vdms-line, #cbd5e1)', borderRadius: 8 }}
        >
          {/* Always Sticky Custom Action at Top */}
          {customAction && (
            <div
              onClick={() => {
                onChange(customAction.key, customAction);
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="custom-dropdown-i8" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.06)', borderBottom: '1px solid var(--vdms-line, #cbd5e1)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(2, 132, 199, 0.06)')}
            >
              <Icon iconName="Add" className="custom-dropdown-i4" style={{ fontWeight: 800, color: '#0284c7' }} />
              <span className="custom-dropdown-i5">
                {customAction.text}
              </span>
            </div>
          )}

          {/* Sticky Search Filter Input */}
          {enableSearch && (
            <div
              className="custom-dropdown-i9" style={{ borderBottom: '1px solid var(--vdms-line, #cbd5e1)' }}
            >
              <div className="custom-dropdown-i10">
                <Icon
                  iconName="Search"
                  className="custom-dropdown-i11"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Type to search..."
                  className="custom-dropdown-i12" style={{ width: '100%', paddingRight: searchQuery ? 24 : 8, borderRadius: 6, border: '1px solid var(--vdms-line, #cbd5e1)', fontFamily: DMS_FONT_DISPLAY }}
                />
                {searchQuery && (
                  <Icon
                    iconName="Clear"
                    className="custom-dropdown-i13"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  />
                )}
              </div>
            </div>
          )}

          {/* Scroll Area showing 5 options at once */}
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
                const isSelected = String(opt.key) === String(selectedKey);

                return (
                  <div
                    key={String(opt.key)}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() => {
                      onChange(opt.key, opt);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className="custom-dropdown-i15" style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? '#0284c7' : 'var(--vdms-text, #1e293b)', background: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'transparent', height: rowHeight, borderBottom: '1px solid var(--vdms-line-soft, #f1f5f9)' }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--vdms-surface-alt, #f8fafc)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="custom-dropdown-i16" style={{ minWidth: 0 }}>
                      <span className="custom-dropdown-i5">
                        {opt.text}
                      </span>
                      {opt.subtext && (
                        <span
                          className="custom-dropdown-i17"
                        >
                          {opt.subtext}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Icon iconName="CheckMark" className="custom-dropdown-i18" style={{ color: '#0284c7' }} />
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
