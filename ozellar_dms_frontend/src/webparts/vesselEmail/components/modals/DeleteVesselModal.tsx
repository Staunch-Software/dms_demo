import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { Icon } from '@fluentui/react/lib/Icon';
import { isMobileWidth } from '../responsive';

/** A single dialog supports both one-vessel and bulk temporary deletion. */
export function renderDeleteModal(host: VesselEmail): React.ReactElement {
  const { deleteVesselIds, deleteVesselProgress, vessels, modalBusy, modalMsg, modalError, deleteAutoCloseSeconds, deleteVesselReason } = host.state;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const selected = vessels.filter(v => deleteVesselIds.has(v.id));
  const selectedCount = selected.length;
  const isSuccess = !!modalMsg && !modalBusy && !modalError;
  const progressEntries = Object.values(deleteVesselProgress || {});

  const getStatusVisual = (status?: 'waiting' | 'deleting' | 'success' | 'pending' | 'failed'): { icon: React.ReactNode; label: string; color: string } => {
    switch (status) {
      case 'success': return { icon: <Icon iconName="CheckMark" aria-hidden="true" className="delete-vessel-modal-i1" />, label: 'Deleted', color: '#15803d' };
      case 'deleting': return { icon: '…', label: 'Deleting', color: '#0284c7' };
      case 'pending': return { icon: <Icon iconName="Sync" aria-hidden="true" className="delete-vessel-modal-i1" />, label: 'Pending approval', color: '#b45309' };
      case 'failed': return { icon: <Icon iconName="ErrorBadge" aria-hidden="true" className="delete-vessel-modal-i1" />, label: 'Failed', color: '#b91c1c' };
      default: return { icon: <Icon iconName="CircleRing" aria-hidden="true" className="delete-vessel-modal-i1" />, label: 'Waiting', color: '#64748b' };
    }
  };

  return (
    <div className="delete-vessel-modal-i2" style={{ position: 'fixed', background: 'rgba(0,0,0,0.45)', padding: isMobile ? 10 : 20 }} onClick={host._closeModal}>
      <div className="delete-vessel-modal-i3" style={{ background: '#fff', borderRadius: 10, padding: isMobile ? '16px' : '24px 28px', width: isMobile ? '95vw' : 520 }} onClick={e => e.stopPropagation()}>
        {isSuccess ? (
          <div className="delete-vessel-modal-i4">
            <div className="delete-vessel-modal-i5"><Icon iconName="CheckMark" aria-hidden="true" className="delete-vessel-modal-i6" /></div>
            <div className="delete-vessel-modal-i7">{selectedCount > 1 ? 'Vessels Deleted Successfully' : 'Vessel Deleted Successfully'}</div>
            <p className="delete-vessel-modal-i8" style={{ color: '#475569' }}>{modalMsg}</p>
            {progressEntries.length > 0 && (
              <div className="delete-vessel-modal-i9" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                {progressEntries.filter(p => p.status === 'success').map((p, idx) => (
                  <div key={`${p.name}_${idx}`} className="delete-vessel-modal-i10" style={{ borderBottom: idx === progressEntries.filter(x => x.status === 'success').length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                    <span className="delete-vessel-modal-i11" style={{ color: '#0f172a' }}>{p.name}</span>
                    <span className="delete-vessel-modal-i12"><Icon iconName="CheckMark" aria-hidden="true" className="delete-vessel-modal-i1" /> Deleted</span>
                  </div>
                ))}
              </div>
            )}
            {typeof deleteAutoCloseSeconds === 'number' && (
              <div className="delete-vessel-modal-i13">
                Auto-closing in {deleteAutoCloseSeconds}s...
              </div>
            )}
            <button
              onClick={host._closeModal}
              className="delete-vessel-modal-i14" style={{ borderRadius: 8 }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
        <div className="delete-vessel-modal-i15">Delete vessel{selectedCount > 1 ? 's' : ''}</div>
        <p className="delete-vessel-modal-i16" style={{ color: '#475569' }}>
          This is temporary: the vessel folder and its contents will move to the Recycle Bin and can be restored.
        </p>
        {selectedCount > 0 ? (
          <div className="delete-vessel-modal-i17" style={{ background: '#fff1f2', borderRadius: 8 }}>
            <div className="delete-vessel-modal-i18">{selectedCount} vessel{selectedCount === 1 ? '' : 's'} selected for deletion</div>
            <div className="delete-vessel-modal-i19">
              {selected.map(v => (
                <div
                  key={v.id}
                  className="delete-vessel-modal-i20" style={{ background: deleteVesselProgress?.[v.id]?.status === 'success' ? '#ecfdf5' : '#fff', border: deleteVesselProgress?.[v.id]?.status === 'success' ? '1px solid #86efac' : '1px solid #fecdd3', borderRadius: 8 }}
                >
                  <div>
                    <div className="delete-vessel-modal-i21">{v.name}</div>
                    <div className="delete-vessel-modal-i22">{v.vessel_type || 'Vessel'}{v.imo ? ` | IMO ${v.imo}` : ''}</div>
                  </div>
                  <div className="delete-vessel-modal-i23" style={{ minWidth: 110 }}>
                    {(() => {
                      const info = getStatusVisual(deleteVesselProgress?.[v.id]?.status);
                      return <span className="delete-vessel-modal-i24" style={{ color: info.color }}>{info.icon} {info.label}</span>;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="delete-vessel-modal-i25" style={{ color: '#64748b' }}>No vessel selected.</div>
        )}
        <label className="delete-vessel-modal-i26" style={{ color: '#334155' }}>
          Reason for deletion (optional)
        </label>
        <textarea
          value={deleteVesselReason}
          onChange={e => host.setState({ deleteVesselReason: e.target.value })}
          disabled={modalBusy}
          placeholder="e.g. Duplicate vessel entry, decommissioned, created in error..."
          rows={2}
          className="delete-vessel-modal-i27" style={{ width: '100%', borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'inherit' }}
        />
        {modalMsg && <div className="delete-vessel-modal-i28" style={{ background: '#dff6dd', color: '#107c10', borderRadius: 6 }}>{modalMsg}</div>}
        {modalError && <div className="delete-vessel-modal-i28" style={{ background: '#fde7e9', color: '#a4262c', borderRadius: 6 }}>{modalError}</div>}
        <div className="delete-vessel-modal-i29" style={{ flexDirection: isMobile ? 'column' : 'row' }}>
          <button className="delete-vessel-modal-i30" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, width: isMobile ? '100%' : 'auto' }} onClick={host._closeModal} disabled={modalBusy}>Cancel</button>
          <button className="delete-vessel-modal-i31" style={{ background: '#ef4444', color: '#fff', borderRadius: 6, width: isMobile ? '100%' : 'auto', cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', opacity: selectedCount > 0 ? 1 : 0.55 }} onClick={host._submitDelete} disabled={modalBusy || selectedCount === 0}>
            {modalBusy ? 'Moving to Recycle Bin...' : 'Delete and Move to Recycle Bin'}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
