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
import { clay } from '../clayTheme';
import { DmsPageHeader, DMS_TABLE_CARD, dmsBtn, dmsTone } from '../dmsDesignSystem';

// Map action_type values to human-readable labels and badge colours — tone
// keys resolve through the shared `dmsTone()` palette so these stay in sync
// with the rest of the app's semantic colors.
const ACTION_LABELS: Record<string, { label: string; tone: 'accent' | 'warning' | 'danger' | 'success' | 'neutral' }> = {
  upload:          { label: 'Upload',         tone: 'accent' },
  delete_file:     { label: 'Delete File',    tone: 'warning' },
  delete_folder:   { label: 'Delete Folder',  tone: 'warning' },
  delete_vessel:   { label: 'Delete Vessel',  tone: 'danger' },
  create_vessel:   { label: 'New Vessel',     tone: 'success' },
  create_folder:   { label: 'New Folder',     tone: 'accent' },
  update_vessel:   { label: 'Edit Vessel',    tone: 'accent' },
  rename_folder:   { label: 'Rename Folder',  tone: 'accent' },
  move_file:       { label: 'Move File',      tone: 'success' },
};

function actionBadge(actionType?: string): React.ReactElement | null {
  if (!actionType) return null;
  const meta = ACTION_LABELS[actionType] || { label: actionType.replace(/_/g, ' '), tone: 'neutral' as const };
  const { bg, fg } = dmsTone(meta.tone);
  const cfg = { label: meta.label, color: fg, bg };
  return (
    <span className="approvals-page-i1" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// Formats a millisecond duration as a short "Xm"/"Xh"/"Xd" label for the SLA badges below.
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// Per-row aging: how long a Pending item has been waiting, or how long a
// decided item took to be decided. Both read straight off the raw ISO
// timestamps the backend already stores on every approval_requests row —
// no new data, just arithmetic that was never done before.
function slaBadge(app: ApprovalItem): React.ReactElement | null {
  if (!app.uploadedAt) return null;
  const uploaded = new Date(app.uploadedAt).getTime();
  if (Number.isNaN(uploaded)) return null;
  if (app.status === 'Pending') {
    const waitingMs = Date.now() - uploaded;
    const overdue = waitingMs > 1000 * 60 * 60 * 24 * 3; // 3+ days waiting
    const { bg, fg } = dmsTone(overdue ? 'danger' : 'neutral');
    return (
      <span className="approvals-page-i35" style={{ background: bg, color: fg }} title="Time waiting for a decision">
        Waiting {formatDuration(waitingMs)}
      </span>
    );
  }
  if (app.decidedAt) {
    const decided = new Date(app.decidedAt).getTime();
    if (Number.isNaN(decided)) return null;
    const { bg, fg } = dmsTone('neutral');
    return (
      <span className="approvals-page-i35" style={{ background: bg, color: fg }} title="Time from request to decision">
        Took {formatDuration(decided - uploaded)}
      </span>
    );
  }
  return null;
}

// Header stat: average time-to-decision across the decided items currently
// in view (Approved/Rejected tabs only — Pending has no decidedAt yet).
function averageDecisionTime(items: ApprovalItem[]): string | null {
  const durations = items
    .filter(a => a.uploadedAt && a.decidedAt)
    .map(a => new Date(a.decidedAt as string).getTime() - new Date(a.uploadedAt as string).getTime())
    .filter(ms => Number.isFinite(ms) && ms >= 0);
  if (durations.length === 0) return null;
  const avg = durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
  return formatDuration(avg);
}

export function renderApprovalsPage(host: VesselEmail): React.ReactElement {
    const { approvalsList, approvalTab, panelLoading } = host.state;
    const filtered = approvalsList.filter(a => a.status === approvalTab);
    const avgDecision = approvalTab !== 'Pending' ? averageDecisionTime(filtered) : null;

    const pendingCount   = approvalsList.filter(a => a.status === 'Pending').length;
    const approvedCount  = approvalsList.filter(a => a.status === 'Approved').length;
    const rejectedCount  = approvalsList.filter(a => a.status === 'Rejected').length;

    const tabMeta: { key: 'Pending' | 'Approved' | 'Rejected'; count: number; color: string; bg: string }[] = [
      { key: 'Pending',  count: pendingCount,  color: dmsTone('warning').fg, bg: dmsTone('warning').bg },
      { key: 'Approved', count: approvedCount, color: dmsTone('success').fg, bg: dmsTone('success').bg },
      { key: 'Rejected', count: rejectedCount, color: dmsTone('danger').fg, bg: dmsTone('danger').bg },
    ];

    return (
      <div className="approvals-page-i2">
        <DmsPageHeader
          title="Approvals"
          subtitle={
            avgDecision
              ? `Review and take action on pending approvals. Average time to decide: ${avgDecision}.`
              : 'Review and take action on pending approvals.'
          }
        />

        {/* Tabs + Clear All button */}
        <div className="approvals-page-i3">
          <div className="approvals-page-i4">
          {tabMeta.map(({ key, count, color, bg }) => (
            <button
              key={key}
              onClick={() => host.setState({ approvalTab: key })}
              className="approvals-page-i5" style={{ borderBottom: approvalTab === key ? `2px solid ${color}` : '2px solid transparent', color: approvalTab === key ? color : 'var(--vdms-text-muted)', fontWeight: approvalTab === key ? 700 : 500, transition: 'all 0.15s' }}
            >
              {key}
              <span className="approvals-page-i6" style={{ minWidth: 20, background: approvalTab === key ? bg : 'var(--vdms-surface-alt)', color: approvalTab === key ? color : 'var(--vdms-text-faint)' }}>
                {count}
              </span>
            </button>
          ))}
          </div>
          {/* Clear All button — only for Approved / Rejected tabs with items */}
          {approvalTab !== 'Pending' && filtered.length > 0 && (
            <button
              onClick={async () => {
                if (!window.confirm(`Remove all ${filtered.length} ${approvalTab.toLowerCase()} entries? This cannot be undone.`)) return;
                const userEmail = host.props.userEmail || '';
                const adminParam = userEmail ? `?admin=${encodeURIComponent(userEmail)}` : '';
                try {
                  const res = await fetch(`${host._base()}/api/approvals?status=${approvalTab.toLowerCase()}${adminParam.replace('?', '&')}`, {
                    method: 'DELETE', headers: host._headers(),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  await host._loadApprovals();
                } catch (err) {
                  window.alert(`Could not clear ${approvalTab.toLowerCase()} entries: ${err instanceof Error ? err.message : 'request failed'}`);
                }
              }}
              style={{ ...dmsBtn('danger'), padding: '5px 12px', marginBottom: 4 }}
              title={`Remove all ${approvalTab.toLowerCase()} entries`}
            >
              <Icon iconName="Delete" aria-hidden="true" className="approvals-page-i7" /> Clear All {approvalTab}
            </button>
          )}
        </div>

        {/* Table */}
        {panelLoading ? (
          <div className="approvals-page-i8">
            <div className="approvals-page-i9"><Icon iconName="Sync" aria-hidden="true" className="approvals-page-i10" /></div>
            Loading approvals...
          </div>
        ) : filtered.length === 0 ? (
          <div className="approvals-page-i11" style={{ borderRadius: 12 }}>
            <div className="approvals-page-i12">
              {approvalTab === 'Pending' ? <Icon iconName="CheckMark" aria-hidden="true" className="approvals-page-i13" /> : approvalTab === 'Approved' ? <Icon iconName="Completed" aria-hidden="true" className="approvals-page-i13" /> : <Icon iconName="Blocked2" aria-hidden="true" className="approvals-page-i13" />}
            </div>
            <div className="approvals-page-i14">No {approvalTab.toLowerCase()} approvals</div>
            {approvalTab === 'Pending' && (
              <div className="approvals-page-i15">All caught up! No pending actions waiting for review.</div>
            )}
          </div>
        ) : (
        <div style={DMS_TABLE_CARD}>
          <table className="approvals-page-i16" style={{ width: '100%', minWidth: 700 }}>
            <thead>
              <tr className="approvals-page-i17">
                <th className="approvals-page-i18">Document / Action</th>
                <th className="approvals-page-i18">Vessel</th>
                <th className="approvals-page-i18">Requested By</th>
                <th className="approvals-page-i18">Requested On</th>
                <th className="approvals-page-i19">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app, idx) => (
                <tr
                  key={app.id}
                  className="approvals-page-i20" style={{ background: idx % 2 === 0 ? 'var(--vdms-surface)' : 'var(--vdms-surface-alt)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = clay.accentSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--vdms-surface)' : 'var(--vdms-surface-alt)')}
                >
                  <td className="approvals-page-i21" style={{ maxWidth: 260 }}>
                    <div className="approvals-page-i22">
                      <span className="approvals-page-i23" style={{ maxWidth: 200 }} title={app.documentName}>
                        {app.documentName}
                      </span>
                      {actionBadge(app.actionType)}
                    </div>
                  </td>
                  <td className="approvals-page-i24">
                    {app.vessel && app.vessel !== '—' ? (
                      <span className="approvals-page-i25" style={{ background: clay.accentSoft, color: clay.accent, borderRadius: 6 }}>
                        <Icon iconName="Ferry" aria-hidden="true" className="approvals-page-i7" /> {app.vessel}
                      </span>
                    ) : (
                      <span className="approvals-page-i26">—</span>
                    )}
                  </td>
                  <td className="approvals-page-i27" style={{ maxWidth: 200 }} title={app.requestedBy}>
                    {app.requestedBy}
                  </td>
                  <td className="approvals-page-i24" style={{ fontSize: 12 }}>
                    <div>{app.requestedOn}</div>
                    {slaBadge(app)}
                  </td>
                  <td className="approvals-page-i28">
                    {app.status === 'Pending' ? (
                      <div className="approvals-page-i29">
                        <button
                          onClick={async () => {
                            const userEmail = host.props.userEmail || '';
                            const adminParam = userEmail ? `?admin=${encodeURIComponent(userEmail)}` : '';
                            try {
                              const res = await fetch(`${host._base()}/api/approvals/${app.id}/approve${adminParam}`, { method: 'POST', headers: host._headers() });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            } catch (err) {
                              window.alert(`Could not approve this item: ${err instanceof Error ? err.message : 'request failed'}`);
                              return;
                            }
                            await host._loadApprovals();
                            host._filesLoadedForFolders.clear();
                            host._filesLoadedForVessels.clear();
                            host._loadData();
                            if (app.vessel && app.vessel !== '—') {
                              const vesselName = app.vessel;
                              setTimeout(() => {
                                host._filesLoadedForVessels.add(vesselName);
                                host._loadFilesForVessel(vesselName).catch(() => undefined);
                              }, 2000);
                            }
                          }}
                          className="approvals-page-i30" style={{ background: dmsTone('success').bg, color: dmsTone('success').fg, borderRadius: 6, transition: 'all 0.15s' }}
                          title="Approve"
                        >
                          <Icon iconName="CheckMark" aria-hidden="true" className="approvals-page-i31" />
                        </button>
                        <button
                          onClick={async () => {
                            const reason = window.prompt('Reason for rejecting this request (optional):', '') || '';
                            const userEmail = host.props.userEmail || '';
                            const adminParam = userEmail ? `?admin=${encodeURIComponent(userEmail)}` : '';
                            try {
                              const res = await fetch(`${host._base()}/api/approvals/${app.id}/reject${adminParam}`, {
                                method: 'POST',
                                headers: { ...host._headers(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ reason: reason.trim() || null }),
                              });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            } catch (err) {
                              window.alert(`Could not reject this item: ${err instanceof Error ? err.message : 'request failed'}`);
                              return;
                            }
                            await host._loadApprovals();
                          }}
                          className="approvals-page-i30" style={{ background: dmsTone('danger').bg, color: dmsTone('danger').fg, borderRadius: 6, transition: 'all 0.15s' }}
                          title="Reject"
                        >
                          <Icon iconName="Cancel" aria-hidden="true" className="approvals-page-i31" />
                        </button>
                      </div>
                    ) : (
                      <div className="approvals-page-i32" title={app.rejectionReason || undefined}>
                        {badge(app.status === 'Approved' ? 'green' : 'red', app.status)}
                        <button
                          onClick={async () => {
                            const userEmail = host.props.userEmail || '';
                            const adminParam = userEmail ? `?admin=${encodeURIComponent(userEmail)}` : '';
                            try {
                              const res = await fetch(`${host._base()}/api/approvals/${app.id}${adminParam}`, {
                                method: 'DELETE', headers: host._headers(),
                              });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            } catch (err) {
                              window.alert(`Could not remove this entry: ${err instanceof Error ? err.message : 'request failed'}`);
                              return;
                            }
                            await host._loadApprovals();
                          }}
                          className="approvals-page-i33" style={{ width: 28, borderRadius: 6, transition: 'all 0.15s' }}
                          title="Remove this entry"
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = dmsTone('danger').bg; (e.currentTarget as HTMLButtonElement).style.color = dmsTone('danger').fg; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vdms-surface-alt)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--vdms-text-faint)'; }}
                        >
                          <Icon iconName="Delete" aria-hidden="true" className="approvals-page-i34" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    );
}
