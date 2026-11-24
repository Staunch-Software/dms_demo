import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { DMS_FONT_DISPLAY, DMS_SECTION_CARD, dmsBtn, dmsControlStyle, dmsTone } from '../dmsDesignSystem';

/**
 * Settings → Vessel Settings → Vessel Folder Template.
 *
 * The sub-folders created automatically inside every new vessel folder
 * (backend: app/services/vessel_folder_template.py, /api/vessel-folder-template).
 * Admins edit the tree here — add, rename, reorder, remove — and can add
 * newly-added folders to vessels that already exist ("Apply to existing
 * vessels", additive only). Everyone else sees it read-only.
 */

export interface FolderNode { name: string; aliases?: string[]; children: FolderNode[] }

interface TemplateResponse {
  version: number;
  updated_by: string | null;
  updated_at: string | null;
  is_default: boolean;
  folders: FolderNode[];
  folder_count: number;
  default_folders: FolderNode[];
  is_admin: boolean;
  rules: { invalid_chars: string; max_depth: number; max_name: number };
}

interface VesselResult {
  vessel_id: number;
  name: string;
  ok: boolean;
  locations?: string[];
  created?: string[];
  existing?: number;
  failed?: { path: string; error: string }[];
  error?: string;
}

interface ApplyResponse { dry_run: boolean; vessels: number; folders_to_create?: number; folders_created?: number; results: VesselResult[] }

type Path = number[]; // index path into the tree

const INVALID_DEFAULT = '~"#%&*:<>?/\\{|}';

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    return (j && (j.detail || j.message)) || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

const cleanName = (s: string): string => s.split(/\s+/).filter(Boolean).join(' ');
const key = (s: string): string => cleanName(s).toLowerCase();
const countAll = (nodes: FolderNode[]): number => nodes.reduce((n, f) => n + 1 + countAll(f.children), 0);

function getAt(tree: FolderNode[], path: Path): FolderNode {
  let node = tree[path[0]];
  for (const i of path.slice(1)) node = node.children[i];
  return node;
}

/** Immutable update of the sibling list that contains `path` (or the root list for []). */
function updateSiblings(tree: FolderNode[], parentPath: Path, fn: (siblings: FolderNode[]) => FolderNode[]): FolderNode[] {
  if (parentPath.length === 0) return fn(tree);
  const [head, ...rest] = parentPath;
  return tree.map((n, i) => (i === head ? { ...n, children: updateSiblings(n.children, rest, fn) } : n));
}

function nameProblem(name: string, siblings: FolderNode[], invalid: string, maxLen: number, ignoreIndex = -1): string | null {
  const n = cleanName(name);
  if (!n) return 'Enter a folder name.';
  if (n.length > maxLen) return `Keep it under ${maxLen} characters.`;
  const bad = Array.from(new Set(n.split('').filter((ch) => invalid.includes(ch))));
  if (bad.length) return `SharePoint doesn't allow these characters: ${bad.join(' ')}`;
  if (n.startsWith('.') || n.endsWith('.')) return "A folder name can't start or end with a dot.";
  const clash = siblings.some((s, i) => i !== ignoreIndex && (key(s.name) === key(n) || (s.aliases || []).some((a) => key(a) === key(n))));
  if (clash) return 'A folder with this name already exists here.';
  return null;
}

export function VesselFolderTemplateSection({ host }: { host: VesselEmail }): React.ReactElement {
  const [data, setData] = React.useState<TemplateResponse | null>(null);
  const [tree, setTree] = React.useState<FolderNode[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<{ path: Path; mode: 'rename' | 'add' } | null>(null);
  const [draftName, setDraftName] = React.useState('');
  const [draftAliases, setDraftAliases] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);

  const [checking, setChecking] = React.useState(false);
  const [check, setCheck] = React.useState<ApplyResponse | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [applied, setApplied] = React.useState<ApplyResponse | null>(null);
  const [confirmApply, setConfirmApply] = React.useState(false);

  const isAdmin = !!data?.is_admin;
  const invalid = data?.rules.invalid_chars || INVALID_DEFAULT;
  const maxLen = data?.rules.max_name || 120;
  const maxDepth = data?.rules.max_depth || 6;
  const dirty = !!data && JSON.stringify(tree) !== JSON.stringify(data.folders);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/vessel-folder-template`, { headers: host._headers() });
      if (!r.ok) throw new Error(await readError(r));
      const d: TemplateResponse = await r.json();
      setData(d);
      setTree(d.folders);
    } catch (e) {
      setError((e as Error).message || 'Could not load the vessel folder template.');
    } finally {
      setLoading(false);
    }
  }, [host]);

  React.useEffect(() => { load().catch(() => undefined); }, [load]);

  const pathKey = (p: Path): string => p.join('.');
  const toggle = (p: Path): void => setCollapsed((prev) => {
    const n = new Set(prev); const k = pathKey(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const startAdd = (parent: Path): void => {
    setEditing({ path: parent, mode: 'add' }); setDraftName(''); setDraftAliases(''); setConfirmDelete(null);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(pathKey(parent)); return n; });
  };
  const startRename = (p: Path): void => {
    const node = getAt(tree, p);
    setEditing({ path: p, mode: 'rename' }); setDraftName(node.name); setDraftAliases((node.aliases || []).join(', ')); setConfirmDelete(null);
  };
  const cancelEdit = (): void => { setEditing(null); setDraftName(''); setDraftAliases(''); };

  const editProblem = ((): string | null => {
    if (!editing) return null;
    if (editing.mode === 'add') {
      const siblings = editing.path.length ? getAt(tree, editing.path).children : tree;
      return nameProblem(draftName, siblings, invalid, maxLen);
    }
    const parent = editing.path.slice(0, -1);
    const siblings = parent.length ? getAt(tree, parent).children : tree;
    return nameProblem(draftName, siblings, invalid, maxLen, editing.path[editing.path.length - 1]);
  })();

  const commitEdit = (): void => {
    if (!editing || editProblem) return;
    const name = cleanName(draftName);
    const aliases = draftAliases.split(',').map(cleanName).filter((a) => a && key(a) !== key(name));
    if (editing.mode === 'add') {
      setTree((t) => updateSiblings(t, editing.path, (sib) => [...sib, { name, children: [] }]));
    } else {
      const parent = editing.path.slice(0, -1);
      const idx = editing.path[editing.path.length - 1];
      setTree((t) => updateSiblings(t, parent, (sib) => sib.map((n, i) => (i === idx ? { ...n, name, aliases: aliases.length ? aliases : undefined } : n))));
    }
    cancelEdit();
  };

  const move = (p: Path, delta: -1 | 1): void => {
    const parent = p.slice(0, -1); const idx = p[p.length - 1];
    setTree((t) => updateSiblings(t, parent, (sib) => {
      const j = idx + delta;
      if (j < 0 || j >= sib.length) return sib;
      const copy = sib.slice(); [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    }));
  };

  const remove = (p: Path): void => {
    const parent = p.slice(0, -1); const idx = p[p.length - 1];
    setTree((t) => updateSiblings(t, parent, (sib) => sib.filter((_, i) => i !== idx)));
    setConfirmDelete(null);
  };

  const save = async (): Promise<void> => {
    setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch(`${host._base()}/api/vessel-folder-template`, {
        method: 'PUT', headers: host._headers(), body: JSON.stringify({ folders: tree }),
      });
      if (!r.ok) throw new Error(await readError(r));
      const saved = await r.json();
      setNotice(`Saved. New vessels will get these ${saved.folder_count} folders.`);
      setCheck(null); setApplied(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async (): Promise<void> => {
    setSaving(true); setError(''); setNotice(''); setConfirmReset(false);
    try {
      const r = await fetch(`${host._base()}/api/vessel-folder-template/reset`, { method: 'POST', headers: host._headers(), body: '{}' });
      if (!r.ok) throw new Error(await readError(r));
      setNotice('Template reset to the standard structure.');
      setCheck(null); setApplied(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runApply = async (dryRun: boolean, vesselIds: number[] | null): Promise<ApplyResponse | null> => {
    const r = await fetch(`${host._base()}/api/vessel-folder-template/apply`, {
      method: 'POST', headers: host._headers(), body: JSON.stringify({ vessel_ids: vesselIds, dry_run: dryRun }),
    });
    if (!r.ok) throw new Error(await readError(r));
    return r.json();
  };

  const checkVessels = async (): Promise<void> => {
    setChecking(true); setError(''); setApplied(null); setConfirmApply(false);
    try { setCheck(await runApply(true, null)); } catch (e) { setError((e as Error).message); } finally { setChecking(false); }
  };

  const needing = (check?.results || []).filter((r) => r.ok && (r.created || []).length > 0);
  const missingTotal = needing.reduce((n, r) => n + (r.created || []).length, 0);

  const applyToVessels = async (): Promise<void> => {
    setApplying(true); setError(''); setConfirmApply(false);
    try {
      const res = await runApply(false, needing.map((r) => r.vessel_id));
      setApplied(res);
      setCheck(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (loading && !data) {
    return <div style={{ ...DMS_SECTION_CARD, marginTop: 20, color: 'var(--vdms-text-muted)', fontSize: 13 }}>Loading vessel folder template…</div>;
  }

  const total = countAll(tree);
  const changedOn = data?.updated_at ? new Date(`${data.updated_at}Z`).toLocaleString() : null;
  const iconBtn = (title: string, icon: string, onClick: () => void, enabled = true, danger = false): React.ReactElement => (
    <button title={title} aria-label={title} disabled={!enabled} onClick={onClick} className="vessel-folder-template-section-i1" style={{ cursor: enabled ? 'pointer' : 'default', borderRadius: 6, color: !enabled ? 'var(--vdms-text-faint)' : danger ? clay.pillDangerText : 'var(--vdms-text-muted)' }}><Icon iconName={icon} className="vessel-folder-template-section-i2" /></button>
  );

  const editRow = (depth: number): React.ReactElement => (
    <div className="vessel-folder-template-section-i3" style={{ paddingLeft: depth * 22 + 30 }}>
      <div className="vessel-folder-template-section-i4">
        <Icon iconName={editing?.mode === 'add' ? 'NewFolder' : 'Edit'} style={{ color: clay.accent }} />
        <input autoFocus value={draftName} placeholder="Folder name" onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          style={{ ...dmsControlStyle(), flex: '1 1 200px', minWidth: 160 }} />
        <button style={dmsBtn('primary', !editProblem)} disabled={!!editProblem} onClick={commitEdit}>{editing?.mode === 'add' ? 'Add' : 'Done'}</button>
        <button style={dmsBtn('ghost')} onClick={cancelEdit}>Cancel</button>
      </div>
      {editing?.mode === 'rename' && (
        <input value={draftAliases} placeholder="Also matches existing folders named… (optional, comma-separated)" onChange={(e) => setDraftAliases(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          style={{ ...dmsControlStyle(), width: '100%', marginTop: 6, boxSizing: 'border-box' }} />
      )}
      {draftName && editProblem && <div className="vessel-folder-template-section-i5" style={{ color: clay.pillDangerText }}>{editProblem}</div>}
      {editing?.mode === 'rename' && (
        <div className="vessel-folder-template-section-i6">
          Renaming changes the folder created for <b>new</b> vessels. Existing vessel folders are not renamed — add the old name under "also matches" so they aren't duplicated.
        </div>
      )}
    </div>
  );

  const renderNodes = (nodes: FolderNode[], parentPath: Path, depth: number): React.ReactNode => (
    <>
      {nodes.map((node, i) => {
        const p = [...parentPath, i];
        const k = pathKey(p);
        const isCollapsed = collapsed.has(k);
        const hasKids = node.children.length > 0;
        const isRenaming = editing?.mode === 'rename' && pathKey(editing.path) === k;
        const sub = countAll(node.children);
        return (
          <div key={`${k}-${node.name}`}>
            {isRenaming ? editRow(depth) : (
              <div className="vessel-folder-template-section-i7" style={{ paddingLeft: depth * 22 + 8 }}>
                <button onClick={() => hasKids && toggle(p)} aria-label={isCollapsed ? 'Expand' : 'Collapse'} className="vessel-folder-template-section-i8" style={{ width: 18, cursor: hasKids ? 'pointer' : 'default' }}>
                  {hasKids && <Icon iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'} className="vessel-folder-template-section-i9" />}
                </button>
                <Icon iconName={hasKids && !isCollapsed ? 'FabricOpenFolderHorizontal' : 'FabricFolder'} className="vessel-folder-template-section-i10" style={{ color: clay.accent }} />
                <span className="vessel-folder-template-section-i11" style={{ fontWeight: depth === 0 ? 700 : 500 }}>{node.name}</span>
                {hasKids && <span className="vessel-folder-template-section-i12">{sub} inside</span>}
                {(node.aliases || []).length > 0 && (
                  <span title="Existing folders with these names are treated as this folder" className="vessel-folder-template-section-i13">
                    also matches: {(node.aliases || []).join(', ')}
                  </span>
                )}
                {isAdmin && (
                  <span className="vessel-folder-template-section-i14">
                    {confirmDelete === k ? (
                      <>
                        <span className="vessel-folder-template-section-i15" style={{ color: clay.pillDangerText }}>
                          Remove "{node.name}"{sub ? ` and its ${sub} folder${sub === 1 ? '' : 's'}` : ''} from the template?
                        </span>
                        <button style={dmsBtn('danger')} onClick={() => remove(p)}>Remove</button>
                        <button style={dmsBtn('ghost')} onClick={() => setConfirmDelete(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        {iconBtn('Add a folder inside', 'NewFolder', () => startAdd(p), depth + 1 < maxDepth)}
                        {iconBtn('Rename', 'Edit', () => startRename(p))}
                        {iconBtn('Move up', 'ChevronUp', () => move(p, -1), i > 0)}
                        {iconBtn('Move down', 'ChevronDown', () => move(p, 1), i < nodes.length - 1)}
                        {iconBtn('Remove from template', 'Delete', () => { cancelEdit(); setConfirmDelete(k); }, true, true)}
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
            {!isCollapsed && hasKids && renderNodes(node.children, p, depth + 1)}
            {editing?.mode === 'add' && pathKey(editing.path) === k && editRow(depth + 1)}
          </div>
        );
      })}
    </>
  );

  const previewLines = ((): { depth: number; name: string; last: boolean }[] => {
    const out: { depth: number; name: string; last: boolean }[] = [];
    const walk = (nodes: FolderNode[], d: number): void => nodes.forEach((n, i) => { out.push({ depth: d, name: n.name, last: i === nodes.length - 1 }); walk(n.children, d + 1); });
    walk(tree, 1);
    return out;
  })();

  return (
    <div className="vessel-folder-template-section-i16">
      <div className="vessel-folder-template-section-i17">
        <div>
          <div className="vessel-folder-template-section-i18" style={{ fontFamily: DMS_FONT_DISPLAY }}>Vessel Folder Template</div>
          <div className="vessel-folder-template-section-i19">
            Every new vessel gets these folders automatically, inside its own vessel folder. Change them here — new vessels pick up the change straight away.
          </div>
        </div>
        <div className="vessel-folder-template-section-i4">
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, ...((t) => ({ background: t.bg, color: t.fg }))(dmsTone(data?.is_default ? 'neutral' : 'accent')) }}>
            {data?.is_default ? 'Standard structure' : `Version ${data?.version}${data?.updated_by ? ` · ${data.updated_by}` : ''}${changedOn ? ` · ${changedOn}` : ''}`}
          </span>
        </div>
      </div>

      {error && <div className="vessel-folder-template-section-i20" style={{ borderRadius: 10, background: clay.pillDangerBg, color: clay.pillDangerText }}>{error}</div>}
      {notice && <div className="vessel-folder-template-section-i20" style={{ borderRadius: 10, background: clay.pillActiveBg, color: clay.pillActiveText }}>{notice}</div>}
      {!isAdmin && (
        <div className="vessel-folder-template-section-i21" style={{ borderRadius: 10 }}>
          Only administrators can change the template. You can see what every new vessel will get.
        </div>
      )}

      <div className="vessel-folder-template-section-i22">
        {/* Editor */}
        <div style={{ ...DMS_SECTION_CARD, padding: 0, overflow: 'hidden' }}>
          <div className="vessel-folder-template-section-i23">
            <Icon iconName="Boat" style={{ color: clay.accent }} />
            <span className="vessel-folder-template-section-i24">&lt;Vessel name&gt;</span>
            <span className="vessel-folder-template-section-i25">{total} folder{total === 1 ? '' : 's'} created inside</span>
            <span className="vessel-folder-template-section-i26">
              <button style={dmsBtn('ghost')} onClick={() => setCollapsed(new Set())}>Expand all</button>
              <button style={dmsBtn('ghost')} onClick={() => {
                const all = new Set<string>();
                const walk = (nodes: FolderNode[], p: Path): void => nodes.forEach((n, i) => { if (n.children.length) { all.add(pathKey([...p, i])); walk(n.children, [...p, i]); } });
                walk(tree, []); setCollapsed(all);
              }}>Collapse all</button>
            </span>
          </div>
          <div className="vessel-folder-template-section-i27">
            {tree.length === 0 && <div className="vessel-folder-template-section-i28">No folders — new vessels will get an empty vessel folder.</div>}
            {renderNodes(tree, [], 0)}
            {editing?.mode === 'add' && editing.path.length === 0 && editRow(0)}
          </div>
          {isAdmin && (
            <div className="vessel-folder-template-section-i29">
              <button style={dmsBtn('secondary')} onClick={() => startAdd([])}><Icon iconName="NewFolder" />Add top-level folder</button>
              <span className="vessel-folder-template-section-i30">
                {confirmReset ? (
                  <>
                    <span className="vessel-folder-template-section-i25">Replace the template with the standard structure?</span>
                    <button style={dmsBtn('danger')} onClick={() => void resetToDefault()}>Reset</button>
                    <button style={dmsBtn('ghost')} onClick={() => setConfirmReset(false)}>Cancel</button>
                  </>
                ) : (
                  <button style={dmsBtn('ghost', !saving)} disabled={saving} onClick={() => setConfirmReset(true)}>Reset to standard</button>
                )}
                {dirty && <button style={dmsBtn('ghost')} onClick={() => { setTree(data?.folders || []); cancelEdit(); }}>Discard changes</button>}
                <button style={dmsBtn('primary', dirty && !saving && !editing)} disabled={!dirty || saving || !!editing} onClick={() => void save()}>
                  <Icon iconName="Save" />{saving ? 'Saving…' : 'Save template'}
                </button>
              </span>
            </div>
          )}
          {dirty && (
            <div className="vessel-folder-template-section-i31" style={{ background: clay.pillWarnBg, color: clay.pillWarnText }}>
              You have unsaved changes. New vessels keep using the saved template until you save.
            </div>
          )}
        </div>

        <div className="vessel-folder-template-section-i32">
          {/* Preview */}
          <div style={DMS_SECTION_CARD}>
            <div className="vessel-folder-template-section-i24">What a new vessel gets</div>
            <div className="vessel-folder-template-section-i33">Example for a vessel named "MV Example".</div>
            <div className="vessel-folder-template-section-i34" style={{ fontFamily: 'Consolas, "Cascadia Mono", monospace' }}>
              <div className="vessel-folder-template-section-i35">MV Example/</div>
              {previewLines.map((l, i) => (
                <div key={i} style={{ color: l.depth === 1 ? 'var(--vdms-text)' : 'var(--vdms-text-muted)' }}>
                  {'   '.repeat(l.depth - 1)}{l.last ? '└─ ' : '├─ '}{l.name}
                </div>
              ))}
            </div>
          </div>

          {/* Apply to existing vessels */}
          {isAdmin && (
            <div style={DMS_SECTION_CARD}>
              <div className="vessel-folder-template-section-i24">Add to existing vessels</div>
              <div className="vessel-folder-template-section-i36">
                Added a folder to the template? Vessels that already exist can get it too. Only <b>missing</b> folders are created —
                nothing is renamed, moved or deleted.
              </div>
              <div className="vessel-folder-template-section-i37">
                <button style={dmsBtn('secondary', !checking && !dirty)} disabled={checking || dirty} onClick={() => void checkVessels()}>
                  <Icon iconName="Search" />{checking ? 'Checking vessels…' : 'Check vessels'}
                </button>
                {dirty && <span className="vessel-folder-template-section-i25">Save the template first.</span>}
              </div>

              {check && (
                <div className="vessel-folder-template-section-i38">
                  <div className="vessel-folder-template-section-i39">
                    Checked {check.vessels} vessel{check.vessels === 1 ? '' : 's'}:{' '}
                    <b>{missingTotal}</b> missing folder{missingTotal === 1 ? '' : 's'} in <b>{needing.length}</b> vessel{needing.length === 1 ? '' : 's'}
                    {' · '}{check.results.filter((r) => r.ok && !(r.created || []).length).length} already complete
                    {' · '}{check.results.filter((r) => !r.ok).length} not found
                  </div>
                  <div className="vessel-folder-template-section-i40" style={{ borderRadius: 10 }}>
                    {[...needing, ...check.results.filter((r) => !r.ok)].map((r) => (
                      <details key={r.vessel_id} className="vessel-folder-template-section-i41">
                        <summary className="vessel-folder-template-section-i42">
                          {r.name}{' '}
                          {r.ok
                            ? <span style={{ color: clay.pillWarnText }}>— {(r.created || []).length} missing</span>
                            : <span className="vessel-folder-template-section-i43">— {r.error}</span>}
                        </summary>
                        {r.ok && (
                          <div className="vessel-folder-template-section-i44">
                            <div>In {(r.locations || []).join(', ')}</div>
                            {(r.created || []).map((p) => <div key={p}>+ {p}</div>)}
                          </div>
                        )}
                      </details>
                    ))}
                    {needing.length === 0 && check.results.every((r) => r.ok) && (
                      <div className="vessel-folder-template-section-i45">Every vessel already has all template folders.</div>
                    )}
                  </div>
                  {needing.length > 0 && (
                    <div className="vessel-folder-template-section-i46">
                      {confirmApply ? (
                        <>
                          <span className="vessel-folder-template-section-i47">Create {missingTotal} folder{missingTotal === 1 ? '' : 's'} in SharePoint?</span>
                          <button style={dmsBtn('primary', !applying)} disabled={applying} onClick={() => void applyToVessels()}>{applying ? 'Creating…' : 'Yes, create them'}</button>
                          <button style={dmsBtn('ghost')} onClick={() => setConfirmApply(false)}>Cancel</button>
                        </>
                      ) : (
                        <button style={dmsBtn('primary')} onClick={() => setConfirmApply(true)}>
                          <Icon iconName="NewFolder" />Create {missingTotal} missing folder{missingTotal === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {applied && (
                <div className="vessel-folder-template-section-i48">
                  <div className="vessel-folder-template-section-i49" style={{ color: clay.pillActiveText }}>
                    Created {applied.folders_created} folder{applied.folders_created === 1 ? '' : 's'} in {applied.results.filter((r) => (r.created || []).length).length} vessel(s).
                  </div>
                  {applied.results.filter((r) => !r.ok || (r.failed || []).length).map((r) => (
                    <div key={r.vessel_id} className="vessel-folder-template-section-i50" style={{ color: clay.pillDangerText }}>
                      {r.name}: {r.error || (r.failed || []).map((f) => `${f.path} (${f.error})`).join('; ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only preview of the template for the Create Vessel form. */
export function VesselTemplatePreview({ host, vesselName }: { host: VesselEmail; vesselName: string }): React.ReactElement | null {
  const [folders, setFolders] = React.useState<FolderNode[] | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`${host._base()}/api/vessel-folder-template`, { headers: host._headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setFolders(d.folders); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [host]);
  if (!folders) return null;
  const count = countAll(folders);
  const lines: { depth: number; name: string }[] = [];
  const walk = (nodes: FolderNode[], d: number): void => nodes.forEach((n) => { lines.push({ depth: d, name: n.name }); walk(n.children, d + 1); });
  walk(folders, 0);
  return (
    <div className="vessel-folder-template-section-i51" style={{ borderRadius: 10 }}>
      <div className="vessel-folder-template-section-i52">
        <Icon iconName="FabricFolder" style={{ color: clay.accent }} />
        <span className="vessel-folder-template-section-i39">
          <b>{count}</b> standard folder{count === 1 ? '' : 's'} will be created inside <b>{vesselName.trim() || 'the vessel folder'}</b> automatically.
        </span>
        {count > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="vessel-folder-template-section-i53" style={{ color: clay.accent }}>
            {open ? 'Hide' : 'Show'} folders
          </button>
        )}
      </div>
      {open && (
        <div className="vessel-folder-template-section-i54">
          {lines.map((l, i) => <div key={i} style={{ paddingLeft: l.depth * 16, color: l.depth === 0 ? 'var(--vdms-text)' : undefined }}>{l.name}</div>)}
          <div className="vessel-folder-template-section-i55">Admins can change these in Settings → Vessel Settings → Vessel Folder Template.</div>
        </div>
      )}
    </div>
  );
}
