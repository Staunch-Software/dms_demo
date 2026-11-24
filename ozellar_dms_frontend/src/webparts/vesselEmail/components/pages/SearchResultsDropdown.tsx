import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';

/**
 * Live results list rendered directly under the Documents page's search
 * box ("provide the results in the search bar" — as opposed to only
 * filtering the file/folder list further down the page). Purely
 * presentational: DocumentsPage.tsx builds `items` from the same
 * matchesSearchTokens matcher the list view already filters with, so a
 * suggestion here is never inconsistent with what actually shows once the
 * debounce fires.
 */

export interface SearchDropdownItem {
  key: string;
  kind: 'vessel' | 'folder' | 'file';
  label: string;
  sublabel?: string;
  /** Called on click/Enter — navigates to the vessel/folder or opens the file. */
  onSelect: () => void;
}

export interface SearchResultsDropdownProps {
  open: boolean;
  query: string;
  items: SearchDropdownItem[];
  /** Index of the keyboard-highlighted row, or -1 for none. */
  activeIndex: number;
  highlight?: (text: string | null | undefined, query: string) => React.ReactNode;
}

const KIND_ICON: Record<SearchDropdownItem['kind'], string> = {
  vessel: 'Ferry', folder: 'FabricFolder', file: 'Page',
};

export function SearchResultsDropdown(props: SearchResultsDropdownProps): React.ReactElement | null {
  const { open, query, items, activeIndex, highlight } = props;
  const trimmed = (query || '').trim();
  if (!open || !trimmed) return null;

  return (
    <div
      role="listbox"
      aria-label="Search results"
      className="search-results-dropdown-i1" style={{ background: 'var(--vdms-surface)', borderRadius: 8 }}
    >
      {items.length === 0 ? (
        <div className="search-results-dropdown-i2">
          No results found for &quot;{trimmed}&quot;
        </div>
      ) : (
        items.map((item, idx) => (
          <div
            key={item.key}
            role="option"
            aria-selected={idx === activeIndex}
            // Prevent-default on mousedown (not click) so the input never
            // blurs before onSelect runs — a plain onClick would lose the
            // selection the moment the box's onBlur closes this dropdown.
            onMouseDown={e => { e.preventDefault(); item.onSelect(); }}
            className="search-results-dropdown-i3" style={{ background: idx === activeIndex ? 'var(--vdms-border-soft, #f1f5f9)' : 'transparent', borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--vdms-border-soft, #f1f5f9)' }}
          >
            <Icon iconName={KIND_ICON[item.kind]} aria-hidden="true" className="search-results-dropdown-i4" />
            <span className="search-results-dropdown-i5" style={{ minWidth: 0 }}>
              <span className="search-results-dropdown-i6">
                {highlight ? highlight(item.label, query) : item.label}
              </span>
              {item.sublabel && (
                <span className="search-results-dropdown-i7">{item.sublabel}</span>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
