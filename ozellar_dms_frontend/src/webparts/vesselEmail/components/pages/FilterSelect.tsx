import * as React from 'react';
import { SiteSelector, SiteSelectorOption } from '../SiteSelector';

interface FilterSelectProps {
  'aria-label'?: string;
  value: string;
  onChange?: (value: string) => void;
  /** `<option>` / `<optgroup>` / fragments, exactly as a native `<select>` takes them. */
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  /** Show the filter box. Defaults to on when the list is long enough to need it. */
  searchable?: boolean;
  minWidth?: number;
  /** Floor for the panel width. Default 0: the panel is exactly as wide as its trigger. */
  popoverMinWidth?: number;
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function collect(children: React.ReactNode, out: SiteSelectorOption[], group?: string): void {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; disabled?: boolean; label?: string; children?: React.ReactNode };
    if (child.type === 'option') {
      out.push({ key: String(props.value ?? textOf(props.children)), label: textOf(props.children), disabled: props.disabled, group });
    } else if (child.type === 'optgroup') {
      collect(props.children, out, props.label);
    } else if (child.type === React.Fragment) {
      collect(props.children, out, group);
    }
  });
}

function noop(): void { /* disabled placeholder */ }

/**
 * Drop-in for the Documents filter bar's native `<select>`s: same `<option>` children, but the
 * panel is the shared searchable selector (SiteSelector) so every filter looks and behaves alike.
 */
export function FilterSelect(props: FilterSelectProps): React.ReactElement {
  const label = props['aria-label'] || 'Filter';
  const options: SiteSelectorOption[] = [];
  collect(props.children, options);
  const searchable = props.searchable !== undefined ? props.searchable : options.length > 7;
  return (
    <SiteSelector
      compact
      showIcons={false}
      ariaLabel={label}
      searchPlaceholder={'Search ' + label.replace(/ filter$/i, '').toLowerCase()}
      value={props.value}
      options={options}
      onChange={props.onChange || noop}
      disabled={props.disabled}
      title={props.title}
      searchable={searchable}
      minWidth={props.minWidth ?? 150}
      popoverMinWidth={props.popoverMinWidth ?? 0}
    />
  );
}
