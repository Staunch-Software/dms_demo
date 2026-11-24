import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { DMS_FONT_DISPLAY } from '../dmsDesignSystem';

export interface ApproverPerson {
  email: string;
  display_name: string;
  is_fallback_admin?: boolean;
}

export interface ApprovalRoutingInfo {
  email_automation_enabled: boolean;
  dispatched: boolean;
  vessel_name: string;
  certificate_name: string;
  certificate_number?: string | null;
  expiry_date?: string | null;
  has_no_expiry?: boolean;
  status?: string;
  approvers: ApproverPerson[];
  approver_count: number;
  ai_banto_recipient?: string;
}

export interface BulkApprovalSummaryInfo {
  total_dispatched: number;
  certificates: ApprovalRoutingInfo[];
  ai_banto_recipient?: string;
}

export interface CertificateApprovalSentModalProps {
  isOpen: boolean;
  onClose: () => void;
  routingInfo?: ApprovalRoutingInfo | null;
  bulkSummary?: BulkApprovalSummaryInfo | null;
}

export function CertificateApprovalSentModal({
  isOpen,
  onClose,
  routingInfo,
  bulkSummary,
}: CertificateApprovalSentModalProps): React.ReactElement | null {
  if (!isOpen) return null;

  const isBulk = Boolean(bulkSummary && bulkSummary.total_dispatched > 0);
  const items = isBulk ? bulkSummary?.certificates || [] : routingInfo ? [routingInfo] : [];
  const primaryItem = items[0] || null;
  const aiBantoTarget =
    bulkSummary?.ai_banto_recipient ||
    primaryItem?.ai_banto_recipient ||
    'mail+ozellar@mail.ai-banto.com';

  const allApprovers: ApproverPerson[] = React.useMemo(() => {
    const map = new Map<string, ApproverPerson>();
    items.forEach(it => {
      (it.approvers || []).forEach(a => {
        const key = (a.email || '').toLowerCase().trim();
        if (key && !map.has(key)) {
          map.set(key, a);
        }
      });
    });
    return Array.from(map.values());
  }, [items]);

  return ReactDOM.createPortal(
    <div
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="certificate-approval-sent-modal-j1" style={{ position: 'fixed', zIndex: 100010, background: 'rgba(5, 15, 25, 0.72)' }}
    >
      <div
        
        className="vdms-approval-sent-modal certificate-approval-sent-modal-j2" style={{ width: '100%', maxWidth: isBulk ? 680 : 560, border: '1px solid var(--vdms-border, #e2e8f0)', fontFamily: DMS_FONT_DISPLAY }}
      >
        {/* Top Accent Gradient Bar */}
        <div
          className="certificate-approval-sent-modal-j3"
        />

        {/* Modal Header */}
        <div className="certificate-approval-sent-modal-j4">
          <div
            className="certificate-approval-sent-modal-j5" style={{ background: '#dcfce7', color: '#16a34a' }}
          >
            <Icon iconName="MailCheck" />
          </div>
          <div className="certificate-approval-sent-modal-j6" style={{ minWidth: 0 }}>
            <div className="certificate-approval-sent-modal-j7">
              <h2
                className="certificate-approval-sent-modal-j8" style={{ letterSpacing: '-0.02em' }}
              >
                {isBulk
                  ? `Approval Requests Dispatched (${items.length} Certificate${items.length === 1 ? '' : 's'})`
                  : 'Certificate Uploaded & Approval Email Sent'}
              </h2>
            </div>
            <p
              className="certificate-approval-sent-modal-j9"
            >
              This certificate type requires 1st-level approval. An email notification with 1-click action buttons has been dispatched.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="certificate-approval-sent-modal-j10" style={{ borderRadius: 6 }}
          >
            <Icon iconName="Cancel" className="certificate-approval-sent-modal-j11" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="certificate-approval-sent-modal-j12">
          {/* Certificate Metadata Card (Single Mode) */}
          {!isBulk && primaryItem && (
            <div
              className="certificate-approval-sent-modal-j13" style={{ border: '1px solid var(--vdms-border, #e2e8f0)', borderRadius: 12 }}
            >
              <div>
                <div className="certificate-approval-sent-modal-j14">
                  Vessel
                </div>
                <div className="certificate-approval-sent-modal-j15">
                  <Icon iconName="Nav2DMapView" className="certificate-approval-sent-modal-j16" style={{ color: '#0284c7' }} />
                  {primaryItem.vessel_name}
                </div>
              </div>

              <div>
                <div className="certificate-approval-sent-modal-j14">
                  Certificate Type
                </div>
                <div className="certificate-approval-sent-modal-j17">
                  {primaryItem.certificate_name}
                </div>
              </div>

              {primaryItem.certificate_number && (
                <div>
                  <div className="certificate-approval-sent-modal-j14">
                    Certificate Number
                  </div>
                  <div className="certificate-approval-sent-modal-j18" style={{ fontFamily: 'monospace' }}>
                    {primaryItem.certificate_number}
                  </div>
                </div>
              )}

              <div>
                <div className="certificate-approval-sent-modal-j14">
                  Current Status
                </div>
                <div className="certificate-approval-sent-modal-j19">
                  <span
                    className="certificate-approval-sent-modal-j20" style={{ borderRadius: 6, background: '#fef3c7', color: '#92400e' }}
                  >
                    <Icon iconName="Clock" className="certificate-approval-sent-modal-j21" />
                    Pending 1st-Level Approval
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Certificate Metadata Card (Bulk Mode) */}
          {isBulk && (
            <div
              className="certificate-approval-sent-modal-j22" style={{ border: '1px solid var(--vdms-border, #e2e8f0)', borderRadius: 12 }}
            >
              <div className="certificate-approval-sent-modal-j23">
                Certificates Requiring Approval ({items.length})
              </div>
              <div className="certificate-approval-sent-modal-j24">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="certificate-approval-sent-modal-j25" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6 }}
                  >
                    <div className="certificate-approval-sent-modal-j26">
                      <span className="certificate-approval-sent-modal-j27" style={{ color: '#0284c7' }}>{it.vessel_name}</span>
                      <span style={{ color: '#94a3b8' }}>›</span>
                      <span className="certificate-approval-sent-modal-j28">{it.certificate_name}</span>
                      {it.certificate_number && (
                        <span className="certificate-approval-sent-modal-j29" style={{ fontFamily: 'monospace', color: '#64748b' }}>
                          ({it.certificate_number})
                        </span>
                      )}
                    </div>
                    <span
                      className="certificate-approval-sent-modal-j30" style={{ background: '#fef3c7', color: '#92400e' }}
                    >
                      Pending Approval
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Respective Approver List */}
          <div className="certificate-approval-sent-modal-j31">
            <div className="certificate-approval-sent-modal-j32">
              <span className="certificate-approval-sent-modal-j33">
                <Icon iconName="Send" className="certificate-approval-sent-modal-j34" />
                Approval Email Sent To Respective Person:
              </span>
              <span
                className="certificate-approval-sent-modal-j35" style={{ borderRadius: 12, background: allApprovers.length > 0 ? '#dcfce7' : '#fee2e2', color: allApprovers.length > 0 ? '#15803d' : '#b91c1c' }}
              >
                {allApprovers.length} Recipient{allApprovers.length === 1 ? '' : 's'} Notified
              </span>
            </div>

            {allApprovers.length > 0 ? (
              <div className="certificate-approval-sent-modal-j36">
                {allApprovers.map((appr, idx) => {
                  const initials = (appr.display_name || appr.email || 'A')
                    .split(' ')
                    .map(p => p[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'A';
                  return (
                    <div
                      key={idx}
                      className="certificate-approval-sent-modal-j37" style={{ borderRadius: 10, border: '1px solid var(--vdms-border, #e2e8f0)' }}
                    >
                      <div className="certificate-approval-sent-modal-j38">
                        <div
                          className="certificate-approval-sent-modal-j39" style={{ background: '#10b981', color: '#ffffff' }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="certificate-approval-sent-modal-j40">
                            {appr.display_name}
                          </div>
                          <div className="certificate-approval-sent-modal-j41">
                            {appr.email}
                          </div>
                        </div>
                      </div>
                      <span
                        className="certificate-approval-sent-modal-j42" style={{ borderRadius: 6, background: appr.is_fallback_admin ? '#e0e7ff' : '#dcfce7', color: appr.is_fallback_admin ? '#3730a3' : '#166534', border: `1px solid ${appr.is_fallback_admin ? '#c7d2fe' : '#bbf7d0'}` }}
                      >
                        {appr.is_fallback_admin ? 'Admin (Fallback)' : 'Certificate Approver'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="certificate-approval-sent-modal-j43" style={{ borderRadius: 10, background: '#fffbeb', color: '#92400e' }}
              >
                <strong>Notice:</strong> No active user currently has the &quot;Certificate Approver&quot; role enabled in User Management.
                An administrator can configure approvers in User Management or approve this certificate from DMS.
              </div>
            )}
          </div>

          {/* Forwarding Pipeline Visual Flow */}
          <div
            className="certificate-approval-sent-modal-j44" style={{ borderRadius: 12, background: '#f0fdf4' }}
          >
            <div className="certificate-approval-sent-modal-j45">
              <Icon iconName="Forward" className="certificate-approval-sent-modal-j16" />
              Automated Forwarding Pipeline
            </div>

            <div className="certificate-approval-sent-modal-j46">
              <span className="certificate-approval-sent-modal-j47" style={{ borderRadius: 6, background: '#dcfce7', color: '#15803d' }}>
                ✓ Uploaded to SharePoint
              </span>
              <span className="certificate-approval-sent-modal-j48">➔</span>
              <span className="certificate-approval-sent-modal-j49" style={{ borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                ⏳ 1st-Level Approval (In Progress)
              </span>
              <span className="certificate-approval-sent-modal-j48">➔</span>
              <span className="certificate-approval-sent-modal-j50" style={{ borderRadius: 6, background: '#e0f2fe', color: '#0369a1' }}>
                🤖 AI Banto Forwarding
              </span>
            </div>

            <div className="certificate-approval-sent-modal-j51">
              The respective approver has received an email containing the attached certificate with 1-click <strong>✓ Approve</strong> and <strong>✗ Reject</strong> buttons.
              Upon their approval, the document will automatically be forwarded to <strong>{aiBantoTarget}</strong>.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="certificate-approval-sent-modal-j52" style={{ borderTop: '1px solid var(--vdms-border, #e2e8f0)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="certificate-approval-sent-modal-j53" style={{ background: '#16a34a', color: '#ffffff', borderRadius: 8, transition: 'background 0.15s ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#15803d')}
            onMouseLeave={e => (e.currentTarget.style.background = '#16a34a')}
          >
            <Icon iconName="CheckMark" className="certificate-approval-sent-modal-j16" />
            Got It, Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
