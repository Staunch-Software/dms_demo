import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { vdmsFont, injectFuturisticTheme } from '../futuristicTheme';
import { loginSceneImage } from '../loginScene';
import { OZELLAR_LOGO_BASE64 } from '../brandAssets';

export type AuthPageMode = 'login' | 'logout';

interface ILoginPageProps {
  host: VesselEmail;
  mode?: AuthPageMode;
}

export function renderLoginPage(host: VesselEmail, mode: AuthPageMode = 'login'): React.ReactElement {
  return <LoginPage host={host} mode={mode} />;
}

// Also export renderAuthPage for backward-compatibility with existing call sites
export function renderAuthPage(host: VesselEmail, mode: AuthPageMode): React.ReactElement {
  return <LoginPage host={host} mode={mode} />;
}

export const LoginPage: React.FC<ILoginPageProps> = ({ host, mode = 'login' }) => {
  React.useEffect(() => {
    injectFuturisticTheme();
  }, []);

  const [usernameOrEmail, setUsernameOrEmail] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [showPassword, setShowPassword] = React.useState<boolean>(false);
  const [rememberMe, setRememberMe] = React.useState<boolean>(true);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  // One-time "set your password" link from the invitation email: ...?vdms_setpw=<token>
  const [setPwToken] = React.useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get('vdms_setpw') || '';
    } catch { return ''; }
  });
  const [newPassword, setNewPassword] = React.useState<string>('');
  const [confirmPassword, setConfirmPassword] = React.useState<string>('');
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const [showSetPw, setShowSetPw] = React.useState<boolean>(Boolean(setPwToken));

  const isLogout = mode === 'logout';
  const isSessionExpired = Boolean(host.state.sessionExpired);

  const handleSsoLogin = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await host._handleSsoLogin();
      if (!res.success) {
        setErrorMessage(res.error || 'Single Sign-On authentication failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to Microsoft 365 authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('The two passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${host._base()}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setPwToken, password: newPassword }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = body && body.detail;
        setErrorMessage((d && (typeof d === 'string' ? d : d.message)) || 'Could not set the password. Ask your administrator to resend the invitation.');
        return;
      }
      // Remove the one-time token from the address bar, then send the user to the password form.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('vdms_setpw');
        window.history.replaceState({}, '', url.toString());
      } catch { /* ignore */ }
      setShowSetPw(false);
      setUsernameOrEmail(body.email || '');
      setNewPassword('');
      setConfirmPassword('');
      setInfoMessage('Your password is set. Sign in below.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!usernameOrEmail || !usernameOrEmail.trim()) {
      setErrorMessage('Please enter your User ID or Email address.');
      return;
    }
    if (!password || !password.trim()) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await host._handlePasswordLogin(usernameOrEmail.trim(), password.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Invalid credentials. Please verify your User ID / email and password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to login server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      
      data-vessel-theme={host.state.themeMode}
      className="vessel-dms-login-root login-page-i1" style={{ position: 'fixed', width: '100vw', minWidth: '100vw', fontFamily: vdmsFont.ui, background: '#ffffff' }}
    >
      {/* ── Left Hero Panel (Edge-to-Edge Full Height Commercial Maritime Vessel) ── */}
      <div
        
        className="vessel-dms-login-hero login-page-i2" style={{ background: `linear-gradient(165deg, rgba(3, 14, 28, 0.94) 0%, rgba(6, 24, 48, 0.88) 45%, rgba(8, 36, 70, 0.94) 100%), url(${loginSceneImage}) center/cover no-repeat` }}
      >
        {/* Top Brand Logo */}
        <div>
          <div className="login-page-i3">
            <div
              className="login-page-i4" style={{ borderRadius: 12, overflow: 'hidden', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}
            >
              <img
                src={OZELLAR_LOGO_BASE64}
                alt="Ozellar Marine"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <h2
                className="login-page-i6" style={{ letterSpacing: '-0.02em', fontFamily: vdmsFont.display }}
              >
                Ozellar Marine DMS
              </h2>
              <div
                className="login-page-i7"
              >
                Vessel Document Management System
              </div>
            </div>
          </div>

          {/* Maritime Headline & Highlights */}
          <div className="login-page-i8">
            <span
              className="login-page-i9" style={{ background: 'rgba(56, 189, 248, 0.22)', color: '#7dd3fc' }}
            >
              Enterprise Maritime Cloud
            </span>
            <h1
              className="login-page-i10" style={{ letterSpacing: '-0.02em' }}
            >
              Next-Gen Fleet Documentation & Governance
            </h1>
            <p
              className="login-page-i11" style={{ color: '#e2e8f0' }}
            >
              Unified cloud repository, intelligent OCR classification, and live compliance tracking for ship drawings, manuals, and class certificates.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="login-page-i12">
            {[
              'Automated Vessel Taxonomy & Monthly Folder Structure',
              'Class, Flag & Marine Certificate Life-Cycle Management',
              'Multi-Site SharePoint Online Fleet Synchronization',
            ].map((feat, idx) => (
              <div
                key={idx}
                className="login-page-i13" style={{ color: '#e2e8f0' }}
              >
                <div
                  className="login-page-i14" style={{ width: 22, background: 'rgba(34, 197, 94, 0.25)', color: '#4ade80' }}
                >
                  <Icon iconName="CheckMark" className="login-page-i15" style={{ fontWeight: 'bold' }} />
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Security Badge */}
        <div
          className="login-page-i16" style={{ color: '#cbd5e1' }}
        >
          <div className="login-page-i17">
            <span
              className="login-page-i18" style={{ background: '#22c55e' }}
            />
            <span className="login-page-i19">All Systems Operational</span>
          </div>
          <div className="login-page-i20">
            <Icon iconName="Lock" className="login-page-i21" />
            <span className="login-page-i19">256-bit TLS Encrypted</span>
          </div>
        </div>
      </div>

      {/* ── Right Authentication Panel (Unified Login Form) ── */}
      <div
        
        className="vessel-dms-login-form-panel login-page-i22" style={{ background: '#ffffff' }}
      >
        <div className="login-page-i23" style={{ width: '100%' }}>
          {/* Header Titles */}
          <div className="login-page-i24">
            <h2
              className="login-page-i25" style={{ color: '#0f172a', letterSpacing: '-0.02em' }}
            >
              Sign In
            </h2>
            <p className="login-page-i26" style={{ color: '#64748b' }}>
              {showSetPw ? 'Set your password to finish setting up your account.' : 'Enter your credentials to access Vessel DMS.'}
            </p>
          </div>

          {/* Informational Banners */}
          {isLogout && (
            <div
              className="login-page-i27" style={{ borderRadius: 10, background: '#f0fdf4', color: '#15803d' }}
            >
              <Icon iconName="Completed" className="login-page-i28" />
              <span>You have been safely signed out. Please sign in to resume work.</span>
            </div>
          )}

          {isSessionExpired && !isLogout && (
            <div
              className="login-page-i29" style={{ borderRadius: 10, background: '#fffbeb', color: '#b45309' }}
            >
              <Icon iconName="Warning" className="login-page-i28" />
              <span>Your session has expired due to inactivity. Please sign in again.</span>
            </div>
          )}

          {errorMessage && (
            <div
              className="login-page-i30" style={{ borderRadius: 10, background: '#fef2f2', color: '#b91c1c' }}
            >
              <Icon iconName="ErrorBadge" className="login-page-i28" />
              <span className="login-page-i31">{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="login-page-i32"
              >
                <Icon iconName="Cancel" className="login-page-i15" />
              </button>
            </div>
          )}

          {infoMessage && (
            <div
              className="login-page-i27" style={{ borderRadius: 10, background: '#f0fdf4', color: '#15803d' }}
            >
              <Icon iconName="Completed" className="login-page-i28" />
              <span>{infoMessage}</span>
            </div>
          )}

          {showSetPw ? (
          /* ── Set your password (one-time link from the invitation email) ── */
          <form onSubmit={handleSetPassword}>
            <p style={{ fontSize: 13.5, color: '#475569', marginBottom: 14 }}>
              Choose a password for your Vessel DMS account (at least 8 characters).
            </p>
            <div className="login-page-i33">
              <label htmlFor="vdms-new-password" className="login-page-i34" style={{ color: '#334155' }}>New password</label>
              <input
                id="vdms-new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="login-page-i41" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontFamily: vdmsFont.ui }}
              />
            </div>
            <div className="login-page-i33">
              <label htmlFor="vdms-confirm-password" className="login-page-i34" style={{ color: '#334155' }}>Confirm password</label>
              <input
                id="vdms-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="login-page-i41" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontFamily: vdmsFont.ui }}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="login-page-i46" style={{ width: '100%', borderRadius: 10, fontFamily: vdmsFont.ui, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.75 : 1 }}
            >
              <span>{isLoading ? 'Saving...' : 'Set password'}</span>
            </button>
          </form>
          ) : (
          <>
          {/* ── Primary Form: User ID & Password (Above) ── */}
          <form onSubmit={handlePasswordLogin}>
            {/* User ID / Email Input */}
            <div className="login-page-i33">
              <label
                htmlFor="vdms-login-username"
                className="login-page-i34" style={{ color: '#334155' }}
              >
                User ID / Email Address
              </label>
              <div className="login-page-i35">
                <div
                  className="login-page-i36" style={{ color: '#94a3b8' }}
                >
                  <Icon iconName="Contact" className="login-page-i28" />
                </div>
                <input
                  id="vdms-login-username"
                  type="text"
                  value={usernameOrEmail}
                  onChange={e => setUsernameOrEmail(e.target.value)}
                  placeholder="Enter User ID or Email"
                  autoComplete="username"
                  required
                  className="login-page-i37" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontFamily: vdmsFont.ui }}
                  onFocus={e => (e.target.style.borderColor = '#0284c7')}
                  onBlur={e => (e.target.style.borderColor = '#cbd5e1')}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="login-page-i33">
              <div className="login-page-i38">
                <label
                  htmlFor="vdms-login-password"
                  className="login-page-i39" style={{ color: '#334155' }}
                >
                  Password
                </label>
                <span
                  className="login-page-i40" style={{ color: '#0284c7' }}
                  title="Contact your system administrator to reset credentials"
                >
                  Forgot password?
                </span>
              </div>
              <div className="login-page-i35">
                <div
                  className="login-page-i36" style={{ color: '#94a3b8' }}
                >
                  <Icon iconName="Lock" className="login-page-i28" />
                </div>
                <input
                  id="vdms-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="login-page-i41" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontFamily: vdmsFont.ui }}
                  onFocus={e => (e.target.style.borderColor = '#0284c7')}
                  onBlur={e => (e.target.style.borderColor = '#cbd5e1')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="login-page-i42" style={{ background: 'transparent', color: '#64748b' }}
                >
                  <Icon iconName={showPassword ? 'Hide' : 'RedEye'} className="login-page-i28" />
                </button>
              </div>
            </div>

            {/* Remember Me Option */}
            <div className="login-page-i43">
              <input
                id="vdms-remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="login-page-i44" style={{ width: 16, accentColor: '#0284c7' }}
              />
              <label htmlFor="vdms-remember-me" className="login-page-i45" style={{ color: '#475569' }}>
                Keep me signed in on this device
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="login-page-i46" style={{ width: '100%', borderRadius: 10, fontFamily: vdmsFont.ui, cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease', opacity: isLoading ? 0.75 : 1 }}
              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { if (!isLoading) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <Icon iconName="Signin" className="login-page-i28" />
                  <span>Sign In to Vessel DMS</span>
                </>
              )}
            </button>
          </form>

          {/* ── OR Divider ── */}
          <div
            className="login-page-i47"
          >
            <div className="login-page-i48" style={{ background: '#e2e8f0' }} />
            <span
              className="login-page-i49" style={{ color: '#94a3b8' }}
            >
              OR
            </span>
            <div className="login-page-i48" style={{ background: '#e2e8f0' }} />
          </div>

          {/* ── Secondary Option: Sign in with Microsoft (Below) ── */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleSsoLogin}
            className="login-page-i50" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#1e293b', fontFamily: vdmsFont.ui, cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease', opacity: isLoading ? 0.75 : 1 }}
            onMouseEnter={e => {
              if (!isLoading) {
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.background = '#f8fafc';
              }
            }}
            onMouseLeave={e => {
              if (!isLoading) {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#ffffff';
              }
            }}
          >
            {/* Microsoft 4-Color Square Logo */}
            <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
              <path fill="#f25022" d="M1 1h9v9H1z" />
              <path fill="#00a4ef" d="M1 11h9v9H1z" />
              <path fill="#7fba00" d="M11 1h9v9H11z" />
              <path fill="#ffb900" d="M11 11h9v9H11z" />
            </svg>
            <span>Sign in with Microsoft</span>
          </button>
          </>
          )}
        </div>

        {/* Footer Info */}
        <div
          className="login-page-i51" style={{ width: '100%', borderTop: '1px solid #f1f5f9', color: '#94a3b8' }}
        >
          <span>© Ozellar Marine All rights reserved.</span>
          <span style={{ color: '#64748b' }}>Vessel DMS v2.4</span>
        </div>
      </div>
    </div>
  );
};
