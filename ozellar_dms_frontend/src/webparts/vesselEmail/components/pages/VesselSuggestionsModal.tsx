import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import type { VesselSuggestion } from '../types/ui';
import { isMobileWidth } from '../responsive';
import { Icon } from '@fluentui/react/lib/Icon';

// ── Vessel Suggestions Modal ───────────────────────────────────────────────
// Full-screen wizard that:
//   Step 1 (extract)  — animates through extracting info from uploaded file names
//   Step 2 (match)    — shows Term Store match result with confidence badge
//   Step 3 (review)   — editable form: IMO, Shipyard, Hull No., Vessel Type, Vessel Name
//   Step 4 (done)     — success screen

const VESSEL_TYPES = [
  '', 'Bulk Carrier', 'VLCC', 'Suezmax Tanker', 'Aframax Tanker', 'Product Tanker',
  'LNG Carrier', 'LPG Carrier', 'Chemical Tanker', 'Tanker', 'Container Ship',
  'RoRo / Car Carrier', 'General Cargo', 'Offshore Vessel', 'Passenger / Ferry', 'Other',
];

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 110000,
  background: 'rgba(8,14,44,0.72)',
  backdropFilter: 'blur(12px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const CARD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
  border: '1px solid rgba(99,179,237,0.25)',
  borderRadius: 24,
  boxShadow: '0 32px 96px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
  width: '100%',
  maxWidth: 600,
  position: 'relative',
  overflow: 'hidden',
};

const GLASS_PANEL: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '14px 16px',
};

function confidenceColor(c: number): string {
  if (c >= 0.75) return '#4ade80';
  if (c >= 0.40) return '#facc15';
  return '#f87171';
}

function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'High confidence';
  if (c >= 0.40) return 'Medium confidence';
  return 'Low confidence';
}

function StepIndicator({ step }: { step: string }): React.ReactElement {
  const steps = [
    { id: 'extract', label: 'Extract' },
    { id: 'match', label: 'Match' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ];
  const activeIdx = steps.findIndex(s => s.id === step);
  return (
    <div className="vessel-suggestions-modal-i1">
      {steps.map((s, i) => {
        const isActive = s.id === step;
        const isDone = i < activeIdx;
        return (
          <React.Fragment key={s.id}>
            <div className="vessel-suggestions-modal-i2">
              <div className="vessel-suggestions-modal-i3" style={{ background: isDone ? '#4ade80' : isActive ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.08)', border: isActive ? '2px solid rgba(99,179,237,0.6)' : '2px solid transparent', boxShadow: isActive ? '0 0 16px rgba(59,130,246,0.5)' : 'none' }}>
                {isDone ? <Icon iconName="CheckMark" aria-hidden="true" className="vessel-suggestions-modal-i4" /> : i + 1}
              </div>
              <span className="vessel-suggestions-modal-i5" style={{ color: isActive ? '#93c5fd' : isDone ? '#86efac' : 'rgba(255,255,255,0.4)', fontWeight: isActive ? 600 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="vessel-suggestions-modal-i6" style={{ background: isDone ? 'linear-gradient(90deg,#4ade80,#22c55e)' : 'rgba(255,255,255,0.1)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ExtractRow({ label, value, delay }: { label: string; value: string; delay: number }): React.ReactElement {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className="vessel-suggestions-modal-i7" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-12px)' }}>
      <span className="vessel-suggestions-modal-i8" style={{ width: 120 }}>{label}</span>
      <span className="vessel-suggestions-modal-i9" style={{ color: value ? '#e2e8f0' : 'rgba(100,116,139,1)', fontFamily: value ? "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" : 'inherit' }}>
        {value || 'Not detected'}
      </span>
      {value && <span className="vessel-suggestions-modal-i10"><Icon iconName="CheckMark" aria-hidden="true" className="vessel-suggestions-modal-i11" /></span>}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', options, required, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: 'text' | 'select'; options?: string[]; required?: boolean; hint?: string;
}): React.ReactElement {
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(99,179,237,0.2)',
    borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14,
    outline: 'none', transition: 'border-color 0.2s',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };
  return (
    <div className="vessel-suggestions-modal-i12">
      <label className="vessel-suggestions-modal-i13" style={{ color: '#94a3b8' }}>
        {label}{required && <span className="vessel-suggestions-modal-i14">*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
        >
          {(options || []).map(o => <option key={o} value={o} style={{ background: '#1e293b' }}>{o || 'Select type…'}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,179,237,0.6)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(99,179,237,0.2)'; }}
        />
      )}
      {hint && <div className="vessel-suggestions-modal-i15" style={{ color: '#64748b' }}>{hint}</div>}
    </div>
  );
}

export function renderVesselSuggestionsModal(host: VesselEmail): React.ReactElement | null {
  const dlg = host.state.vesselSuggestionDialog;
  if (!dlg || !dlg.open) return null;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  const {
    step, extracting, suggestion, editedSuggestion, creating, error, files,
    allSuggestions = [], selectedSuggestionIndex = 0,
  } = dlg;

  const close = (): void => { host.setState({ vesselSuggestionDialog: null }); };

  const setEdited = (patch: Partial<VesselSuggestion>): void => {
    host.setState(prev => ({
      vesselSuggestionDialog: prev.vesselSuggestionDialog
        ? { ...prev.vesselSuggestionDialog, editedSuggestion: { ...prev.vesselSuggestionDialog.editedSuggestion!, ...patch } }
        : null,
    }));
  };

  const useExisting = (): void => {
    if (!suggestion?.matchedExisting) return;
    void host._applyVesselSuggestionUseExisting();
  };

  const hasMatch = !!suggestion?.matchedExisting;
  const confPct = Math.round((suggestion?.confidence || 0) * 100);
  const formatLastScanned = (ts?: number): string => {
    if (!ts) return 'Unknown';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div style={OVERLAY_STYLE} onClick={e => { if (e.target === e.currentTarget) close(); }}>

      <div className="vsm-card" style={{ ...CARD_STYLE, width: isMobile ? '95vw' : '100%', maxWidth: isMobile ? '95vw' : 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="vessel-suggestions-modal-i16" />
        <div style={{ padding: isMobile ? '18px 14px 16px' : '28px 32px 24px' }}>
          {/* Title row */}
          <div className="vessel-suggestions-modal-i17">
            <div>
              <div className="vessel-suggestions-modal-i18">
                <div className="vessel-suggestions-modal-i19" style={{ borderRadius: 10 }}><Icon iconName="Ferry" aria-hidden="true" className="vessel-suggestions-modal-i20" /></div>
                <h2 className="vessel-suggestions-modal-i21" style={{ color: '#f1f5f9' }}>Vessel Suggestions</h2>
              </div>
              <p className="vessel-suggestions-modal-i22" style={{ color: '#64748b' }}>
                {files.length > 0
                  ? `Analysing ${files.length} uploaded file${files.length !== 1 ? 's' : ''} to identify vessel details`
                  : 'Review detected suggestions, scan documents, or create new vessels in the Term Store'}
              </p>
            </div>
            <button className="vsm-btn" onClick={close} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 44, height: 44, color: '#94a3b8', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon iconName="Cancel" aria-hidden="true" className="vessel-suggestions-modal-i20" /></button>
          </div>

          <StepIndicator step={step} />

          {/* STEP: EXTRACT / MATCH */}
          {(step === 'extract' || step === 'match') && (
            <div className="vsm-fade">
              <div className="vessel-suggestions-modal-i23">
                {extracting ? (
                  <div className="vsm-spinner" style={{ width: 20, height: 20, border: '2px solid rgba(99,179,237,0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', flexShrink: 0 }} />
                ) : (
                  <span className="vessel-suggestions-modal-i24"><Icon iconName="Search" aria-hidden="true" className="vessel-suggestions-modal-i20" /></span>
                )}
                <span className="vessel-suggestions-modal-i25">
                  {step === 'extract' ? 'Scanning file names & OCR content for vessel identity…' : 'Matching against Term Store…'}
                </span>
              </div>
              <div className="vessel-suggestions-modal-i26">
                {files.slice(0, 6).map((f, i) => (
                  <div key={i} className="vessel-suggestions-modal-i27" style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 6, color: '#93c5fd', maxWidth: 220 }}><Icon iconName="Page" aria-hidden="true" className="vessel-suggestions-modal-i11" /> {f.name}</div>
                ))}
                {files.length > 6 && <div className="vessel-suggestions-modal-i28" style={{ color: '#64748b' }}>+{files.length - 6} more</div>}
              </div>
              {step === 'match' && suggestion && (
                <div style={GLASS_PANEL}>
                  <div className="vessel-suggestions-modal-i29" style={{ color: '#64748b' }}>Extracted Information</div>
                  <ExtractRow label="Vessel Name" value={suggestion.vesselName} delay={0} />
                  <ExtractRow label="Hull Number" value={suggestion.hullNumber} delay={100} />
                  <ExtractRow label="IMO Number" value={suggestion.imoNumber} delay={200} />
                  <ExtractRow label="Shipyard" value={suggestion.shipyard} delay={300} />
                  <ExtractRow label="Vessel Type" value={suggestion.vesselType} delay={400} />
                </div>
              )}
            </div>
          )}

          {/* STEP: REVIEW - NO NEW VESSELS DETECTED */}
          {step === 'review' && !suggestion && (
            <div className="vsm-fade" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <div className="vessel-suggestions-modal-i30" style={{ background: 'rgba(74,222,128,0.1)' }}>
                <Icon iconName="Brightness" aria-hidden="true" className="vessel-suggestions-modal-i31" />
              </div>
              <h3 className="vessel-suggestions-modal-i32" style={{ color: '#f1f5f9' }}>
                All Documents Match Existing Vessels
              </h3>
              <p className="vessel-suggestions-modal-i33" style={{ color: '#94a3b8' }}>
                The uploaded documents belong to vessels that already exist in the Term Store. No new vessels need to be created.
              </p>
              <div className="vessel-suggestions-modal-i34">
                <label className="vessel-suggestions-modal-i35" style={{ borderRadius: 10 }}>
                  <input
                    type="file"
                    multiple
                    className="vessel-suggestions-modal-i36"
                    onChange={e => {
                      const filesList = Array.from(e.target.files || []);
                      if (filesList.length === 0) return;
                      host._openVesselSuggestions(filesList);
                    }}
                  />
                  <span><Icon iconName="Page" aria-hidden="true" className="vessel-suggestions-modal-i4" /></span> Scan Document for New Vessel
                </label>
                <button
                  type="button"
                  onClick={close}
                  className="vessel-suggestions-modal-i37" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, color: '#94a3b8' }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STEP: REVIEW - NEW VESSEL SUGGESTION PRESENT */}
          {step === 'review' && suggestion && editedSuggestion && (
            <div className="vsm-fade">
              {/* Multi-Vessel Selector if multiple new vessels were detected */}
              {allSuggestions && allSuggestions.length > 1 && (
                <div className="vessel-suggestions-modal-i38">
                  <div className="vessel-suggestions-modal-i39" style={{ color: '#94a3b8' }}>
                    <Icon iconName="Ferry" aria-hidden="true" className="vessel-suggestions-modal-i11" /> Suggested New Vessels ({allSuggestions.length})
                  </div>
                  <div className="vessel-suggestions-modal-i40">
                    {allSuggestions.map((s, idx) => {
                      const isSelected = idx === selectedSuggestionIndex;
                      const isOcr = !!s.ocrVerified;
                      return (
                        <button
                          key={s.vesselName + idx}
                          type="button"
                          onClick={() => {
                            host.setState(prev => ({
                              vesselSuggestionDialog: prev.vesselSuggestionDialog
                                ? {
                                    ...prev.vesselSuggestionDialog,
                                    selectedSuggestionIndex: idx,
                                    suggestion: s,
                                    editedSuggestion: {
                                      ...s,
                                      vesselName: s.vesselName,
                                      imoNumber: s.imoNumber,
                                      shipyard: s.shipyard,
                                      hullNumber: s.hullNumber,
                                      vesselType: s.vesselType,
                                    },
                                  }
                                : null,
                            }));
                          }}
                          className="vessel-suggestions-modal-i41" style={{ borderRadius: 10, background: isSelected ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.06)', border: isSelected ? '1px solid rgba(99,179,237,0.6)' : '1px solid rgba(255,255,255,0.1)', color: isSelected ? '#fff' : '#cbd5e1', fontWeight: isSelected ? 700 : 500, transition: 'all 0.15s ease', boxShadow: isSelected ? '0 4px 12px rgba(59,130,246,0.4)' : 'none' }}
                        >
                          <span><Icon iconName="Ferry" aria-hidden="true" className="vessel-suggestions-modal-i42" /></span>
                          <span>{s.vesselName}</span>
                          <span className="vessel-suggestions-modal-i5" style={{ opacity: 0.8 }} title={formatLastScanned(s.lastDetectedAt)}>
                            {s.lastDetectedAt ? new Date(s.lastDetectedAt).toLocaleDateString() : ''}
                          </span>
                          {isOcr && (
                            <span className="vessel-suggestions-modal-i43" style={{ background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(59,130,246,0.2)', color: isSelected ? '#fff' : '#93c5fd' }}>
                              {Math.round((s.ocrConfidence || s.confidence) * 100)}% OCR
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Match / New Vessel Banner */}
              <div style={{
                ...GLASS_PANEL,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderColor: hasMatch ? 'rgba(74,222,128,0.35)' : 'rgba(59,130,246,0.35)',
                background: hasMatch ? 'rgba(74,222,128,0.06)' : 'rgba(59,130,246,0.06)',
              }}>
                <div className="vessel-suggestions-modal-i44">{hasMatch ? <Icon iconName="BullseyeTarget" aria-hidden="true" className="vessel-suggestions-modal-i45" /> : <Icon iconName="Search" aria-hidden="true" className="vessel-suggestions-modal-i45" />}</div>
                <div className="vessel-suggestions-modal-i46">
                  {hasMatch ? (
                    <>
                      <div className="vessel-suggestions-modal-i47">
                        <span>Match Found — {suggestion.matchedExisting!.name}</span>
                        {suggestion.ocrVerified && (
                          <span className="vessel-suggestions-modal-i48" style={{ background: 'rgba(74,222,128,0.2)', color: '#86efac', borderRadius: 6 }}>
                            <Icon iconName="CheckMark" aria-hidden="true" className="vessel-suggestions-modal-i49" /> OCR Verified
                          </span>
                        )}
                      </div>
                      <div className="vessel-suggestions-modal-i50" style={{ color: '#94a3b8' }}>
                        This vessel already exists in the Term Store with {confPct}% match confidence.
                      </div>
                      <div className="vessel-suggestions-modal-i15" style={{ color: '#64748b' }}>
                        Last scanned: {formatLastScanned(suggestion.lastDetectedAt)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="vessel-suggestions-modal-i51">
                        <span>Suggested New Vessel — {suggestion.vesselName || 'New Vessel'}</span>
                        {suggestion.ocrVerified && (
                          <span className="vessel-suggestions-modal-i52" style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', borderRadius: 6 }}>
                            <Icon iconName="CheckMark" aria-hidden="true" className="vessel-suggestions-modal-i49" /> OCR Extracted
                          </span>
                        )}
                      </div>
                      <div className="vessel-suggestions-modal-i50" style={{ color: '#94a3b8' }}>
                        Extracted from uploaded document text. Review details below and create in Term Store.
                      </div>
                      <div className="vessel-suggestions-modal-i15" style={{ color: '#64748b' }}>
                        Last scanned: {formatLastScanned(suggestion.lastDetectedAt)}
                      </div>
                    </>
                  )}
                  {suggestion.matchedKeywords && suggestion.matchedKeywords.length > 0 && (
                    <div className="vessel-suggestions-modal-i53">
                      {suggestion.matchedKeywords.slice(0, 4).map((kw, i) => (
                        <span key={i} className="vessel-suggestions-modal-i54" style={{ background: 'rgba(255,255,255,0.06)', color: '#93c5fd' }}>
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="vessel-suggestions-modal-i55" style={{ background: `${confidenceColor(suggestion.confidence)}22`, border: `1px solid ${confidenceColor(suggestion.confidence)}44`, borderRadius: 8 }}>
                  <div className="vessel-suggestions-modal-i56" style={{ color: confidenceColor(suggestion.confidence) }}>{confPct}%</div>
                  <div className="vessel-suggestions-modal-i57" style={{ color: '#94a3b8' }}>{confidenceLabel(suggestion.confidence)}</div>
                </div>
              </div>

              <div style={{ ...GLASS_PANEL, padding: '20px' }}>
                <div className="vessel-suggestions-modal-i58">
                  <div className="vessel-suggestions-modal-i59" style={{ color: '#64748b' }}><Icon iconName="Edit" aria-hidden="true" className="vessel-suggestions-modal-i11" /> Review &amp; Edit Vessel Details</div>
                  <label className="vessel-suggestions-modal-i60" style={{ background: 'rgba(99,179,237,0.15)', borderRadius: 8, color: '#93c5fd' }}>
                    <input
                      type="file"
                      multiple
                      className="vessel-suggestions-modal-i36"
                      onChange={e => {
                        const filesList = Array.from(e.target.files || []);
                        if (filesList.length === 0) return;
                        host._openVesselSuggestions(filesList);
                      }}
                    />
                    <span><Icon iconName="Page" aria-hidden="true" className="vessel-suggestions-modal-i11" /></span> Scan Document
                  </label>
                </div>

                <div className="vessel-suggestions-modal-i61">
                  <Field label="Vessel Name" value={editedSuggestion.vesselName} onChange={v => setEdited({ vesselName: v })} required hint="Full display name of the vessel" />
                  <Field label="IMO Number" value={editedSuggestion.imoNumber} onChange={v => setEdited({ imoNumber: v })} required hint="7-digit IMO registration number" />
                  <Field label="Hull Number" value={editedSuggestion.hullNumber} onChange={v => setEdited({ hullNumber: v })} hint="Yard / hull build number (e.g. SS268)" />
                  <Field label="Vessel Type" value={editedSuggestion.vesselType} onChange={v => setEdited({ vesselType: v })} type="select" options={VESSEL_TYPES} />
                  <div className="vessel-suggestions-modal-i62">
                    <Field label="Shipyard Name" value={editedSuggestion.shipyard} onChange={v => setEdited({ shipyard: v })} hint="Name of the shipyard that built the vessel" />
                  </div>
                </div>
                <div className="vessel-suggestions-modal-i63">
                  <div className="vessel-suggestions-modal-i64" style={{ color: '#475569' }}>Extracted from</div>
                  <div className="vessel-suggestions-modal-i65">
                    {(editedSuggestion.sourceFiles || []).slice(0, 4).map((f, i) => (
                      <div key={i} className="vessel-suggestions-modal-i66" style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', maxWidth: 180 }}>{f}</div>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="vessel-suggestions-modal-i67" style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 10, color: '#fca5a5' }}>
                  <Icon iconName="Warning" aria-hidden="true" className="vessel-suggestions-modal-i4" /> {error}
                </div>
              )}

              <div className="vessel-suggestions-modal-i68">
                {hasMatch && (
                  <button id="vsm-use-existing-btn" className="vsm-btn" onClick={useExisting} disabled={creating} style={{ flex: 1, padding: '13px 20px', borderRadius: 12, background: creating ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg, #059669, #10b981)', border: creating ? '1px solid rgba(16,185,129,0.35)' : 'none', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: creating ? 0.85 : 1 }}>
                    <span className="vessel-suggestions-modal-i24">{creating ? <Icon iconName="Sync" aria-hidden="true" className="vessel-suggestions-modal-i20" /> : <Icon iconName="CheckMark" aria-hidden="true" className="vessel-suggestions-modal-i20" />}</span>{creating ? 'Routing to Matched Vessel…' : 'Use Existing Vessel'}
                  </button>
                )}
                <button
                  id="vsm-create-vessel-btn"
                  className="vsm-btn"
                  onClick={() => void host._applyVesselSuggestionCreate()}
                  disabled={creating || !editedSuggestion.vesselName.trim()}
                  style={{ flex: 1, padding: '13px 20px', borderRadius: 12, background: creating ? 'rgba(99,179,237,0.15)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: creating ? '1px solid rgba(99,179,237,0.3)' : 'none', color: creating ? '#93c5fd' : '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !editedSuggestion.vesselName.trim() ? 0.5 : 1 }}
                >
                  {creating ? (
                    <><div className="vsm-spinner" style={{ width: 16, height: 16, border: '2px solid rgba(147,197,253,0.3)', borderTopColor: '#93c5fd', borderRadius: '50%' }} />Creating in Term Store…</>
                  ) : (
                    <><span className="vessel-suggestions-modal-i24"><Icon iconName="Add" aria-hidden="true" className="vessel-suggestions-modal-i20" /></span>{hasMatch ? 'Re-create / Update Vessel' : 'Create New Vessel'}</>
                  )}
                </button>
                <button
                  id="vsm-ignore-vessel-btn"
                  className="vsm-btn"
                  onClick={() => host._ignoreCurrentVesselSuggestion()}
                  disabled={creating}
                  style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 13, minWidth: 108 }}
                  title="Mark this suggestion as false positive"
                >
                  Ignore
                </button>
                <button className="vsm-btn" onClick={close} style={{ padding: '13px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 13 }}>Skip</button>
              </div>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && (
            <div className="vsm-fade" style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div className="vessel-suggestions-modal-i69">
                {editedSuggestion?.matchedExisting ? <Icon iconName="BullseyeTarget" aria-hidden="true" className="vessel-suggestions-modal-i70" /> : <Icon iconName="Completed" aria-hidden="true" className="vessel-suggestions-modal-i70" />}
              </div>
              <h3 className="vessel-suggestions-modal-i71" style={{ color: '#f1f5f9' }}>
                {editedSuggestion?.matchedExisting ? 'Linked to Existing Vessel' : 'Vessel Created Successfully!'}
              </h3>
              <p className="vessel-suggestions-modal-i72" style={{ color: '#94a3b8' }}>
                {editedSuggestion?.matchedExisting
                  ? `Documents will be tagged under "${editedSuggestion.matchedExisting.name}".`
                  : `"${editedSuggestion?.vesselName || 'Vessel'}" has been added to the Term Store and folder provisioning is underway.`
                }
              </p>
              {editedSuggestion && (
                <div className="vessel-suggestions-modal-i73">
                  {[
                    { icon: <Icon iconName="NumberSymbol" aria-hidden="true" className="vessel-suggestions-modal-i42" />, label: 'IMO', value: editedSuggestion.imoNumber },
                    { icon: <Icon iconName="ConstructionCone" aria-hidden="true" className="vessel-suggestions-modal-i42" />, label: 'Hull', value: editedSuggestion.hullNumber },
                    { icon: <Icon iconName="Manufacturing" aria-hidden="true" className="vessel-suggestions-modal-i42" />, label: 'Shipyard', value: editedSuggestion.shipyard },
                    { icon: <Icon iconName="Ferry" aria-hidden="true" className="vessel-suggestions-modal-i42" />, label: 'Type', value: editedSuggestion.vesselType },
                  ].filter(p => p.value).map((p, i) => (
                    <div key={i} className="vessel-suggestions-modal-i74" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                      <span className="vessel-suggestions-modal-i75">{p.icon}</span>
                      <span className="vessel-suggestions-modal-i76" style={{ color: '#64748b' }}>{p.label}:</span>
                      <span className="vessel-suggestions-modal-i77" style={{ color: '#e2e8f0' }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <button id="vsm-done-btn" className="vsm-btn" onClick={close} style={{ padding: '12px 32px', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700 }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
