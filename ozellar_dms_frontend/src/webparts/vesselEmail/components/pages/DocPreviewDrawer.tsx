import * as React from 'react';
import type VesselEmail from '../VesselEmail';
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
import { Icon } from '@fluentui/react/lib/Icon';

export function renderDocPreviewDrawer(host: VesselEmail): React.ReactElement | null {
    const { selectedDocPreview } = host.state;
    if (!selectedDocPreview) return null;

    const base = host._base();
    const downloadUrl = selectedDocPreview.fileId ? `${base}/api/files/${selectedDocPreview.fileId}/content` : null;

    return (
      <div
        className="doc-preview-drawer-i1" style={{ position: 'fixed', background: '#ffffff', zIndex: 10000, borderLeft: '1px solid #cbd5e1' }}
      >
        {/* Drawer Header */}
        <div className="doc-preview-drawer-i2" style={{ background: '#0f172a', color: '#fff' }}>
          <div className="doc-preview-drawer-i3">
            <Icon iconName="Page" aria-hidden="true" className="doc-preview-drawer-i4" /> Document Overview
          </div>
          <button
            onClick={() => host.setState({ selectedDocPreview: null })}
            className="doc-preview-drawer-i5" style={{ background: 'transparent', color: '#cbd5e1' }}
            title="Close Drawer"
          >
            <Icon iconName="Cancel" aria-hidden="true" className="doc-preview-drawer-i6" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="doc-preview-drawer-i7">
          {/* File Icon Banner */}
          <div className="doc-preview-drawer-i8" style={{ background: '#f0f9ff', borderRadius: 12 }}>
            <div className="doc-preview-drawer-i9"><Icon iconName="Page" aria-hidden="true" className="doc-preview-drawer-i9" /></div>
            <div
              onClick={() => {
                host._openPdfViewer(
                  selectedDocPreview.fileId || '',
                  selectedDocPreview.fileName,
                  selectedDocPreview.folderPath,
                  selectedDocPreview.vesselName,
                );
              }}
              className="doc-preview-drawer-i10" style={{ color: '#0284c7' }}
              title="Click to preview document in-app"
            >
              {selectedDocPreview.fileName}
            </div>
            <span className="doc-preview-drawer-i11" style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10 }}>
              Uploaded Document
            </span>
          </div>

          {/* Document Properties */}
          <div className="doc-preview-drawer-i12" style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div className="doc-preview-drawer-i13" style={{ color: '#475569' }}>
              Metadata Details
            </div>
            <div className="doc-preview-drawer-i14" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b' }}><Icon iconName="Ferry" aria-hidden="true" className="doc-preview-drawer-i15" /> Vessel Name:</span>
              <strong style={{ color: '#0f172a' }}>{selectedDocPreview.vesselName}</strong>
            </div>
            <div className="doc-preview-drawer-i14" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b' }}><Icon iconName="FabricFolder" aria-hidden="true" className="doc-preview-drawer-i15" /> Group:</span>
              <span className="doc-preview-drawer-i16">{selectedDocPreview.group}</span>
            </div>
            <div className="doc-preview-drawer-i14" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b' }}><Icon iconName="Tag" aria-hidden="true" className="doc-preview-drawer-i15" /> Category:</span>
              <strong style={{ color: '#1e293b' }}>{selectedDocPreview.category}</strong>
            </div>
            <div className="doc-preview-drawer-i14" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b' }}><Icon iconName="Save" aria-hidden="true" className="doc-preview-drawer-i15" /> Size:</span>
              <span style={{ color: '#475569' }}>{selectedDocPreview.size || '142 KB'}</span>
            </div>
            <div className="doc-preview-drawer-i14" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: '#64748b' }}><Icon iconName="Calendar" aria-hidden="true" className="doc-preview-drawer-i15" /> Date:</span>
              <span style={{ color: '#475569' }}>{selectedDocPreview.date || 'Today'}</span>
            </div>
            <div className="doc-preview-drawer-i17">
              <span style={{ color: '#64748b' }}><Icon iconName="Globe2" aria-hidden="true" className="doc-preview-drawer-i15" /> Folder Path:</span>
              <span className="doc-preview-drawer-i18" style={{ color: '#334155', fontFamily: 'monospace', background: '#f8fafc' }}>
                {selectedDocPreview.folderPath}
              </span>
            </div>
          </div>

          {/* Quick Preview Card */}
          <div className="doc-preview-drawer-i19" style={{ background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
            <div className="doc-preview-drawer-i20" style={{ color: '#475569' }}>
              Document Status: <span className="doc-preview-drawer-i21">Active / Ready</span>
            </div>
            <p className="doc-preview-drawer-i22" style={{ color: '#64748b' }}>
              Click open below to view or download the uploaded document directly.
            </p>
          </div>
        </div>

        {/* Drawer Actions Footer */}
        <div className="doc-preview-drawer-i23" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => {
              host._openPdfViewer(
                selectedDocPreview.fileId || '',
                selectedDocPreview.fileName,
                selectedDocPreview.folderPath,
                selectedDocPreview.vesselName,
              );
            }}
            className="doc-preview-drawer-i24" style={{ background: '#0284c7', color: '#fff', borderRadius: 8 }}
          >
            <Icon iconName="View" aria-hidden="true" className="doc-preview-drawer-i25" /> Preview In-App
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={selectedDocPreview.fileName}
              className="doc-preview-drawer-i26" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8 }}
            >
              <Icon iconName="Download" aria-hidden="true" className="doc-preview-drawer-i15" /> Download Copy
            </a>
          )}
          <button
            onClick={() => {
              host.setState({
                view: 'bento_email',
                bentoUploadVessel: selectedDocPreview.vesselName,
                selectedDocPreview: null,
              });
            }}
            className="doc-preview-drawer-i27" style={{ background: '#0f172a', color: '#fff', borderRadius: 8 }}
          >
            <Icon iconName="Mail" aria-hidden="true" className="doc-preview-drawer-i25" /> Send via Bento Email
          </button>
          <button
            onClick={() => host.setState({ selectedDocPreview: null })}
            className="doc-preview-drawer-i28" style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 8 }}
          >
            Close Drawer
          </button>
        </div>
      </div>
    );
}
