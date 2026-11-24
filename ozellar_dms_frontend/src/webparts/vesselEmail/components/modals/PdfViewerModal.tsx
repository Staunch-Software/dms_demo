import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn } from '../dmsDesignSystem';

export interface IPdfViewerModalProps {
  host: VesselEmail;
  isOpen: boolean;
  fileId?: string | null;
  fileName: string;
  folderPath?: string;
  vesselName?: string;
  sharepointWebUrl?: string;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<IPdfViewerModalProps> = ({
  host,
  isOpen,
  fileId,
  fileName,
  folderPath,
  vesselName,
  sharepointWebUrl,
  onClose,
}) => {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const cleanName = fileName || 'Document';
  const effectiveFileId = fileId || fileName;
  const lowerName = cleanName.toLowerCase();
  const isPdf = lowerName.endsWith('.pdf');
  const isImage = lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp');

  // Load file content as blob
  React.useEffect(() => {
    if (!isOpen || !effectiveFileId) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const base = host._base();
    const headers = host._headers();

    fetch(`${base}/api/files/${encodeURIComponent(effectiveFileId)}/content`, {
      headers,
    })
      .then(async res => {
        if (!res.ok) {
          throw new Error(`Failed to load file (HTTP ${res.status})`);
        }
        return res.blob();
      })
      .then(blob => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setLoading(false);
        setError(err?.message || 'Failed to preview document.');
      });

    return () => {
      active = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, effectiveFileId]);

  // Close on Escape key
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="dms-pdf-modal-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        background: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pdf-viewer-modal-i1" style={{ maxWidth: 1400 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top Bar ── */}
        <div
          className="pdf-viewer-modal-i2" style={{ background: '#0f172a', color: '#f8fafc' }}
        >
          {/* File Title & Tags */}
          <div className="pdf-viewer-modal-i3" style={{ minWidth: 0 }}>
            <div
              className="pdf-viewer-modal-i4" style={{ borderRadius: 8, background: isPdf ? 'rgba(239, 68, 68, 0.18)' : 'rgba(14, 116, 144, 0.25)', color: isPdf ? '#ef4444' : clay.accent }}
            >
              <Icon iconName={isPdf ? 'PDF' : isImage ? 'FileImage' : 'Page'} className="pdf-viewer-modal-i5" />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                className="pdf-viewer-modal-i6"
                title={cleanName}
              >
                {cleanName}
              </div>
              <div className="pdf-viewer-modal-i7" style={{ color: '#94a3b8' }}>
                {vesselName && (
                  <span className="pdf-viewer-modal-i8">
                    <Icon iconName="Ferry" className="pdf-viewer-modal-i9" /> {vesselName}
                  </span>
                )}
                {folderPath && (
                  <span className="pdf-viewer-modal-i10">
                    📁 {folderPath}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="pdf-viewer-modal-i11">
            {/* Direct Download Button */}
            {blobUrl && (
              <a
                href={blobUrl}
                download={cleanName}
                style={{
                  ...dmsBtn('secondary'),
                  padding: '5px 10px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.2)',
                  textDecoration: 'none',
                }}
                title="Download a local copy"
              >
                <Icon iconName="Download" className="pdf-viewer-modal-i12" />
                <span>Download</span>
              </a>
            )}

            {/* Open in SharePoint */}
            {sharepointWebUrl && (
              <button
                type="button"
                onClick={() => window.open(sharepointWebUrl, '_blank', 'noopener')}
                style={{
                  ...dmsBtn('secondary'),
                  padding: '5px 10px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
                title="Open in SharePoint Online"
              >
                <Icon iconName="SharepointLogo" className="pdf-viewer-modal-i12" />
                <span>SharePoint</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="pdf-viewer-modal-i13" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', borderRadius: 8 }}
              title="Close Preview (Esc)"
            >
              <Icon iconName="Cancel" className="pdf-viewer-modal-i14" />
            </button>
          </div>
        </div>

        {/* ── Content View Area ── */}
        <div className="pdf-viewer-modal-i15" style={{ background: '#1e293b' }}>
          {/* Main Document Viewer */}
          <div className="pdf-viewer-modal-i16" style={{ minWidth: 0, width: '100%' }}>
            {loading && (
              <div className="pdf-viewer-modal-i17" style={{ color: '#94a3b8' }}>
                <Icon iconName="Sync" className="pdf-viewer-modal-i18" />
                <span className="pdf-viewer-modal-i19">Loading document preview...</span>
              </div>
            )}

            {error && !loading && (
              <div className="pdf-viewer-modal-i20">
                <Icon iconName="ErrorBadge" className="pdf-viewer-modal-i21" />
                <div className="pdf-viewer-modal-i22">Could not load preview</div>
                <p className="pdf-viewer-modal-i23" style={{ color: '#94a3b8' }}>{error}</p>
                {sharepointWebUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(sharepointWebUrl, '_blank')}
                    style={{ ...dmsBtn('primary'), padding: '8px 16px', fontSize: 13 }}
                  >
                    Open in SharePoint Online
                  </button>
                )}
              </div>
            )}

            {!loading && !error && blobUrl && (
              <>
                {isPdf ? (
                  <iframe
                    src={`${blobUrl}#toolbar=1&navpanes=0`}
                    title={cleanName}
                    className="pdf-viewer-modal-i24" style={{ width: '100%', background: '#525659' }}
                  />
                ) : isImage ? (
                  <div className="pdf-viewer-modal-i25" style={{ width: '100%' }}>
                    <img
                      src={blobUrl}
                      alt={cleanName}
                      className="pdf-viewer-modal-i26" style={{ maxWidth: '100%', borderRadius: 6 }}
                    />
                  </div>
                ) : (
                  <div className="pdf-viewer-modal-i27">
                    <Icon iconName="Document" className="pdf-viewer-modal-i28" style={{ color: clay.accent }} />
                    <div className="pdf-viewer-modal-i29">{cleanName}</div>
                    <p className="pdf-viewer-modal-i30" style={{ color: '#94a3b8' }}>
                      In-app preview is optimized for PDF and image documents.
                    </p>
                    <a
                      href={blobUrl}
                      download={cleanName}
                      style={{ ...dmsBtn('primary'), padding: '8px 18px', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Icon iconName="Download" className="pdf-viewer-modal-i31" />
                      <span>Download File</span>
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default PdfViewerModal;
