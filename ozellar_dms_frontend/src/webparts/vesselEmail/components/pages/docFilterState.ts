/**
 * Pure helpers for the Documents page's filter state, kept free of React and
 * of the 12k-line host component so they can be unit tested
 * (see docFilterState.test.ts).
 */

export interface PathNode { id: string; name: string }

export type RootMainFolder = 'SharePoint Sites' | 'Shared Documents' | 'Documents';

/** Everything Clear writes; a subset of the host component's State. */
export interface ClearedFilterPatch {
  vesselFilter: string;
  docGroupFilter: string;
  docCategoryFilter: string;
  catFilter: string;
  docSubfolderOtherFilter: string;
  textFilter: string;
  docGroupLevelFilter: string;
  docLeafCategoryFilter: string;
  docSubCategoryFilter: string;
  attachmentFilter: 'all' | 'attached' | 'not_attached';
  docListSort: 'name_az' | 'newest' | 'default';
  docListPage: number;
  searchDropdownActiveIndex: number;
}

export const isLiveRootId = (id: string | undefined): boolean =>
  id === 'sites_root' || id === 'lib:shared_documents' || id === 'lib:documents';

/** Every filter, search and dependent selection back to its default. */
export const computeClearedFilterPatch = (): ClearedFilterPatch => ({
  vesselFilter: 'all',
  docGroupFilter: 'all',
  docCategoryFilter: 'all',
  catFilter: 'all',
  docSubfolderOtherFilter: 'all',
  textFilter: '',
  docGroupLevelFilter: 'all',
  docLeafCategoryFilter: 'all',
  docSubCategoryFilter: 'all',
  attachmentFilter: 'all',
  docListSort: 'default',
  docListPage: 0,
  searchDropdownActiveIndex: -1,
});

export interface ClearRootTarget {
  /** The root-level stack Clear navigates to. */
  stack: PathNode[];
  /** docMainFolder to go with it (null = the app's top-level "All Vessels" listing). */
  mainFolder: RootMainFolder | null;
  /** The current stack is already that root: no navigation entry needed. */
  alreadyAtRoot: boolean;
  /** Not a live-library stack (department / vessel / Kaizen drill-down): back to the vessels scope. */
  resetToVesselsScope: boolean;
}

/**
 * Where the Clear button lands. Mirrors the existing "All main folders"
 * handling: a live library goes back to its root (site + drive for SharePoint
 * Sites, the library node for Shared Documents / Documents); any other stack
 * (department, vessel, Kaizen) goes back to the top-level All Vessels listing.
 */
export const clearRootTarget = (stack: PathNode[]): ClearRootTarget => {
  const rootId = stack[0]?.id;
  if (rootId === 'sites_root') {
    return { stack: stack.slice(0, 3), mainFolder: 'SharePoint Sites', alreadyAtRoot: stack.length <= 3, resetToVesselsScope: false };
  }
  if (rootId === 'lib:shared_documents' || rootId === 'lib:documents') {
    return {
      stack: stack.slice(0, 1),
      mainFolder: rootId === 'lib:documents' ? 'Documents' : 'Shared Documents',
      alreadyAtRoot: stack.length <= 1,
      resetToVesselsScope: false,
    };
  }
  return { stack: [], mainFolder: null, alreadyAtRoot: stack.length === 0, resetToVesselsScope: true };
};

/** Breadcrumb click on `index`: the stack up to and including that crumb. */
export const stackForBreadcrumb = (stack: PathNode[], index: number): PathNode[] =>
  index < 0 ? [] : stack.slice(0, Math.min(index + 1, stack.length));

/**
 * Whether a whole-site search row must be excluded by the Group / Category
 * filters. Those are explicit user picks (never derived from the open folder),
 * so a text search has to narrow by them as well, not bypass them.
 * `pathMatches` is the page's pathMatchesGroupCategory.
 */
export const searchRowFailsGroupCategory = (
  subFolderPath: string,
  group: string,
  category: string,
  pathMatches: (path: string, group: string, category: string) => boolean,
): boolean => {
  if (group === 'all' && category === 'all') return false;
  return !pathMatches(subFolderPath || '', group, category);
};

/** A retried/in-flight global search is stale once the user left its site or changed the box. */
export const isSearchStale = (
  request: { siteKey: string; term: string },
  now: { siteKey: string; textFilter: string },
): boolean =>
  (request.siteKey || '').trim().toLowerCase() !== (now.siteKey || '').trim().toLowerCase() ||
  (now.textFilter || '').trim() !== request.term;

/** Back (-1) / Forward (+1) through the folder history; null when out of range. */
export const navHistoryStep = <T,>(history: T[], index: number, step: -1 | 1): { index: number; entry: T } | null => {
  const next = index + step;
  if (next < 0 || next >= history.length) return null;
  return { index: next, entry: history[next] };
};

/** What _pushFolderNav does to the history: drop the forward entries, append, point at the new tail. */
export const pushHistory = <T,>(history: T[], index: number, entry: T): { history: T[]; index: number } => {
  const next = [...history.slice(0, index + 1), entry];
  return { history: next, index: next.length - 1 };
};
