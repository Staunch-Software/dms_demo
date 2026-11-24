// Sign-in transition — DESIGN ONLY (no state, API or routing changes).
//  • <SignInVoyage>    — plays briefly on "Continue with SharePoint" before
//                         calling onDone() (the unchanged goToSignIn redirect).
//  • <ShipTransitions> — mounted once inside AppLayout; intentionally renders
//                         nothing (the previous per-navigation door animation
//                         was removed as part of the enterprise UI redesign).

import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { vdmsFont } from '../futuristicTheme';

/** Login: a brief "redirecting" overlay, then onDone() (the unchanged SharePoint redirect). */
export function SignInVoyage({ onDone }: { onDone: () => void }): React.ReactElement {
  React.useEffect(() => {
    const t = setTimeout(onDone, 220);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="ship-scenes-i1" style={{ position: 'fixed', zIndex: 100005, background: '#0b2a4a', color: '#ffffff', fontFamily: vdmsFont.ui }}>
      <div className="ship-scenes-i2" style={{ width: 28 }} />
      <div className="ship-scenes-i3">Redirecting to sign-in…</div>
    </div>
  );
}

/** Mounted once inside AppLayout's root. Reserved for future transition
 * treatments — deliberately a no-op today. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShipTransitions({ host }: { host: VesselEmail }): React.ReactElement | null {
  return null;
}
