// Entry point for the Migration Assistant module — the SharePoint AI
// Migration Assistant (originally a standalone Vite/React/Tailwind app at
// C:\llm\llm\SharePoint-AI-Migration-Assistant) ported to run as a tab
// inside this SPFx web part. Deliberately self-contained: everything it
// needs lives under this migrationAssistant/ folder, and the host app
// (VesselEmail.tsx) only ever touches this one file.
//
// The Migration Assistant backend is part of the main Vessel DMS backend
// (backend/app/migration_assistant/, routes under /api/migration-assistant/*)
// — it starts with the DMS API, no separate process. It reuses the DMS
// session for auth; the acting user's email is also sent for the audit trail.
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { MigrationApi } from './api';
import { MigrationScanTab } from './MigrationScanTab';
import { SiteToSiteTab } from './SiteToSiteTab';
import { TagExistingFilesTab } from './TagExistingFilesTab';
import { VesselExcelExportTab } from './VesselExcelExportTab';
import { tokens } from './styles';

export interface IMigrationAssistantModuleProps {
  /** Base URL of the main Vessel DMS API (the migration routes live on it).
   *  The web part's optional "Migration API Base URL" property overrides it. */
  apiBaseUrl: string;
  /** DMS session id (sent as Authorization / X-Session-ID). */
  sessionId?: string;
  actingEmail: string;
  isNight: boolean;
}

type Tab = 'migration' | 'site-to-site' | 'tag-existing' | 'excel-export';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'migration', label: 'Migration Assistant', icon: 'Sparkle' },
  { id: 'site-to-site', label: 'Site-to-Site', icon: 'Switch' },
  { id: 'tag-existing', label: 'Tag Existing Files', icon: 'Tag' },
  { id: 'excel-export', label: 'Vessel Excel Export', icon: 'ExcelDocument' },
];

export function MigrationAssistantModule({ apiBaseUrl, sessionId, actingEmail, isNight }: IMigrationAssistantModuleProps): React.ReactElement {
  const t = tokens(isNight);
  const [tab, setTab] = React.useState<Tab>('migration');
  const [health, setHealth] = React.useState<'checking' | 'ok' | 'not_configured' | 'unauthorized' | 'unreachable'>('checking');
  const [healthDetail, setHealthDetail] = React.useState<string>('');

  const api = React.useMemo(() => new MigrationApi(apiBaseUrl, actingEmail || 'unknown', sessionId || ''), [apiBaseUrl, actingEmail, sessionId]);

  React.useEffect(() => {
    let cancelled = false;
    setHealth('checking');
    setHealthDetail('');
    api.health()
      .then((h) => !cancelled && setHealth(h.configured ? 'ok' : 'not_configured'))
      .catch((err) => {
        if (cancelled) return;
        console.error('[MigrationAssistant] health check failed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        setHealthDetail(msg);
        if (err?.status === 401) {
          setHealth('unauthorized');
        } else {
          setHealth('unreachable');
        }
      });
    return () => { cancelled = true; };
  }, [api]);

  if (!apiBaseUrl) {
    return (
      <div className="migration-assistant-module-i1" style={{ color: t.textMuted }}>
        <Icon iconName="Warning" className="migration-assistant-module-i2" style={{ display: 'block' }} />
        The Migration Assistant runs on the main DMS backend. Set "API Base URL" in this web part's property pane
        (the pencil / edit-web-part panel) to your DMS API (default local dev: <code>http://127.0.0.1:8000</code>).
      </div>
    );
  }

  return (
    <div className="migration-assistant-module-i3">
      <div className="migration-assistant-module-i4" style={{ borderBottom: `1px solid ${t.border}` }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="migration-assistant-module-i5" style={{ borderBottom: tab === tb.id ? '2px solid var(--clay-accent)' : '2px solid transparent', color: tab === tb.id ? 'var(--clay-accent)' : t.textMuted, fontWeight: tab === tb.id ? 700 : 500 }}
          >
            <Icon iconName={tb.icon} className="migration-assistant-module-i6" />{tb.label}
          </button>
        ))}
        <div className="migration-assistant-module-i7" style={{ color: t.textSubtle }}>
          <span className="migration-assistant-module-i8" style={{ background: health === 'ok' ? '#16a34a' : health === 'unreachable' ? '#dc2626' : '#d97706' }} />
          {health === 'ok' ? 'Migration Assistant connected'
            : health === 'checking' ? 'Checking Migration Assistant…'
            : health === 'not_configured' ? 'Migration Assistant not configured on the server (set MIGRATION_SITE_HOSTNAME / MIGRATION_SITE_PATH in backend .env)'
            : health === 'unauthorized' ? 'Session expired — please refresh or sign in again'
            : `Migration Assistant unreachable at ${apiBaseUrl}${healthDetail ? ` (${healthDetail})` : ''}`}
        </div>
      </div>
      <div className="migration-assistant-module-i9">
        {tab === 'migration' && <MigrationScanTab api={api} isNight={isNight} actingEmail={actingEmail} />}
        {tab === 'site-to-site' && <SiteToSiteTab api={api} isNight={isNight} />}
        {tab === 'tag-existing' && <TagExistingFilesTab api={api} isNight={isNight} />}
        {tab === 'excel-export' && <VesselExcelExportTab api={api} isNight={isNight} />}
      </div>
    </div>
  );
}
