import {
  clearRootTarget, computeClearedFilterPatch, navHistoryStep, pushHistory, stackForBreadcrumb,
  searchRowFailsGroupCategory, isSearchStale, isLiveRootId,
} from './docFilterState';

const lib = [{ id: 'lib:shared_documents', name: 'Shared Documents' }];
const bowFighterPath = [
  ...lib,
  { id: 'f1', name: 'Technical and Crewing New' },
  { id: 'f2', name: 'Bow Fighter' },
  { id: 'f3', name: 'Drawings and Manuals' },
];

describe('computeClearedFilterPatch', () => {
  it('resets every filter, the search, sort, page and dependent selections', () => {
    expect(computeClearedFilterPatch()).toEqual({
      vesselFilter: 'all', docGroupFilter: 'all', docCategoryFilter: 'all', catFilter: 'all', docSubfolderOtherFilter: 'all',
      textFilter: '', docGroupLevelFilter: 'all', docLeafCategoryFilter: 'all', docSubCategoryFilter: 'all',
      attachmentFilter: 'all', docListSort: 'default', docListPage: 0, searchDropdownActiveIndex: -1,
    });
  });

  it('never touches site, folder stack, view mode or scope', () => {
    const p = computeClearedFilterPatch();
    ['folderPathStack', 'docViewMode', 'activeDocumentSite', 'docScopeType', 'docMainFolder'].forEach(k => expect(p).not.toHaveProperty(k));
  });
});

describe('clearRootTarget — where Clear lands', () => {
  it('Shared Documents: Bow Fighter > Drawings and Manuals goes back to the library root', () => {
    const t = clearRootTarget(bowFighterPath);
    expect(t.stack).toEqual(lib);
    expect(t.mainFolder).toBe('Shared Documents');
    expect(t.alreadyAtRoot).toBe(false);
    expect(t.resetToVesselsScope).toBe(false);
    expect(t.stack.map(n => n.name)).not.toContain('Bow Fighter');
  });

  it('Documents library root', () => {
    const t = clearRootTarget([{ id: 'lib:documents', name: 'Documents' }, { id: 'a', name: 'Technical' }]);
    expect(t.stack).toHaveLength(1);
    expect(t.mainFolder).toBe('Documents');
  });

  it('SharePoint Sites keeps site + drive and drops everything below', () => {
    const stack = [
      { id: 'sites_root', name: 'SharePoint Sites' }, { id: 'site:1', name: 'OzellarDMS' }, { id: 'drive:1', name: 'Documents' },
      { id: 'x', name: 'Technical' }, { id: 'y', name: 'Bow Fighter' },
    ];
    const t = clearRootTarget(stack);
    expect(t.stack.map(n => n.id)).toEqual(['sites_root', 'site:1', 'drive:1']);
    expect(t.mainFolder).toBe('SharePoint Sites');
    expect(t.alreadyAtRoot).toBe(false);
  });

  it('already at the root: no navigation entry is needed', () => {
    expect(clearRootTarget(lib).alreadyAtRoot).toBe(true);
    expect(clearRootTarget([{ id: 'sites_root', name: 'SharePoint Sites' }, { id: 's', name: 'S' }, { id: 'd', name: 'D' }]).alreadyAtRoot).toBe(true);
  });

  it('department / vessel drill-down returns to the top-level All Vessels listing', () => {
    const t = clearRootTarget([{ id: 'Technical & Crewing', name: 'Technical & Crewing' }, { id: 'v1', name: 'Bow Fighter' }]);
    expect(t.stack).toEqual([]);
    expect(t.mainFolder).toBeNull();
    expect(t.resetToVesselsScope).toBe(true);
    expect(t.alreadyAtRoot).toBe(false);
    expect(clearRootTarget([]).alreadyAtRoot).toBe(true);
  });

  it('does not mutate the stack it is given', () => {
    const copy = JSON.parse(JSON.stringify(bowFighterPath));
    clearRootTarget(bowFighterPath);
    expect(bowFighterPath).toEqual(copy);
  });

  it('after Clear + landing at root, the history keeps Back to the folder just left', () => {
    const t = clearRootTarget(bowFighterPath);
    const h = pushHistory([lib, bowFighterPath], 1, t.stack);
    expect(h.history).toHaveLength(3);
    expect(navHistoryStep(h.history, h.index, -1)?.entry).toEqual(bowFighterPath);
  });
});

describe('stackForBreadcrumb', () => {
  const stack = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  it('returns the clicked crumb and its ancestors', () => {
    expect(stackForBreadcrumb(stack, 0).map(n => n.id)).toEqual(['a']);
    expect(stackForBreadcrumb(stack, 1).map(n => n.id)).toEqual(['a', 'b']);
  });
  it('clicking the last crumb is a no-op copy; out of range is clamped', () => {
    expect(stackForBreadcrumb(stack, 2)).toEqual(stack);
    expect(stackForBreadcrumb(stack, 9)).toEqual(stack);
  });
  it('does not mutate the stack', () => {
    stackForBreadcrumb(stack, 0);
    expect(stack).toHaveLength(3);
  });
  it('negative index gives the root', () => { expect(stackForBreadcrumb(stack, -1)).toEqual([]); });
});

describe('searchRowFailsGroupCategory', () => {
  const matches = (path: string, g: string, c: string): boolean =>
    (g === 'all' || path.includes(g)) && (c === 'all' || path.includes(c));
  it('no group/category: never excludes', () => {
    expect(searchRowFailsGroupCategory('A > B', 'all', 'all', matches)).toBe(false);
  });
  it('group and category both narrow the search results', () => {
    expect(searchRowFailsGroupCategory('V > Drawings > Hull > f.pdf', 'Drawings', 'Hull', matches)).toBe(false);
    expect(searchRowFailsGroupCategory('V > Manuals > Hull > f.pdf', 'Drawings', 'Hull', matches)).toBe(true);
    expect(searchRowFailsGroupCategory('V > Drawings > Deck > f.pdf', 'Drawings', 'Hull', matches)).toBe(true);
  });
});

describe('isSearchStale', () => {
  it('fresh when site and term are unchanged (case/space insensitive site)', () => {
    expect(isSearchStale({ siteKey: 'OzellarDMS', term: 'pump' }, { siteKey: ' ozellardms ', textFilter: ' pump ' })).toBe(false);
  });
  it('stale after Clear, a new term or a site switch', () => {
    expect(isSearchStale({ siteKey: 'a', term: 'pump' }, { siteKey: 'a', textFilter: '' })).toBe(true);
    expect(isSearchStale({ siteKey: 'a', term: 'pump' }, { siteKey: 'a', textFilter: 'pumps' })).toBe(true);
    expect(isSearchStale({ siteKey: 'a', term: 'pump' }, { siteKey: 'b', textFilter: 'pump' })).toBe(true);
  });
});

describe('isLiveRootId', () => {
  it('recognises the live library roots only', () => {
    expect(isLiveRootId('sites_root')).toBe(true);
    expect(isLiveRootId('lib:documents')).toBe(true);
    expect(isLiveRootId('Technical & Crewing')).toBe(false);
    expect(isLiveRootId(undefined)).toBe(false);
  });
});

describe('folder history (Back / Forward / push)', () => {
  const h = ['root', 'tech', 'tech/vessel', 'tech/vessel/drawings'];
  it('Back and Forward step through entries and stop at the ends', () => {
    expect(navHistoryStep(h, 3, -1)).toEqual({ index: 2, entry: 'tech/vessel' });
    expect(navHistoryStep(h, 0, -1)).toBeNull();
    expect(navHistoryStep(h, 1, 1)).toEqual({ index: 2, entry: 'tech/vessel' });
    expect(navHistoryStep(h, 3, 1)).toBeNull();
    expect(navHistoryStep([], 0, 1)).toBeNull();
  });
  it('Back then a new folder drops the forward entries', () => {
    const r = pushHistory(h, 1, 'tech/other');
    expect(r.history).toEqual(['root', 'tech', 'tech/other']);
    expect(r.index).toBe(2);
  });
  it('pushing at the tail appends', () => {
    const r = pushHistory(h, 3, 'x');
    expect(r.history).toHaveLength(5);
    expect(r.index).toBe(4);
  });
  it('does not mutate the history', () => {
    pushHistory(h, 0, 'y');
    expect(h).toHaveLength(4);
  });
});
