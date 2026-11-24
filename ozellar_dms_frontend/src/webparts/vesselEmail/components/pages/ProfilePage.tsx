import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';

export function renderProfilePage(host: VesselEmail): React.ReactElement {
  const displayName = host.props.userDisplayName || 'Admin';
  const email = host.props.userEmail || 'SharePoint account';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="profile-page-i1">
      <div>
        <h1 className="profile-page-i2" style={{ color: clay.text }}>Profile</h1>
        <p className="profile-page-i3" style={{ color: clay.textMuted }}>Your Vessel DMS account details and shortcuts.</p>
      </div>

      <section className="profile-page-i4" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
        <div className="profile-page-i5" style={{ background: clay.accentGradient, boxShadow: clay.shadowButton }}>
          {initial}
        </div>
        <div>
          <h2 className="profile-page-i6" style={{ color: clay.text }}>{displayName}</h2>
          <div className="profile-page-i7" style={{ color: clay.textMuted }}>{email}</div>
          <div className="profile-page-i8" style={{ background: clay.accentSoft, color: clay.accentDark }}>Vessel DMS user</div>
        </div>
      </section>

      <section className="profile-page-i9" style={{ background: clay.surface, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
        <h2 className="profile-page-i10" style={{ color: clay.text }}>Account shortcuts</h2>
        <p className="profile-page-i11" style={{ color: clay.textMuted }}>Manage application preferences and your active session.</p>
        <div className="profile-page-i12">
          <button type="button" onClick={() => host._goToView('settings')} className="profile-page-i13" style={{ background: clay.accentGradient, borderRadius: 12, boxShadow: clay.shadowButton }}>Open Settings</button>
          <button type="button" onClick={host._handleSignOut} className="profile-page-i14" style={{ background: clay.surfaceRaised, color: clay.accentDeep, border: `1px solid ${clay.accentSoft}`, borderRadius: 12 }}>Sign out</button>
        </div>
      </section>
    </div>
  );
}