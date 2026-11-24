import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import { LoginPage, AuthPageMode } from './LoginPage';

export type { AuthPageMode } from './LoginPage';
export { LoginPage, renderLoginPage } from './LoginPage';

export function renderAuthPage(host: VesselEmail, mode: AuthPageMode): React.ReactElement {
  return <LoginPage host={host} mode={mode} />;
}
