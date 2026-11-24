import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { badge, cleanName } from '../constants';
import { extractRealDocuments, RealDashboardDoc } from './DashboardPage';
import { Icon } from '@fluentui/react/lib/Icon';
import { clay } from '../clayTheme';
import { DmsPageHeader, DMS_SECTION_CARD, dmsBtn, dmsTone } from '../dmsDesignSystem';

export function renderReportsPage(host: VesselEmail): React.ReactElement {
  const { vessels, reportsSelectedVessel } = host.state;
  const selectedVessel = reportsSelectedVessel || 'All Vessels';

    const allRealDocs = extractRealDocuments(host);
    const filteredDocs = selectedVessel === 'All Vessels'
      ? allRealDocs
      : allRealDocs.filter(d => (d.vessel || '').toLowerCase() === selectedVessel.toLowerCase());

    const totalDocs = filteredDocs.length;
    const expiredDocs = filteredDocs.filter(d => d.status === 'Expired').length;
    const expiringSoonDocs = filteredDocs.filter(d => d.status === 'Expiring Soon').length;
    const validDocs = filteredDocs.filter(d => d.status === 'Valid').length;

    // Distribution by Type
    const typeCounts = new Map<string, number>();
    filteredDocs.forEach(d => {
      const t = d.type || 'Other';
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    });
    const typeList = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Distribution by Vessel
    const vesselCounts = new Map<string, number>();
    (vessels || []).forEach(v => vesselCounts.set(v.name, 0));
    allRealDocs.forEach(d => {
      if (d.vessel && d.vessel !== 'Shared Documents') {
        vesselCounts.set(d.vessel, (vesselCounts.get(d.vessel) || 0) + 1);
      }
    });
    const vesselList = Array.from(vesselCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxVesselDocs = Math.max(1, ...vesselList.map(v => v[1]));

    // Category colors for the chart legends below — drawn from `clay.*` so the
    // palette stays token-backed and re-themes with the rest of the app.
    const typeColors = [clay.accent, clay.pillWarnText, clay.pillActiveText, clay.accentDark, clay.pillDangerText];

    return (
      <div className="reports-page-i1">
        {/* Header */}
        <DmsPageHeader title="Reports & Compliance" subtitle="Live compliance summary and document analytics across your fleet.">
          <button
            onClick={() => {
              window.print();
            }}
            style={{ ...dmsBtn('primary'), padding: '0 18px', height: 36 }}
          >
            <Icon iconName="Print" aria-hidden="true" className="reports-page-i2" /> Print / Export Summary
          </button>
        </DmsPageHeader>

        {/* Date / Filter bar */}
        <div style={{ ...DMS_SECTION_CARD, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="reports-page-i3">
            <Icon iconName="Calendar" aria-hidden="true" className="reports-page-i2" />
            <span className="reports-page-i4">Live Fleet Data</span>
          </div>
          <div className="reports-page-i5">
            <span className="reports-page-i6">Filter by Vessel:</span>
            <select
              value={selectedVessel}
              onChange={e => host.setState({ reportsSelectedVessel: e.target.value })}
              className="reports-page-i7" style={{ borderRadius: 6, background: 'var(--vdms-surface)', color: 'var(--vdms-text)' }}
            >
              <option value="All Vessels">All Vessels ({allRealDocs.length} docs)</option>
              {(vessels || []).map(v => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="reports-page-i8">
          <div style={DMS_SECTION_CARD}>
            <div className="reports-page-i9">Total Documents</div>
            <div className="reports-page-i10" style={{ color: clay.accent }}>{totalDocs}</div>
          </div>
          <div style={DMS_SECTION_CARD}>
            <div className="reports-page-i9">Expired Documents</div>
            <div className="reports-page-i10" style={{ color: expiredDocs > 0 ? dmsTone('danger').fg : 'var(--vdms-text)' }}>{expiredDocs}</div>
          </div>
          <div style={DMS_SECTION_CARD}>
            <div className="reports-page-i9">Expiring in 30 days</div>
            <div className="reports-page-i10" style={{ color: expiringSoonDocs > 0 ? dmsTone('warning').fg : 'var(--vdms-text)' }}>{expiringSoonDocs}</div>
          </div>
          <div style={DMS_SECTION_CARD}>
            <div className="reports-page-i9">Valid Documents</div>
            <div className="reports-page-i10" style={{ color: dmsTone('success').fg }}>{validDocs}</div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="reports-page-i11">
          {/* Documents by Type */}
          <div style={DMS_SECTION_CARD}>
            <h3 className="reports-page-i12">Documents by Category / Type</h3>
            {typeList.length === 0 ? (
              <div className="reports-page-i13">
                No document category data available yet.
              </div>
            ) : (
              <div className="reports-page-i14">
                {typeList.map(([tName, tCount], idx) => {
                  const pct = totalDocs > 0 ? Math.round((tCount / totalDocs) * 100) : 0;
                  const color = typeColors[idx % typeColors.length];
                  return (
                    <div key={tName}>
                      <div className="reports-page-i15">
                        <span className="reports-page-i16">{tName}</span>
                        <span className="reports-page-i17">{tCount} ({pct}%)</span>
                      </div>
                      <div className="reports-page-i18">
                        <div className="reports-page-i19" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Documents by Vessel (Bar Chart) */}
          <div style={DMS_SECTION_CARD}>
            <h3 className="reports-page-i12">Documents by Vessel</h3>
            {vesselList.length === 0 ? (
              <div className="reports-page-i13">
                No vessel document data available yet.
              </div>
            ) : (
              <div className="reports-page-i20">
                {vesselList.map(([vName, vCount]) => (
                  <div key={vName} className="reports-page-i21">
                    <span className="reports-page-i22" style={{ width: 110 }} title={vName}>
                      <Icon iconName="Ferry" aria-hidden="true" className="reports-page-i23" /> {vName}
                    </span>
                    <div className="reports-page-i24">
                      <div className="reports-page-i19" style={{ width: `${(vCount / maxVesselDocs) * 100}%`, background: clay.accent }} />
                    </div>
                    <span className="reports-page-i25" style={{ width: 28 }}>{vCount}</span>
                  </div>
                ))}
                <div className="reports-page-i26">No. of Documents</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
}
