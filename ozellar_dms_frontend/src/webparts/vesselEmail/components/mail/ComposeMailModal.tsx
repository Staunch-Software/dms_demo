import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import type VesselEmail from '../VesselEmail';
import { clay } from '../clayTheme';
import { SharePointPicker, PickedItem, fileIcon, formatSize } from './SharePointPicker';

/**
 * Outlook-style "New message" for Vessel DMS (left menu → Send Email).
 *
 *  - To / Cc / Bcc with company-directory search (GET /api/mail/people)
 *    plus any typed address;
 *  - formatted body (bold, italic, underline, lists, links);
 *  - attachments from any SharePoint site in Site Management (files as
 *    copies or links, folders as links) and from the user's computer;
 *  - POST /api/mail/send — sent from the user's own mailbox when the
 *    Mail.Send permission is approved, otherwise from the DMS mailbox with
 *    the user as Reply-To (the result says which).
 */

const LINE = 'var(--vdms-line)';
const BRAND = 'linear-gradient(135deg, #0e7490 0%, #0b2a4a 100%)';
const MAX_TOTAL = 150 * 1024 * 1024;
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

interface Person { name: string; email: string; job_title?: string | null; department?: string | null }
interface LocalAttachment { id: string; name: string; size: number; content_type: string; content_b64: string }

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
}

function RecipientField(props: {
  host: VesselEmail;
  label: string;
  values: Person[];
  onChange: (v: Person[]) => void;
  autoFocus?: boolean;
  right?: React.ReactNode;
}): React.ReactElement {
  const { host, values, onChange } = props;
  const [text, setText] = React.useState('');
  const [hits, setHits] = React.useState<Person[]>([]);
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const q = text.trim();
    if (!q) { setHits([]); return; }
    let cancelled = false;
    const t = window.setTimeout(() => {
      fetch(`${host._base()}/api/mail/people?q=${encodeURIComponent(q)}&limit=8`, { headers: host._headers() })
        .then(r => (r.ok ? r.json() : { people: [] }))
        .then(d => {
          if (cancelled) return;
          const taken = new Set(values.map(v => v.email.toLowerCase()));
          setHits((d.people || []).filter((p: Person) => !taken.has(p.email.toLowerCase())));
          setActive(0);
        })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [text]);

  const add = (p: Person): void => {
    if (!values.some(v => v.email.toLowerCase() === p.email.toLowerCase())) onChange([...values, p]);
    setText(''); setHits([]);
    if (inputRef.current) inputRef.current.focus();
  };
  const addTyped = (): boolean => {
    const parts = text.split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
    const good = parts.filter(p => EMAIL_RE.test(p));
    if (!good.length) return false;
    const taken = new Set(values.map(v => v.email.toLowerCase()));
    onChange([...values, ...good.filter(e => !taken.has(e.toLowerCase())).map(e => ({ name: e, email: e }))]);
    setText(''); setHits([]);
    return true;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setActive((active + 1) % hits.length); return; }
    if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setActive((active - 1 + hits.length) % hits.length); return; }
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      if (hits.length && open) { e.preventDefault(); add(hits[active]); return; }
      if (text.trim() && addTyped()) e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="compose-mail-modal-i1" style={{ borderBottom: `1px solid ${LINE}` }}>
      <span className="compose-mail-modal-i2" style={{ color: clay.textMuted }}>{props.label}</span>
      <div className="compose-mail-modal-i3" onClick={() => inputRef.current && inputRef.current.focus()}>
        {values.map(v => {
          const bad = !EMAIL_RE.test(v.email);
          return (
            <span key={v.email} title={v.email} className="compose-mail-modal-i4" style={{ background: bad ? '#fee2e2' : clay.accentSoft, color: bad ? '#b91c1c' : clay.accentDark }}>
              <span className="compose-mail-modal-i5" style={{ width: 20, background: '#0e7490', color: '#fff' }}>{initials(v.name)}</span>
              {v.name}
              <button type="button" aria-label={`Remove ${v.name}`} onClick={e => { e.stopPropagation(); onChange(values.filter(x => x.email !== v.email)); }}
                className="compose-mail-modal-i6">
                <Icon iconName="Cancel" className="compose-mail-modal-i7" />
              </button>
            </span>
          );
        })}
        <input ref={inputRef} autoFocus={props.autoFocus} value={text}
          onChange={e => { setText(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
          onBlur={() => window.setTimeout(() => { setOpen(false); if (text.trim()) addTyped(); }, 150)}
          placeholder={values.length ? '' : 'Type a name or email'}
          className="compose-mail-modal-i8" style={{ minWidth: 140, color: clay.text }} />
      </div>
      {props.right}
      {open && hits.length > 0 && (
        <div className="compose-mail-modal-i9" style={{ background: clay.surface, border: `1px solid ${LINE}`, borderRadius: 10 }}>
          {hits.map((p, i) => (
            <div key={p.email} onMouseDown={e => { e.preventDefault(); add(p); }} onMouseEnter={() => setActive(i)}
              className="compose-mail-modal-i10" style={{ background: i === active ? clay.surfaceHover : 'transparent' }}>
              <span className="compose-mail-modal-i11" style={{ background: BRAND }}>{initials(p.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="compose-mail-modal-i12" style={{ color: clay.text }}>{p.name}</div>
                <div className="compose-mail-modal-i13" style={{ color: clay.textMuted }}>
                  {p.email}{p.job_title ? ` · ${p.job_title}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComposeMailModal(props: { host: VesselEmail; onClose: () => void; initialItems?: PickedItem[] }): React.ReactElement | React.ReactPortal {
  const { host } = props;
  const [to, setTo] = React.useState<Person[]>([]);
  const [cc, setCc] = React.useState<Person[]>([]);
  const [bcc, setBcc] = React.useState<Person[]>([]);
  const [showCc, setShowCc] = React.useState(false);
  const [subject, setSubject] = React.useState('');
  const [important, setImportant] = React.useState(false);
  const [items, setItems] = React.useState<PickedItem[]>(props.initialItems || []);
  const [files, setFiles] = React.useState<LocalAttachment[]>([]);
  const [picker, setPicker] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState<string>('');
  const [senders, setSenders] = React.useState<Array<{ email: string; label: string; kind: string }>>([]);
  const [fromAddr, setFromAddr] = React.useState('');

  React.useEffect(() => {
    fetch(`${host._base()}/api/mail/senders`, { headers: host._headers() })
      .then(r => (r.ok ? r.json() : { senders: [] }))
      .then(d => setSenders(d.senders || []))
      .catch(() => setSenders([]));
  }, []);

  const refreshHistory = (): void => {
    host._fetchJson(`${host._base()}/api/email-logs`).then(d => host.setState({ bentoLogs: d || [] })).catch(() => undefined);
  };
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const total = items.filter(i => i.mode === 'attach' && !i.is_folder).reduce((s, i) => s + i.size, 0)
    + files.reduce((s, f) => s + f.size, 0);
  const tooBig = total > MAX_TOTAL;

  const cmd = (name: string, value?: string): void => {
    if (bodyRef.current) bodyRef.current.focus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).execCommand(name, false, value);
  };

  const addLink = (): void => {
    const url = window.prompt('Link address (https://…)');
    if (url && /^https?:\/\//i.test(url.trim())) cmd('createLink', url.trim());
  };

  const addLocal = async (list: FileList | null): Promise<void> => {
    if (!list) return;
    const out: LocalAttachment[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      out.push({ id: `${f.name}-${f.size}-${Date.now()}-${i}`, name: f.name, size: f.size, content_type: f.type || 'application/octet-stream', content_b64: await readAsBase64(f) });
    }
    setFiles(prev => [...prev, ...out]);
  };

  const send = async (): Promise<void> => {
    if (busy) return;
    if (!to.length && !cc.length && !bcc.length) { setError('Add at least one recipient.'); return; }
    if (tooBig) { setError('Attachments are over 150 MB — switch some files to "Link".'); return; }
    if (!subject.trim() && !window.confirm('Send this message without a subject?')) return;
    setBusy(true); setError('');
    try {
      const r = await fetch(`${host._base()}/api/mail/send`, {
        method: 'POST',
        headers: host._headers(),
        body: JSON.stringify({
          to: to.map(p => p.email), cc: cc.map(p => p.email), bcc: bcc.map(p => p.email),
          subject: subject.trim(), body_html: bodyRef.current ? bodyRef.current.innerHTML : '',
          importance: important ? 'high' : 'normal',
          items: items.map(i => ({ drive_id: i.drive_id, item_id: i.item_id, name: i.name, is_folder: i.is_folder, mode: i.is_folder ? 'link' : i.mode })),
          local_files: files.map(f => ({ name: f.name, content_type: f.content_type, content_b64: f.content_b64 })),
          from_address: fromAddr || null,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.message || `Sending failed (${r.status}).`);
      setDone(data.sent_as === 'user'
        ? 'Sent from your mailbox — it is in your Outlook Sent Items.'
        : `Sent from ${data.from} (replies come to you).`);
      refreshHistory();
      window.setTimeout(props.onClose, 1800);
    } catch (e) {
      setError((e as Error).message || 'Sending failed.');
      refreshHistory();
    } finally {
      setBusy(false);
    }
  };

  const toolBtn = (icon: string, title: string, onClick: () => void): React.ReactElement => (
    <button type="button" title={title} aria-label={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className="compose-mail-modal-i14" style={{ borderRadius: 6, color: clay.text }}>
      <Icon iconName={icon} className="compose-mail-modal-i15" />
    </button>
  );

  const content = (
    <div data-vessel-theme={host.state.themeMode}
      className="compose-mail-modal-i16" style={{ position: 'fixed', zIndex: 100001, background: 'rgba(11,42,74,0.45)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <div role="dialog" aria-label="New message"
        className="compose-mail-modal-i17" style={{ maxWidth: '100%', background: clay.surface }}>
        {/* Header */}
        <div className="compose-mail-modal-i18" style={{ background: BRAND }}>
          <Icon iconName="Mail" className="compose-mail-modal-i19" />
          <div className="compose-mail-modal-i20">New message</div>
          <button type="button" onClick={props.onClose} aria-label="Close" className="compose-mail-modal-i21" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', borderRadius: 8 }}>
            <Icon iconName="Cancel" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="compose-mail-modal-i22" style={{ borderBottom: `1px solid ${LINE}` }}>
          <button type="button" onClick={() => void send()} disabled={busy || !!done}
            className="compose-mail-modal-i23" style={{ borderRadius: 8, background: BRAND, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            <Icon iconName="Send" /> {busy ? 'Sending…' : 'Send'}
          </button>
          <button type="button" onClick={() => setPicker(true)}
            className="compose-mail-modal-i24" style={{ borderRadius: 8, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }}>
            <Icon iconName="SharepointLogo" className="compose-mail-modal-i25" /> Attach from SharePoint
          </button>
          <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
            className="compose-mail-modal-i24" style={{ borderRadius: 8, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }}>
            <Icon iconName="Attach" /> From computer
          </button>
          <input ref={fileRef} type="file" multiple className="compose-mail-modal-i26" onChange={e => { void addLocal(e.target.files); e.target.value = ''; }} />
          <label className="compose-mail-modal-i27" style={{ color: important ? '#b91c1c' : clay.textMuted }}>
            <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} />
            <Icon iconName="Important" /> High importance
          </label>
        </div>

        {/* Addressing */}
        <div className="compose-mail-modal-i28" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="compose-mail-modal-i29" style={{ color: clay.textMuted }}>From</span>
          {senders.length > 1 ? (
            <select value={fromAddr} onChange={e => setFromAddr(e.target.value)} title="Send from your mailbox or an approved shared mailbox"
              className="compose-mail-modal-i30" style={{ borderRadius: 8, border: `1px solid ${LINE}`, background: clay.surface, color: clay.text }}>
              {senders.map(s => (
                <option key={s.email} value={s.kind === 'me' ? '' : s.email}>
                  {s.kind === 'me' ? `${host.props.userDisplayName || 'Me'} <${s.email}>` : `${s.email} (shared mailbox)`}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: clay.text }}>{host.props.userDisplayName || host.props.userEmail} <span style={{ color: clay.textMuted }}>&lt;{host.props.userEmail}&gt;</span></span>
          )}
        </div>
        <RecipientField host={host} label="To" values={to} onChange={setTo} autoFocus
          right={!showCc ? <button type="button" onClick={() => setShowCc(true)} className="compose-mail-modal-i31" style={{ color: clay.accent }}>Cc Bcc</button> : undefined} />
        {showCc && <RecipientField host={host} label="Cc" values={cc} onChange={setCc} />}
        {showCc && <RecipientField host={host} label="Bcc" values={bcc} onChange={setBcc} />}
        <div className="compose-mail-modal-i32" style={{ borderBottom: `1px solid ${LINE}` }}>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Add a subject" maxLength={900}
            className="compose-mail-modal-i33" style={{ width: '100%', color: clay.text }} />
        </div>

        {/* Attachments */}
        {(items.length > 0 || files.length > 0) && (
          <div className="compose-mail-modal-i34" style={{ borderBottom: `1px solid ${LINE}` }}>
            {items.map(it => {
              const fi = fileIcon(it.name, it.is_folder);
              return (
                <div key={it.drive_id + it.item_id} title={`${it.site_name} · ${it.name}`}
                  className="compose-mail-modal-i35" style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: clay.surfaceRaised }}>
                  <Icon iconName={fi.icon} className="compose-mail-modal-i19" style={{ color: fi.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="compose-mail-modal-i36" style={{ color: clay.text, maxWidth: 190 }}>{it.name}</div>
                    <div className="compose-mail-modal-i37" style={{ color: clay.textMuted }}>{it.is_folder ? 'Folder · shared as link' : `${formatSize(it.size)} · ${it.site_name}`}</div>
                  </div>
                  {!it.is_folder && (
                    <select value={it.mode} onChange={e => setItems(prev => prev.map(p => (p === it ? { ...p, mode: e.target.value as 'attach' | 'link' } : p)))}
                      title="Send a copy, or a SharePoint link" className="compose-mail-modal-i38" style={{ border: `1px solid ${LINE}`, borderRadius: 6, background: clay.surface, color: clay.text }}>
                      <option value="attach">Copy</option>
                      <option value="link">Link</option>
                    </select>
                  )}
                  <button type="button" aria-label={`Remove ${it.name}`} onClick={() => setItems(prev => prev.filter(p => p !== it))}
                    className="compose-mail-modal-i39" style={{ color: clay.textMuted }}><Icon iconName="Cancel" className="compose-mail-modal-i40" /></button>
                </div>
              );
            })}
            {files.map(f => {
              const fi = fileIcon(f.name, false);
              return (
                <div key={f.id} className="compose-mail-modal-i41" style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: clay.surfaceRaised }}>
                  <Icon iconName={fi.icon} className="compose-mail-modal-i19" style={{ color: fi.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="compose-mail-modal-i36" style={{ color: clay.text, maxWidth: 200 }}>{f.name}</div>
                    <div className="compose-mail-modal-i37" style={{ color: clay.textMuted }}>{formatSize(f.size)} · from computer</div>
                  </div>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(prev => prev.filter(p => p.id !== f.id))}
                    className="compose-mail-modal-i39" style={{ color: clay.textMuted }}><Icon iconName="Cancel" className="compose-mail-modal-i40" /></button>
                </div>
              );
            })}
            <div className="compose-mail-modal-i42" style={{ width: '100%', color: tooBig ? '#b91c1c' : clay.textMuted }}>
              {formatSize(total) || '0 B'} attached{tooBig ? ' — over the 150 MB limit, switch some files to "Link"' : ''}
            </div>
          </div>
        )}

        {/* Formatting */}
        <div className="compose-mail-modal-i43" style={{ borderBottom: `1px solid ${LINE}` }}>
          {toolBtn('Bold', 'Bold', () => cmd('bold'))}
          {toolBtn('Italic', 'Italic', () => cmd('italic'))}
          {toolBtn('Underline', 'Underline', () => cmd('underline'))}
          {toolBtn('BulletedList', 'Bulleted list', () => cmd('insertUnorderedList'))}
          {toolBtn('NumberedList', 'Numbered list', () => cmd('insertOrderedList'))}
          {toolBtn('Link', 'Insert link', addLink)}
          {toolBtn('ClearFormatting', 'Clear formatting', () => cmd('removeFormat'))}
        </div>

        {/* Body */}
        <div ref={bodyRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Message body"
          className="compose-mail-modal-i44" style={{ color: clay.text }} />

        {/* Status */}
        {(error || done) && (
          <div className="compose-mail-modal-i45" style={{ borderTop: `1px solid ${LINE}`, color: done ? '#15803d' : '#b91c1c', background: done ? '#ecfdf5' : '#fef2f2' }}>
            <Icon iconName={done ? 'CompletedSolid' : 'ErrorBadge'} /> {done || error}
          </div>
        )}

        {picker && (
          <SharePointPicker host={host} onClose={() => setPicker(false)}
            onAdd={picked => setItems(prev => {
              const have = new Set(prev.map(p => p.drive_id + p.item_id));
              return [...prev, ...picked.filter(p => !have.has(p.drive_id + p.item_id))];
            })} />
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? ReactDOM.createPortal(content, document.body) : content;
}
