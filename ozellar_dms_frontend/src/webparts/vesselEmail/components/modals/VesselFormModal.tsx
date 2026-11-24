import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { Icon } from '@fluentui/react/lib/Icon';
import {
  badge, GROUP_COLORS, DATASOURCE_TAGS_MAP, VESSEL_TYPES, cleanName, suggestTagFromFilename,
  INITIAL_MOCK_DOCUMENTS, INITIAL_MOCK_TEMPLATES, INITIAL_MOCK_APPROVALS,
  INITIAL_MOCK_NOTIFICATIONS, INITIAL_MOCK_USERS,
} from '../constants';
import type {
  FlatRow, GroupedRow, VesselRecord,
} from '../types/rows';
import type { BentoEmailLog } from '../types/bento';
import type { AppView, ModalMode } from '../types/view';
import type {
  FormState, DocPreviewItem, DeletedNode, DocumentItem, TemplateItem,
  ApprovalItem, NotificationItem, UserItem,
} from '../types/ui';
import { getVesselImageForId, pickRandomVesselImage, resolveImgUrl } from '../vesselImagePool';
import { isMobileWidth } from '../responsive';
import { clay } from '../clayTheme';
import { VesselTemplatePreview } from '../pages/VesselFolderTemplateSection';

export function renderVesselForm(host: VesselEmail, mode: 'create' | 'edit'): React.ReactElement {
  return <VesselFormContent host={host} mode={mode} />;
}

function VesselFormContent({ host, mode }: { host: VesselEmail; mode: 'create' | 'edit' }): React.ReactElement {
  const { form, modalBusy, modalMsg, modalError, formFieldErrors, vessels } = host.state;  const isCreate = mode === 'create';
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const [elapsed, setElapsed] = React.useState(0);
  // Ship types come from the backend ship-type master; the built-in list is only a fallback.
  const [shipTypeOptions, setShipTypeOptions] = React.useState<string[]>(VESSEL_TYPES);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`${host._base()}/api/certificates/ship-types`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: Array<{ name: string }>) => { if (!cancelled && rows.length > 0) setShipTypeOptions(rows.map(r => r.name)); })
      .catch(() => { /* keep fallback list */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [availableSites, setAvailableSites] = React.useState<Array<{ id: string; site_key?: string; name?: string; display_name: string; web_url?: string; is_default?: boolean; is_primary?: boolean }>>([]);
  const [loadingSites, setLoadingSites] = React.useState<boolean>(false);
  const [selectedSiteKey, setSelectedSiteKey] = React.useState(form.site_key || '');
  const [browserPath, setBrowserPath] = React.useState(form.parent_folder_path || '');
  const [browserFolders, setBrowserFolders] = React.useState<Array<{ id: string; name: string; path: string }>>([]);
  const [browserLoading, setBrowserLoading] = React.useState(false);
  const [browserError, setBrowserError] = React.useState('');
  const [parentChosen, setParentChosen] = React.useState(form.parent_folder_path !== undefined);
  const [subfolders, setSubfolders] = React.useState<string[]>(form.subfolders || []);
  const [newSubfolder, setNewSubfolder] = React.useState('');
  const [siteMenuOpen, setSiteMenuOpen] = React.useState(false);
  const siteMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const closeSiteMenu = (event: MouseEvent): void => {
      if (siteMenuRef.current && !siteMenuRef.current.contains(event.target as Node)) {
        setSiteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeSiteMenu);
    return () => document.removeEventListener('mousedown', closeSiteMenu);
  }, []);

  // When the site has exactly one admin-chosen vessel folder (Site Management ->
  // Vessel folders), preselect it as the parent so new vessels land inside it
  // (e.g. "Technical and Crewing  New/Ships"). Several or none -> the user
  // keeps picking the parent folder manually, as before.
  const applyDefaultParent = (siteKey: string): void => {
    if (!isCreate || !siteKey) return;
    fetch(`${host._base()}/api/vessel-roots/${encodeURIComponent(siteKey)}`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { mode?: string; paths?: string[] }) => {
        if (d.mode === 'folders' && d.paths && d.paths.length === 1) {
          const root = d.paths[0];
          setBrowserPath(root);
          setParentChosen(true);
          host.setState({ form: { ...host.state.form, site_key: siteKey, parent_folder_path: root } });
        }
      })
      .catch(() => { /* keep the manual parent-folder picker */ });
  };

  React.useEffect(() => {
    setLoadingSites(true);
    fetch(`${host._base()}/api/sites`, { headers: host._headers() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        const sitesList = d.sites || [];
        setAvailableSites(sitesList);
        if (!form.site_key && sitesList.length > 0) {
          const def = sitesList.find((s: any) => s.is_default || s.is_primary) || sitesList[0];
          const key = def.site_key || def.id;
          setSelectedSiteKey(key);
          host.setState({ form: { ...form, site_key: key, parent_folder_path: undefined, subfolders: form.subfolders || [] } });
          applyDefaultParent(key);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSites(false));
  }, []);

  React.useEffect(() => {
    if (!isCreate || !selectedSiteKey) {
      setBrowserFolders([]);
      return;
    }
    setBrowserLoading(true);
    setBrowserError('');
    fetch(`${host._base()}/api/admin/sites/${encodeURIComponent(selectedSiteKey)}/folders?path=${encodeURIComponent(browserPath)}`, { headers: host._headers() })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.detail || 'Could not browse SharePoint folders.'))))
      .then(d => setBrowserFolders(d.folders || []))
      .catch((error: Error) => { setBrowserFolders([]); setBrowserError(error.message); })
      .finally(() => setBrowserLoading(false));
  }, [selectedSiteKey, browserPath, isCreate]);

  const chooseSite = (siteKey: string): void => {
    setSelectedSiteKey(siteKey);
    setSiteMenuOpen(false);
    setBrowserPath('');
    setParentChosen(false);
    host.setState({ form: { ...form, site_key: siteKey, parent_folder_path: undefined, subfolders } });
    applyDefaultParent(siteKey);
  };

  const chooseParent = (): void => {
    setParentChosen(true);
    host.setState({ form: { ...form, site_key: selectedSiteKey, parent_folder_path: browserPath, subfolders } });
  };

  const addSubfolder = (): void => {
    const value = newSubfolder.trim();
    if (!value || subfolders.some(folder => folder.toLowerCase() === value.toLowerCase())) return;
    const next = [...subfolders, value];
    setSubfolders(next);
    setNewSubfolder('');
    host.setState({ form: { ...form, subfolders: next } });
  };

  React.useEffect(() => {
    if (!modalBusy) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, [modalBusy]);

  const formatTimer = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    host.setState({ form: { ...form, [k]: e.target.value }, modalError: null, formFieldErrors: { ...formFieldErrors, [k]: '' } });

  const setName = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    const normalized = value.replace(/[ _'\"]+/g, '').toLowerCase();
    const duplicate = normalized.length > 0 && vessels.some(v =>
      v.id !== host.state.selectedVessel?.id &&
      v.name.replace(/[ _'\"]+/g, '').toLowerCase() === normalized
    );
    host.setState({
      form: { ...form, name: value },
      modalError: null,
      formFieldErrors: { ...formFieldErrors, name: duplicate ? 'Vessel name already exists.' : '' },
    });
  };

  const isSuccess = modalMsg && modalMsg.startsWith('🎉');
  const isEditSuccess = !isCreate && !!modalMsg && (modalMsg.startsWith('✅') || modalMsg.startsWith('⏳'));

   const handleClose = () => {
    host.setState({ modal: 'none', modalMsg: null, modalError: null, formFieldErrors: {} });
    if (isSuccess || isEditSuccess) {
      host._loadData();
    }
  };

  const isFormState = !modalBusy && !isSuccess && !isEditSuccess;
  // Wide (desktop) Create layout: details + site on the left, folder steps on the right, so the form fits without scrolling.
  const winW = host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const wide = isCreate && winW >= 900;

  return (
    <div
      className="vessel-form-modal-i1" style={{ position: 'fixed', background: 'rgba(15,23,42,0.55)', padding: isMobile ? 10 : 20 }}
      onClick={e => { if (e.target === e.currentTarget && !modalBusy) handleClose(); }}
    >
      <div className="vessel-form-modal-i2" style={{ background: clay.surface, width: wide ? 'min(1000px, 94vw)' : (isMobile ? '94vw' : 460), maxHeight: isMobile ? '92vh' : (wide ? '94vh' : '86vh'), border: `1px solid ${clay.accentSoft}` }}>

        <div aria-hidden="true" className="vessel-form-modal-i3" style={{ background: clay.accentGradient }} />

        {!modalBusy && (
          <button
            onClick={handleClose}
            className="vessel-form-modal-i4" style={{ width: 28, background: clay.surfaceRaised, border: `1px solid ${clay.accentSoft}`, color: clay.textMuted }}
            title="Close"
          ><Icon iconName="Cancel" aria-hidden="true" className="vessel-form-modal-i5" /></button>
        )}

        <div className="vessel-form-modal-i6" style={{ padding: isFormState ? (isMobile ? '22px 18px 14px' : '26px 24px 16px') : (isMobile ? '30px 16px 20px' : '30px 28px 22px') }}>

        {/* ── STATE 1: PROVISIONING IN PROGRESS (Timer & Progress Bar) ── */}
        {modalBusy && !isCreate ? (
          <div className="vessel-form-modal-i7">
            <div className="vessel-form-modal-i8"><Icon iconName="Sync" aria-hidden="true" className="vessel-form-modal-i9" /></div>
            <h3 className="vessel-form-modal-i10" style={{ color: '#0284c7' }}>
              Updating Vessel
            </h3>
            <p className="vessel-form-modal-i11" style={{ color: '#475569' }}>
              Saving the updated vessel details. SharePoint folders will not be provisioned.
            </p>
          </div>
        ) : modalBusy ? (
          <div className="vessel-form-modal-i12">
            <div className="vessel-form-modal-i8"><Icon iconName="Sync" aria-hidden="true" className="vessel-form-modal-i9" /></div>
            <h3 className="vessel-form-modal-i13" style={{ color: '#0284c7' }}>
              Creating Vessel…
            </h3>
            <p className="vessel-form-modal-i14" style={{ color: '#475569' }}>
              Registering <strong>"{form.name || 'Vessel'}"</strong> and creating the selected SharePoint folder path. Please wait.
            </p>

            {/* Live Timer badge */}
            <div className="vessel-form-modal-i15" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              <span className="vessel-form-modal-i16"><Icon iconName="Clock" aria-hidden="true" className="vessel-form-modal-i17" /></span>
              <span>Elapsed Time: {formatTimer(elapsed)}</span>
            </div>

            {/* Animated Progress Bar */}
            <div className="vessel-form-modal-i18" style={{ background: '#e2e8f0', borderRadius: 10 }}>
              <div className="vessel-form-modal-i19" style={{ width: `${Math.min(96, 20 + elapsed * 15)}%`, borderRadius: 10 }} />
            </div>

            {/* Step Progress Checklist */}
            <div className="vessel-form-modal-i20" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div className="vessel-form-modal-i21">
                <span className="vessel-form-modal-i22"><Icon iconName="CheckMark" aria-hidden="true" className="vessel-form-modal-i5" /></span><span>Vessel record registered in database</span>
              </div>
              <div className="vessel-form-modal-i23" style={{ color: '#0284c7' }}>
                <span className="vessel-form-modal-i22"><Icon iconName="Sync" aria-hidden="true" className="vessel-form-modal-i5" /></span><span>Creating the vessel folder and selected custom subfolders…</span>
              </div>
              <div className="vessel-form-modal-i24" style={{ color: '#94a3b8' }}>
                <span className="vessel-form-modal-i22"><Icon iconName="CircleRing" aria-hidden="true" className="vessel-form-modal-i5" /></span><span>Linking category subfolders & permissions</span>
              </div>
            </div>
          </div>
        ) : isSuccess ? (
          /* ── STATE 2: SUCCESS SCREEN ── */
          <div className="vessel-form-modal-i12">
            <div className="vessel-form-modal-i25"><Icon iconName="Completed" aria-hidden="true" className="vessel-form-modal-i26" /></div>
            <h3 className="vessel-form-modal-i27">
              Vessel Successfully Created!
            </h3>
            <p className="vessel-form-modal-i28" style={{ color: '#475569' }}>
              <strong>"{form.name}"</strong> has been registered and created at the selected SharePoint location.
            </p>

            <div className="vessel-form-modal-i29" style={{ background: '#ecfdf5', borderRadius: 10, color: '#065f46' }}>
              <div className="vessel-form-modal-i30"><Icon iconName="CheckMark" aria-hidden="true" className="vessel-form-modal-i31" /> Vessel Ready</div>
              <div>• Registered vessel card added to main grid</div>
              <div>• IMO Number: {form.imo || '—'}</div>
              <div>• Selected SharePoint folder path created</div>
            </div>

            <button
              onClick={handleClose}
              className="vessel-form-modal-i32" style={{ borderRadius: 10 }}
            >
              Done / View Vessels
            </button>
          </div>
        ) : isEditSuccess ? (
          <div className="vessel-form-modal-i7">
            <div className="vessel-form-modal-i25"><Icon iconName="CheckMark" aria-hidden="true" className="vessel-form-modal-i26" /></div>
            <h3 className="vessel-form-modal-i27">
              Vessel Updated Successfully
            </h3>
            <p className="vessel-form-modal-i28" style={{ color: '#475569' }}>
              The vessel details were saved without changing its SharePoint folders.
            </p>
            <button
              onClick={handleClose}
              className="vessel-form-modal-i32" style={{ borderRadius: 10 }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ── STATE 3: FORM ENTRY ── */
          <>
            <div className="vessel-form-modal-i33">
              <div className="vessel-form-modal-i34" style={{ borderRadius: 12, background: clay.accentGradient, boxShadow: clay.shadowIcon, border: `1px solid ${clay.accentSoft}` }}>
                <Icon iconName="Ferry" aria-hidden="true" className="vessel-form-modal-i35" />
              </div>
              <div>
                <div className="vessel-form-modal-i36" style={{ color: clay.text }}>{isCreate ? 'Create a new vessel' : 'Update vessel details'}</div>
                <div className="vessel-form-modal-i37" style={{ color: clay.textMuted }}>
                  {isCreate ? 'Pick a SharePoint location and optional subfolders.' : 'Update the vessel details below.'}
                </div>
              </div>
            </div>

            {modalMsg && <div className="vessel-form-modal-i38" style={{ background: '#dff6dd', color: '#107c10', borderRadius: 6 }}>{modalMsg}</div>}
            {modalError && <div className="vessel-form-modal-i38" style={{ background: '#fde7e9', color: '#a4262c', borderRadius: 6 }}>{modalError}</div>}

            {(() => {
              const stepsPanel: React.CSSProperties = { background: clay.surfaceRaised, borderRadius: 12, border: `1px solid ${clay.accentSoft}`, padding: 12, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 };
              const siteLabel = availableSites.find(site => (site.site_key || site.id) === selectedSiteKey)?.display_name || selectedSiteKey;
              const step1El = (
                <div>
                  <label className="vessel-form-modal-i39" style={{ color: clay.textMuted }}>
                    <span className="vessel-form-modal-i40" style={{ width: 17, background: clay.accentGradient }}>1</span>
                    SharePoint site
                  </label>
                  <div ref={siteMenuRef} className="vessel-form-modal-i41">
                    <button
                      type="button"
                      disabled={modalBusy || loadingSites}
                      aria-haspopup="listbox"
                      aria-expanded={siteMenuOpen}
                      onClick={() => setSiteMenuOpen(open => !open)}
                      className="vessel-form-modal-i42" style={{ width: '100%', border: `1px solid ${siteMenuOpen ? clay.accent : clay.accentSoft}`, borderRadius: 8, background: clay.surface, color: selectedSiteKey ? clay.text : clay.textMuted, cursor: modalBusy || loadingSites ? 'not-allowed' : 'pointer' }}
                    >
                      {availableSites.find(site => (site.site_key || site.id) === selectedSiteKey)?.display_name || selectedSiteKey || (loadingSites ? 'Loading sites...' : 'Select a SharePoint site')}
                      <span aria-hidden="true" className="vessel-form-modal-i43" style={{ transform: `translateY(-50%) rotate(${siteMenuOpen ? 180 : 0}deg)`, color: clay.accentDark }}><Icon iconName="ChevronDown" aria-hidden="true" className="vessel-form-modal-i31" /></span>
                    </button>
                    {siteMenuOpen && !modalBusy && !loadingSites && (
                      <div role="listbox" aria-label="SharePoint sites" className="vessel-form-modal-i44" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, borderRadius: 8 }}>
                        {availableSites.map(site => {
                          const key = site.site_key || site.id;
                          const label = site.display_name || site.name || key;
                          const selected = key === selectedSiteKey;
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              key={key}
                              onClick={() => chooseSite(key)}
                              className="vessel-form-modal-i45" style={{ width: '100%', borderRadius: 6, background: selected ? clay.accentSoft : 'transparent', color: selected ? clay.accentDeep : clay.text, fontWeight: selected ? 700 : 500 }}
                            >
                              {selected && <span className="vessel-form-modal-i46" style={{ color: clay.accentDark }}><Icon iconName="CheckMark" aria-hidden="true" className="vessel-form-modal-i31" /></span>}{label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
              const step2El = (
                <>
                  {selectedSiteKey && (
                    <div>
                      <div className="vessel-form-modal-i47">
                        <label className="vessel-form-modal-i48" style={{ color: clay.textMuted }}>
                          <span className="vessel-form-modal-i40" style={{ width: 17, background: clay.accentGradient }}>2</span>
                          Choose parent folder
                        </label>
                        <button type="button" onClick={() => { setBrowserPath(''); }} disabled={!browserPath || browserLoading} className="vessel-form-modal-i49" style={{ background: 'transparent', color: '#0369a1' }}>Root</button>
                      </div>
                      <div className="vessel-form-modal-i50" style={{ color: '#475569' }}>
                        <button type="button" onClick={() => setBrowserPath('')} className="vessel-form-modal-i51" style={{ background: 'transparent', color: '#0369a1' }}>Root</button>
                        {browserPath.split('/').filter(Boolean).map((segment, index, segments) => (
                          <React.Fragment key={`${segment}-${index}`}>
                            <span>/</span>
                            <button type="button" onClick={() => setBrowserPath(segments.slice(0, index + 1).join('/'))} className="vessel-form-modal-i52" style={{ color: index === segments.length - 1 ? '#0f172a' : '#0369a1', fontWeight: index === segments.length - 1 ? 700 : 600 }}>{segment}</button>
                          </React.Fragment>
                        ))}
                      </div>
                      {browserError && <div className="vessel-form-modal-i53">{browserError}</div>}
                      {browserLoading ? <div className="vessel-form-modal-i54" style={{ color: clay.textMuted }}>Loading folders...</div> : (
                        <div className="vessel-form-modal-i55" style={{ border: `1px solid ${clay.accentSoft}`, borderRadius: 8, background: clay.surface, maxHeight: wide ? 'clamp(72px, 17vh, 150px)' : 180 }}>
                          {browserFolders.length === 0 ? <div className="vessel-form-modal-i54" style={{ color: clay.textMuted }}>No subfolders at this level.</div> : browserFolders.map(folder => (
                            <button type="button" key={folder.id} onClick={() => setBrowserPath(folder.path)} className="vessel-form-modal-i56" style={{ width: '100%', borderBottom: `1px solid ${clay.accentSoft}`, background: clay.surface, color: clay.text }}><Icon iconName="FabricFolder" aria-hidden="true" className="vessel-form-modal-i31" /> {folder.name}</button>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={chooseParent} disabled={modalBusy} className="vessel-form-modal-i57" style={{ border: `1px solid ${form.parent_folder_path === browserPath ? '#059669' : '#0284c7'}`, background: form.parent_folder_path === browserPath ? '#dcfce7' : '#eff6ff', color: form.parent_folder_path === browserPath ? '#15803d' : '#0369a1' }}>
                        {form.parent_folder_path === browserPath ? <><Icon iconName="CheckMark" aria-hidden="true" className="vessel-form-modal-i31" /> Parent folder selected</> : 'Use this folder as parent'}
                      </button>
                    </div>
                  )}
                </>
              );
              const step3El = (
                <>
                  {selectedSiteKey && (
                    <div>
                      <label className="vessel-form-modal-i39" style={{ color: clay.textMuted }}>
                        <span className="vessel-form-modal-i40" style={{ width: 17, background: clay.accentGradient }}>3</span>
                        Folders inside {form.name || 'the vessel'}
                      </label>
                      {isCreate && <div className="vessel-form-modal-i58"><VesselTemplatePreview host={host} vesselName={form.name || ''} /></div>}
                      <div className="vessel-form-modal-i59" style={{ color: clay.textMuted }}>
                        Need anything extra for this vessel only? Add flat folders or nested paths such as Certificates/Statutory/Reports — they are created alongside the standard folders.
                        {!parentChosen && ' Select the parent folder above before creating the vessel.'}
                      </div>
                      <div className="vessel-form-modal-i60">
                        <input value={newSubfolder} onChange={e => setNewSubfolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubfolder(); } }} placeholder="e.g. Certificates/Statutory/Reports" className="vessel-form-modal-i61" style={{ minWidth: 0, border: `1px solid ${clay.accentSoft}`, borderRadius: 7 }} />
                        <button type="button" onClick={addSubfolder} disabled={modalBusy} className="vessel-form-modal-i62" style={{ background: '#eff6ff', color: '#0369a1', cursor: modalBusy ? 'not-allowed' : 'pointer' }}>+ Add folder</button>
                      </div>
                      {subfolders.length > 0 && <div className="vessel-form-modal-i63">{subfolders.map(folder => <span key={folder} className="vessel-form-modal-i64" style={{ background: '#e0f2fe', color: '#075985' }}>{folder}<button type="button" onClick={() => { const next = subfolders.filter(value => value !== folder); setSubfolders(next); host.setState({ form: { ...form, subfolders: next } }); }} className="vessel-form-modal-i65" style={{ background: 'transparent', color: '#075985' }}>×</button></span>)}</div>}
                    </div>
                  )}
                </>
              );
              return (
            <div style={wide ? { display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 'clamp(14px, 2vw, 20px)', alignItems: 'stretch' } : { display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={wide ? { display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 1.6vh, 14px)', minWidth: 0 } : { display: 'contents' }}>
              <div className="vessel-form-modal-i66" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <div>
                  <label className="vessel-form-modal-i67" style={{ color: clay.textMuted }}>
                    Vessel name <span className="vessel-form-modal-i68">*</span>
                  </label>
                  <input
                    className="vessel-form-modal-i69" style={{ width: '100%', borderRadius: 9, border: `1px solid ${formFieldErrors?.name ? '#ef4444' : clay.accentSoft}`, color: clay.text }}
                    value={form.name} onChange={setName} placeholder="e.g. MV Pacific Trader" />
                  {formFieldErrors?.name && (
                    <div className="vessel-form-modal-i70">
                      <span><Icon iconName="Warning" aria-hidden="true" className="vessel-form-modal-i71" /></span><span>{formFieldErrors.name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="vessel-form-modal-i67" style={{ color: clay.textMuted }}>
                    IMO number <span className="vessel-form-modal-i68">*</span>
                  </label>
                  <input
                    className="vessel-form-modal-i69" style={{ width: '100%', borderRadius: 9, border: `1px solid ${formFieldErrors?.imo ? '#ef4444' : clay.accentSoft}`, color: clay.text }}
                    value={form.imo}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                      const duplicate = val.length > 0 && vessels.some(v =>
                        v.id !== host.state.selectedVessel?.id && (v.imo || '').trim() === val
                      );
                      host.setState({
                        form: { ...form, imo: val },
                        modalError: null,
                        formFieldErrors: { ...formFieldErrors, imo: duplicate ? 'A vessel with that IMO number already exists.' : '' },
                      });
                    }}
                    placeholder="7 digits, e.g. 9074729"
                    maxLength={7}
                    inputMode="numeric" />
                  {formFieldErrors?.imo && (
                    <div className="vessel-form-modal-i70">
                      <span><Icon iconName="Warning" aria-hidden="true" className="vessel-form-modal-i71" /></span><span>{formFieldErrors.imo}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="vessel-form-modal-i66" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <div>
                  <label className="vessel-form-modal-i67" style={{ color: clay.textMuted }}>Shipyard name</label>
                  <input
                    className="vessel-form-modal-i69" style={{ width: '100%', borderRadius: 9, border: `1px solid ${clay.accentSoft}`, color: clay.text }}
                    value={form.shipyard} onChange={set('shipyard')} placeholder="e.g. Hyundai Heavy Industries" />
                </div>

                <div>
                  <label className="vessel-form-modal-i67" style={{ color: clay.textMuted }}>Hull number</label>
                  <input
                    className="vessel-form-modal-i69" style={{ width: '100%', borderRadius: 9, border: `1px solid ${clay.accentSoft}`, color: clay.text }}
                    value={form.hull_number} onChange={set('hull_number')} placeholder="e.g. H2456" />
                </div>
              </div>

              <div>
                <label className="vessel-form-modal-i67" style={{ color: clay.textMuted }}>Vessel type</label>
                <select
                  className="vessel-form-modal-i72" style={{ width: '100%', borderRadius: 9, border: `1px solid ${clay.accentSoft}`, background: clay.surface, color: form.vessel_type ? clay.text : clay.textMuted }}
                  value={form.vessel_type} onChange={set('vessel_type')}>
                  <option value="">Select a type...</option>
                  {shipTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
                {wide && (
                  <div style={{ ...stepsPanel, flex: 1 }}>
                    {step1El}
                    {selectedSiteKey && (
                      <div className="vessel-form-modal-i73" style={{ border: `1px dashed ${clay.accentSoft}`, borderRadius: 8, color: clay.textMuted }}>
                        <div className="vessel-form-modal-i74" style={{ color: clay.text }}>Will be created at</div>
                        {[siteLabel, form.parent_folder_path || 'Root', form.name || 'your vessel name'].join(' / ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {wide ? (
                <div style={stepsPanel}>{step2El}{step3El}</div>
              ) : isCreate && (
                <div style={stepsPanel}>{step1El}{step2El}{step3El}</div>
              )}
            </div>
              );
            })()}
          </>
        )}
        </div>

        {isFormState && (
          <div className="vessel-form-modal-i75" style={{ flexDirection: isMobile ? 'column' : 'row', padding: isMobile ? '14px 18px' : '14px 24px', borderTop: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
            <button
              className="vessel-form-modal-i76" style={{ border: `1px solid ${clay.accentSoft}`, borderRadius: 8, width: isMobile ? '100%' : 'auto', color: clay.textMuted }}
              onClick={handleClose}>Cancel</button>
            <button
              className="vessel-form-modal-i77" style={{ background: clay.accentGradient, borderRadius: clay.radiusButton, width: isMobile ? '100%' : 'auto', boxShadow: clay.shadowButton }}
              onClick={isCreate ? host._submitCreate : host._submitEdit}>
              {isCreate ? 'Create Vessel' : 'Update Vessel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
