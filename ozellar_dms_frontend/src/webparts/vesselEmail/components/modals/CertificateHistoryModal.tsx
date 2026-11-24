import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { dmsBtn, DMS_FONT_DISPLAY } from '../dmsDesignSystem';

export interface CertificateHistoryModalProps {
  host: VesselEmail;
  certificate: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CertificateHistoryModal({
  host,
  certificate,
  isOpen,
  onClose,
}: CertificateHistoryModalProps): React.ReactElement | null {
  const [history, setHistory] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!certificate || !isOpen) return;
    setLoading(true);
    setError(null);

    fetch(`${host._base()}/api/certificates/${certificate.id}/history`, {
      headers: host._headers(),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setHistory(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        setError(err?.message || 'Failed to load certificate history');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [certificate, isOpen, host]);

  if (!isOpen || !certificate) return null;

  return ReactDOM.createPortal(
    <div
      className="certificate-history-modal-i1" style={{ position: 'fixed', zIndex: 100005, background: 'rgba(5, 15, 25, 0.65)' }}
    >
      <div
        className="certificate-history-modal-i2" style={{ width: '100%', background: 'var(--vdms-surface)' }}
      >
        {/* Header */}
        <div
          className="certificate-history-modal-i3"
        >
          <div>
            <h3
              className="certificate-history-modal-i4" style={{ fontFamily: DMS_FONT_DISPLAY }}
            >
              Certificate Version History
            </h3>
            <div className="certificate-history-modal-i5">
              {certificate.certificate_name} • <strong>{certificate.vessel_name}</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="certificate-history-modal-i6"
          >
            <Icon iconName="Cancel" />
          </button>
        </div>

        {/* Current Active Record Badge */}
        <div
          className="certificate-history-modal-i7" style={{ background: clay.accentSoft }}
        >
          <div>
            <div className="certificate-history-modal-i8" style={{ color: clay.accent }}>
              CURRENT ACTIVE VERSION
            </div>
            <div className="certificate-history-modal-i9">
              {certificate.certificate_number || 'No Cert #'}{' '}
              <span className="certificate-history-modal-i10">
                ({certificate.issuing_authority || 'N/A'})
              </span>
            </div>
            <div className="certificate-history-modal-i5">
              Issued: {certificate.issue_date || 'N/A'} • Expiry:{' '}
              {certificate.has_no_expiry ? 'Permanent' : (certificate.expiry_date || 'N/A')}
            </div>
          </div>
          {certificate.sharepoint_file_url && (
            <a
              href={certificate.sharepoint_file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...dmsBtn('primary'),
                height: 32,
                fontSize: 12,
                textDecoration: 'none',
                gap: 6,
              }}
            >
              <Icon iconName="PDF" className="certificate-history-modal-i11" /> View Active PDF
            </a>
          )}
        </div>

        {/* History List */}
        <div className="certificate-history-modal-i12">
          {loading ? (
            <div className="certificate-history-modal-i13">
              Loading audit history...
            </div>
          ) : error ? (
            <div className="certificate-history-modal-i14" style={{ borderRadius: 8, background: clay.pillDangerBg, color: clay.pillDangerText }}>
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="certificate-history-modal-i13">
              No previous superseded versions found. This is the initial version of this certificate.
            </div>
          ) : (
            <div className="certificate-history-modal-i15">
              <div className="certificate-history-modal-i16">
                SUPERSEDED VERSIONS ({history.length})
              </div>
              {history.map((h, idx) => (
                <div
                  key={h.id || idx}
                  className="certificate-history-modal-i17" style={{ borderRadius: 10 }}
                >
                  <div className="certificate-history-modal-i18">
                    <div>
                      <div className="certificate-history-modal-i19">
                        {h.certificate_number || 'Certificate (Superseded)'}
                      </div>
                      <div className="certificate-history-modal-i20">
                        Authority: {h.issuing_authority || 'N/A'} • Issued: {h.issue_date || 'N/A'} • Expired:{' '}
                        {h.expiry_date || 'N/A'}
                      </div>
                    </div>
                    {h.sharepoint_file_url && (
                      <a
                        href={h.sharepoint_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...dmsBtn('secondary'),
                          height: 28,
                          fontSize: 11,
                          textDecoration: 'none',
                          gap: 5,
                        }}
                      >
                        <Icon iconName="PDF" className="certificate-history-modal-i21" /> Historical PDF
                      </a>
                    )}
                  </div>
                  {h.notes && (
                    <div className="certificate-history-modal-i22" style={{ color: 'var(--vdms-text-muted)', background: 'var(--vdms-surface)', borderRadius: 6 }}>
                      <em>Note: {h.notes}</em>
                    </div>
                  )}
                  <div className="certificate-history-modal-i23">
                    Superseded on: {h.renewed_at ? new Date(h.renewed_at).toLocaleString() : 'N/A'}{' '}
                    {h.renewed_by_email ? `by ${h.renewed_by_email}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="certificate-history-modal-i24">
          <button
            type="button"
            onClick={onClose}
            style={{ ...dmsBtn('secondary'), height: 34, padding: '0 20px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
