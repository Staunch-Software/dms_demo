import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { DmsLoadingState } from '../dmsDesignSystem';

// Home dashboard for the registered (Ship Register) fleet: certificate and service agreement expiry.
// Backend: app/fleet_dashboard_api.py. Styles: styles/pages/_fleet-dashboard.scss

interface Action { kind: 'certificate' | 'agreement'; id: number; title: string; subtitle: string; expiry_date: string; days_left: number }
interface ShipRow { vessel_id: number; name: string; imo: string | null; vessel_type: string | null; required: number; uploaded: number; optional: number; expired: number; due_soon: number }
interface Summary {
  today: string;
  kpis: { ships: number; certificates_required: number; certificates_uploaded: number; compliance_pct: number | null; due_30: number; expired: number; contracts: number };
  actions: Action[];
  actions_total: number;
  by_ship: ShipRow[];
  agreements: { total: number; active: number; expiring: number; expired: number; pending_approval: number; auto_renew_soon: number };
  next_90_days: Array<{ month: string; label: string; count: number }>;
  gaps: Array<{ certificate_master_id: number; name: string; missing: number; applies_to: number }>;
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
};

function daysPill(days: number): { text: string; tone: string } {
  if (days < 0) return { text: `Expired ${-days} day${days === -1 ? '' : 's'}`, tone: 'bad' };
  if (days === 0) return { text: 'Expires today', tone: 'bad' };
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: days <= 30 ? 'warn' : 'muted' };
}

function Card(props: { icon: string; tone?: string; title: string; note?: React.ReactNode; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <section className={`fd-card ${props.className || ''}`}>
      <header className="fd-card__head">
        <Icon iconName={props.icon} className={`fd-ic fd-ic--${props.tone || 'accent'}`} />
        <span className="fd-card__title">{props.title}</span>
        {props.note && <span className="fd-card__note">{props.note}</span>}
      </header>
      {props.children}
    </section>
  );
}

export function FleetDashboardPage({ host }: { host: VesselEmail }): React.ReactElement {
  const [data, setData] = React.useState<Summary | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${host._base()}/api/fleet-dashboard`, { headers: host._headers(), cache: 'no-store' });
      if (!res.ok) throw new Error(`Couldn't load the dashboard (${res.status}).`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [host]);
  React.useEffect(() => { void load(); }, [load]);

  const go = (view: 'certificates' | 'service_agreements' | 'ship_register'): void => { void host._goToView(view); };

  if (loading && !data) return <DmsLoadingState label="Loading dashboard…" />;
  if (!data) {
    return (
      <div className="fd-page">
        <div className="fd-alert"><Icon iconName="ErrorBadge" /> {error || 'Dashboard unavailable.'}
          <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()}>Try again</button></div>
      </div>
    );
  }

  const k = data.kpis;
  const ag = data.agreements;
  const compliance = k.compliance_pct;
  const compTone = compliance === null ? 'accent' : compliance >= 90 ? 'ok' : compliance >= 50 ? 'warn' : 'bad';
  const tiles = [
    { icon: 'Ferry', tone: 'accent', value: String(k.ships), label: 'Ships', view: 'ship_register' as const },
    { icon: 'Certificate', tone: compTone, value: compliance === null ? '-' : `${compliance}%`, label: 'Compliance', hint: `${k.certificates_uploaded} of ${k.certificates_required} required certificates uploaded`, view: 'certificates' as const },
    { icon: 'Clock', tone: k.due_30 ? 'warn' : 'ok', value: String(k.due_30), label: 'Due in 30 days', view: 'certificates' as const },
    { icon: 'StatusErrorFull', tone: k.expired ? 'bad' : 'ok', value: String(k.expired), label: 'Expired', view: 'certificates' as const },
    { icon: 'TextDocument', tone: 'accent', value: String(k.contracts), label: 'Contracts', view: 'service_agreements' as const },
  ];
  const maxMonth = Math.max(1, ...data.next_90_days.map(m => m.count));
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })();
  const urgent = data.actions.filter(a => a.days_left <= 30).length;
  const firstName = String(host.props.userDisplayName || '').trim().split(/\s+/)[0];

  return (
    <div className="fd-page">
      <div className="fd-top">
        <div className="fd-top__text">
          <div className="fd-top__hello">{greeting}{firstName ? `, ${firstName}` : ''}</div>
          <span>{fmtDate(data.today)} · {urgent ? `${urgent} item${urgent === 1 ? '' : 's'} need attention` : 'the fleet is all caught up'}</span>
        </div>
        <button type="button" className="sa-btn sa-btn--ghost" title="Refresh" aria-label="Refresh" onClick={() => void load()}>
          <Icon iconName={loading ? 'Sync' : 'Refresh'} />
        </button>
      </div>

      <div className="fd-tiles">
        {tiles.map(t => (
          <button key={t.label} type="button" className={`fd-tile fd-tile--${t.tone}`} title={(t as { hint?: string }).hint} onClick={() => go(t.view)}>
            <span className="fd-tile__icon"><Icon iconName={t.icon} /></span>
            <span className="fd-tile__text"><b>{t.value}</b><small>{t.label}</small></span>
          </button>
        ))}
      </div>

      <div className="fd-grid">
        <div className="fd-stack">
        <Card icon="Warning" tone="bad" title="Action needed" className="fd-actions"
          note={data.actions_total > data.actions.length ? `${data.actions.length} of ${data.actions_total}` : 'certificates and contracts, next 90 days'}>
          {data.actions.length === 0 ? (
            <div className="fd-empty"><Icon iconName="CompletedSolid" className="fd-ic fd-ic--ok" /> Nothing expired or due in the next 90 days.</div>
          ) : data.actions.map(a => {
            const p = daysPill(a.days_left);
            return (
              <button key={`${a.kind}-${a.id}`} type="button" className="fd-row" onClick={() => go(a.kind === 'certificate' ? 'certificates' : 'service_agreements')}>
                <Icon iconName={a.kind === 'certificate' ? 'Certificate' : 'TextDocument'} className="fd-row__icon" />
                <span className="fd-row__text"><span>{a.title}</span><small>{a.subtitle}</small></span>
                <span className={`fd-pill fd-pill--${p.tone}`}>{p.text}</span>
              </button>
            );
          })}
        </Card>

        <Card icon="Shield" tone="ok" title="Certificates by ship" note="uploaded of required" className="fd-ships">
          {data.by_ship.length === 0 ? (
            <div className="fd-empty"><Icon iconName="Ferry" className="fd-ic" /> Register ships in Ship Register to track their certificates.</div>
          ) : data.by_ship.map(s => {
            const pct = s.required ? (s.uploaded / s.required) * 100 : 0;
            const exp = s.required ? (s.expired / s.required) * 100 : 0;
            const due = s.required ? (s.due_soon / s.required) * 100 : 0;
            return (
              <button key={s.vessel_id} type="button" className="fd-ship" onClick={() => go('certificates')}
                title={`${s.uploaded} of ${s.required} required uploaded · ${s.due_soon} due in 30 days · ${s.expired} expired`}>
                <span className="fd-ship__name">{s.name}<small>{s.vessel_type || ''}</small></span>
                <span className="fd-bar">
                  <span className="fd-bar__ok" style={{ width: `${Math.max(0, pct - exp - due)}%` }} />
                  <span className="fd-bar__warn" style={{ width: `${due}%` }} />
                  <span className="fd-bar__bad" style={{ width: `${exp}%` }} />
                </span>
                <span className="fd-ship__num">{s.uploaded} / {s.required}</span>
              </button>
            );
          })}
          <div className="fd-legend"><span><i className="fd-dot fd-dot--ok" /> valid</span><span><i className="fd-dot fd-dot--warn" /> due in 30 days</span><span><i className="fd-dot fd-dot--bad" /> expired</span></div>
        </Card>

        </div>
        <div className="fd-stack">
          <Card icon="TextDocument" title="Service agreements" note={<button type="button" className="fd-link" onClick={() => go('service_agreements')}>Open</button>}>
            <div className="fd-trio">
              <span><b className="fd-t--ok">{ag.active}</b><small>Active</small></span>
              <span><b className="fd-t--warn">{ag.expiring}</b><small>In notice</small></span>
              <span><b className="fd-t--bad">{ag.expired}</b><small>Expired</small></span>
            </div>
            <div className="fd-line"><Icon iconName="Sync" /> Auto-renewing in 30 days<b>{ag.auto_renew_soon}</b></div>
            <div className="fd-line"><Icon iconName="UserFollowed" /> Waiting for approval<b>{ag.pending_approval}</b></div>
          </Card>
          <Card icon="Calendar" title="Expiring in the next 90 days">
            <div className="fd-months">
              {data.next_90_days.map(m => (
                <span key={m.month} className="fd-month" title={`${m.count} expir${m.count === 1 ? 'y' : 'ies'} in ${m.label}`}>
                  <span className="fd-month__bar" style={{ height: `${Math.max(4, (m.count / maxMonth) * 100)}%`, opacity: m.count ? 1 : 0.35 }} />
                  <small>{m.label} · {m.count}</small>
                </span>
              ))}
            </div>
          </Card>
                <Card icon="Flag" tone="bad" title="Biggest gaps" note="required, not uploaded">
          {data.gaps.length === 0 ? (
            <div className="fd-empty"><Icon iconName="CompletedSolid" className="fd-ic fd-ic--ok" /> Every required certificate is uploaded.</div>
          ) : data.gaps.map(g => (
            <button key={g.certificate_master_id} type="button" className="fd-row fd-row--tight" onClick={() => go('certificates')}>
              <span className="fd-row__text"><span>{g.name}</span></span>
              <span className={`fd-pill fd-pill--${g.missing === g.applies_to ? 'bad' : 'warn'}`}>{g.missing} of {g.applies_to} ships</span>
            </button>
          ))}
        </Card>
        </div>
      </div>
    </div>
  );
}
