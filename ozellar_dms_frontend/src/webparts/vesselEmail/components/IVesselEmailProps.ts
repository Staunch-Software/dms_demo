import { MSGraphClientV3, SPHttpClient } from '@microsoft/sp-http';

export interface IVesselEmailProps {
  apiBaseUrl: string;
  apiToken: string;
  isDarkTheme: boolean;
  userDisplayName: string;
  userEmail: string;
  sessionId?: string;
  sessionExpired?: boolean;
  // True once the webpart's session-init flow has settled (success, no-session
  // stub mode, or failure). Data loading should gate on THIS, not on sessionId
  // being non-empty — a backend without a database legitimately never issues one.
  sessionInitialized?: boolean;
  // Set when the backend was unreachable (DNS / TLS / network) while starting the
  // session. The app shows this message instead of silently using a local backend.
  apiConnectionError?: string;

  // Graph / SharePoint context — required for folder creation and delta sync
  graphClient?: MSGraphClientV3;
  graphAccessToken?: string;
  /** Fetches a fresh Microsoft Graph token from SharePoint's Entra sign-in
   *  (aadTokenProviderFactory). Used for SSO login so the backend can verify
   *  the user's identity instead of trusting an e-mail address. */
  getGraphToken?: () => Promise<string>;
  /** SharePoint REST-scoped delegated token (aud = tenant SP root). Used by the
   *  backend for taxonomy field writes (ValidateUpdateListItem) which require a
   *  different token audience than the Graph token above. */
  spAccessToken?: string;
  spHttpClient?: SPHttpClient;
  siteId?: string;
  driveId?: string;
  siteUrl?: string;  // absolute SharePoint site URL, e.g. https://tenant.sharepoint.com/sites/mysite

  // Base URL the Migration Assistant module calls. Defaults to apiBaseUrl
  // (the migration routes are part of the main DMS backend now); the web
  // part property is only an optional override.
  migrationApiBaseUrl?: string;
}