import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type VesselEmail from '../VesselEmail';
import { isMobileWidth } from '../responsive';
import { Icon } from '@fluentui/react/lib/Icon';

/** Opened from the Documents module's "New Folder" toolbar button (top,
 *  next to Archive). `folderRef` is whatever the backend's
 *  `_resolve_drive_folder_id` accepts: 'root', a Graph item id, or a
 *  slash/" > "-delimited path — the same shape `displayPath` shows the
 *  user, so leaving the path field untouched reuses it verbatim. */
export type CreateFolderDialogState = {
  siteId: string;
  driveId: string;
  folderRef: string;
  displayPath: string;
  vesselName: string;
};

export function renderCreateFolderModal(host: VesselEmail): React.ReactElement | null {
  const dialog = host.state.createFolderDialog;
  if (!dialog) return null;
  return <CreateFolderDialog key={`${dialog.siteId}::${dialog.driveId}::${dialog.folderRef}`} host={host} dialog={dialog} />;
}

function CreateFolderDialog({ host, dialog }: { host: VesselEmail; dialog: CreateFolderDialogState }): React.ReactElement {
  const { siteId, driveId, folderRef, displayPath } = dialog;
  const isMobile = isMobileWidth(host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200));

  const [path, setPath] = React.useState(displayPath || '');
  const [name, setName] = React.useState('');
  const [asVessel, setAsVessel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultMsg, setResultMsg] = React.useState<string | null>(null);

  const close = (): void => {
    if (busy) return;
    host.setState({ createFolderDialog: null });
  };

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Enter a folder name.'); return; }

    if (asVessel) {
      // The full vessel record (IMO, hull number, site/parent-folder picker,
      // etc.) already has a dedicated, validated flow — reopen it instead of
      // re-implementing vessel creation here, just pre-filling the name the
      // user already typed.
      host.setState({ createFolderDialog: null });
      host._openCreate(trimmedName);
      return;
    }

    setBusy(true);
    setError(null);
    const trimmedPath = path.trim();
    // Only override the location this popup was opened at if the user
    // actually edited the path field.
    const targetRef = trimmedPath && trimmedPath !== (displayPath || '').trim()
      ? trimmedPath
      : folderRef;
    const result = await host._createFolderAtPath(siteId, driveId, targetRef, trimmedName);
    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Could not create the folder.');
      return;
    }
    setResultMsg(`"${trimmedName}" created successfully.`);
    setTimeout(() => host.setState({ createFolderDialog: null }), 1200);
  };

  const themeMode = host.state.themeMode === 'night' ? 'night' : 'light';

  // Rendered via a portal onto <body> for the same reason ArchiveSelectionModal
  // is — the SharePoint workbench's ancestor `transform` otherwise clips a
  // `position: fixed` dialog to the page canvas instead of the real viewport.
  return ReactDOM.createPortal(
    <div data-vessel-theme={themeMode} className="create-folder-modal-i1" style={{ position: 'fixed', background: 'rgba(0,0,0,0.45)', zIndex: 100001, padding: isMobile ? 10 : 20 }} onClick={close}>
      <div
        className="create-folder-modal-i2" style={{ background: 'var(--vdms-surface)', padding: isMobile ? '16px 14px' : '24px 28px', width: isMobile ? '95vw' : 480, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        {resultMsg ? (
          <div className="create-folder-modal-i3">
            <div className="create-folder-modal-i4"><Icon iconName="CheckMark" aria-hidden="true" className="create-folder-modal-i5" /></div>
            <div className="create-folder-modal-i6">Folder created</div>
            <p className="create-folder-modal-i7">{resultMsg}</p>
          </div>
        ) : (
          <>
            <div className="create-folder-modal-i8">
              <div className="create-folder-modal-i9" style={{ borderRadius: 10, background: '#e0f2fe' }}><Icon iconName="FabricFolder" aria-hidden="true" className="create-folder-modal-i10" /></div>
              <div className="create-folder-modal-i11" style={{ minWidth: 0 }}>
                <div className="create-folder-modal-i12">New folder</div>
                <div className="create-folder-modal-i13">
                  Creates a folder in SharePoint at the path below
                </div>
              </div>
            </div>

            <label className="create-folder-modal-i14">
              Folder name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2026 Survey Reports"
              disabled={busy}
              autoFocus
              className="create-folder-modal-i15" style={{ width: '100%', borderRadius: 8 }}
            />

            {!asVessel && (
              <>
                <label className="create-folder-modal-i14">
                  Path to create it in
                </label>
                <input
                  type="text"
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  disabled={busy}
                  placeholder="Documents"
                  className="create-folder-modal-i16" style={{ width: '100%', borderRadius: 8, fontFamily: 'monospace' }}
                />
                <div className="create-folder-modal-i17">
                  Defaults to where you opened this from — edit it to create the folder somewhere else instead.
                </div>
              </>
            )}

            <label className="create-folder-modal-i18" style={{ borderRadius: 8, background: asVessel ? '#eff6ff' : 'var(--vdms-surface-alt)', border: `1px solid ${asVessel ? '#bfdbfe' : 'var(--vdms-border)'}`, cursor: busy ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={asVessel}
                disabled={busy}
                onChange={e => setAsVessel(e.target.checked)}
                className="create-folder-modal-i19" style={{ width: 15 }}
              />
              <span className="create-folder-modal-i20">
<Icon iconName="Ferry" aria-hidden="true" className="create-folder-modal-i21" /> This is a new vessel — open the Add Vessel form instead
              </span>
            </label>

            {error && (
              <div className="create-folder-modal-i22" style={{ background: '#fef2f2', borderRadius: 8, color: '#dc2626' }}>
<Icon iconName="Warning" aria-hidden="true" className="create-folder-modal-i23" /> {error}
              </div>
            )}

            <div className="create-folder-modal-i24" style={{ flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={close}
                disabled={busy}
                className="create-folder-modal-i25" style={{ width: isMobile ? '100%' : 'auto', borderRadius: 8, background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy || !name.trim()}
                className="create-folder-modal-i26" style={{ width: isMobile ? '100%' : 'auto', borderRadius: 8, cursor: busy || !name.trim() ? 'not-allowed' : 'pointer', background: busy || !name.trim() ? '#93c5fd' : '#2563eb' }}
              >
                {busy ? 'Creating…' : asVessel ? 'Continue to Add Vessel' : 'Create folder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
