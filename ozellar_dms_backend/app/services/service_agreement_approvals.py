"""Email approval gate for Service Agreements.

A save that would make a contract Active (new contract, edit, or renewal) instead sets the
agreement's status to `pending_approval` and emails the Contract Owner / PIC a one-click
Approve / Reject link (no login required, same shape as the certificates module's approval
emails). The link's token is a random `secrets.token_urlsafe(32)` value: only its SHA-256 hash
is stored on the agreement, it carries a real expiry (`APPROVAL_TOKEN_TTL_DAYS`), and it is
cleared the instant it is used, so it is genuinely single-use (stronger than the certificates
module's non-expiring HMAC link).

Reject behaviour:
  * activation (new/edited contract) -> status reverts to "draft", reason stored.
  * renewal -> the renewal was already applied when submitted (new dates, moved documents);
    rejecting rolls the agreement back to the ServiceAgreementHistory snapshot taken at
    submit time, reversing the document moves too. See service_agreements_api.py's
    `/decision` endpoint for the actual state transitions; this module only builds and
    sends the request email and the hashed token.
"""
from __future__ import annotations

import hashlib
import html
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Callable
from urllib.parse import quote

from ..config import settings
from ..db import models

log = logging.getLogger(__name__)

APPROVAL_TOKEN_TTL_DAYS = 14

# Placeholder "sender" values that show up in .env / app/config.py's own fallbacks when no
# real mailbox has been configured — none of these exist in any tenant, so treat them the
# same as "not configured" rather than attempting (and failing) a Graph send with one.
_UNCONFIGURED_SENDER_PLACEHOLDERS = {"spe.admin@ozellarmarine.com", "dummy@ozellarmarine.com", "dummmy@ozellarmarine.com"}


def new_approval_token() -> tuple[str, str, datetime]:
    """Returns (raw token for the email link, its sha256 hash to store, expiry)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token), datetime.utcnow() + timedelta(days=APPROVAL_TOKEN_TTL_DAYS)


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def _send_default(to: str, subject: str, body_html: str) -> None:
    from ..email_automation import send_mail_graph

    send_mail_graph(to_address=to, subject=subject, body_html=body_html, attachments=[])


def _fmt(d: date | None) -> str:
    return d.strftime("%d %b %Y") if d else "-"


def _decision_links(agreement_id: int, token: str) -> tuple[str, str]:
    base = (getattr(settings, "backend_public_url", "") or "").rstrip("/") or "http://localhost:8000"
    path = f"{base}/api/service-agreements/{agreement_id}/decision"
    tok = quote(token)
    return f"{path}?action=approve&token={tok}", f"{path}?action=reject&token={tok}"


def _body(a: "models.ServiceAgreement", kind: str, approve_url: str, reject_url: str) -> str:
    e = lambda v: html.escape(str(v or "-"))  # noqa: E731
    second = next((p.name for p in a.parties if p.role == "second"), None) or a.vendor
    if kind == "renewal":
        headline = "This contract has been renewed and is waiting for your approval."
        rows = [
            ("Contract No", a.contract_no),
            ("Contract Title", a.agreement_name),
            ("Second Party", second),
            ("New Effective Date", _fmt(a.issue_date)),
            ("New Expiry Date", "No Expiry / Perpetual" if a.no_expiry else _fmt(a.expiry_date)),
        ]
    else:
        headline = "A contract is waiting for your approval before it becomes Active."
        rows = [
            ("Contract No", a.contract_no),
            ("Contract Title", a.agreement_name),
            ("Category", a.category),
            ("Business Unit", a.business_unit),
            ("Second Party", second),
            ("Effective Date", _fmt(a.issue_date)),
            ("Expiry Date", "No Expiry / Perpetual" if a.no_expiry else _fmt(a.expiry_date)),
        ]
    table = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#64748b;">{k}</td><td style="padding:4px 0;font-weight:600;">{e(v)}</td></tr>'
        for k, v in rows
    )
    btn = "display:inline-block;padding:10px 22px;border-radius:6px;color:#fff;text-decoration:none;font-weight:600;margin-right:10px;"
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;">
      <p>Dear {e(a.owner_name or a.owner_email)},</p>
      <p style="font-weight:600;">{headline}</p>
      <table style="border-collapse:collapse;">{table}</table>
      <p style="margin-top:20px;">
        <a href="{approve_url}" style="{btn}background:#16a34a;">Approve</a>
        <a href="{reject_url}" style="{btn}background:#dc2626;">Reject</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;">This link does not require you to sign in, and can only be used once.</p>
      <div style="border-top:1px solid #e2e8f0;margin-top:18px;padding-top:10px;font-size:12px;color:#94a3b8;">
        Sent automatically by Ozellar Marine DMS.
      </div>
    </div>
    """


def send_approval_request(
    a: "models.ServiceAgreement",
    kind: str,
    token: str,
    send: Callable[[str, str, str], None] | None = None,
) -> bool:
    """Emails the Contract Owner / PIC the Approve/Reject links for this pending decision.
    Returns True if the email was handed off successfully, False if there was no recipient.
    Raises on a genuine send failure (caller decides whether that should block the save)."""
    send = send or _send_default
    to = (a.owner_email or "").strip()
    if not to:
        log.warning("[sa_approvals] %s has no owner email; approval request not sent", a.contract_no)
        return False
    sender = (
        (getattr(settings, "cert_automation_sender_email", "") or "").strip()
        or (getattr(settings, "graph_sender_mailbox", "") or "").strip()
    ).lower()
    if not sender or sender in _UNCONFIGURED_SENDER_PLACEHOLDERS:
        log.warning(
            "[sa_approvals] no real sender mailbox configured (GRAPH_SENDER_MAILBOX / "
            "CERT_AUTOMATION_SENDER_EMAIL); approval email for %s not sent", a.contract_no,
        )
        return False
    approve_url, reject_url = _decision_links(a.id, token)
    subject = (
        f"Approval needed: renewal of {a.contract_no} - {a.agreement_name}" if kind == "renewal"
        else f"Approval needed: {a.contract_no} - {a.agreement_name}"
    )
    send(to, subject, _body(a, kind, approve_url, reject_url))
    log.info("[sa_approvals] %s request sent to %s for %s", kind, to, a.contract_no)
    return True


def render_decision_page(title: str, message: str, tone: str = "success") -> str:
    """tone: success | danger | error | info"""
    color = "#16a34a" if tone == "success" else ("#dc2626" if tone in ("danger", "error") else "#0284c7")
    icon = "&#10003;" if tone == "success" else ("&#10005;" if tone in ("danger", "error") else "&#8505;")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)} - Ozellar Marine DMS</title>
<style>
  body {{ margin:0; padding:24px; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
          color:#0f172a; display:flex; align-items:center; justify-content:center; min-height:100vh; box-sizing:border-box; }}
  .card {{ background:#fff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 10px 25px -5px rgba(0,0,0,.08);
           max-width:480px; width:100%; overflow:hidden; }}
  .header {{ background:{color}; padding:20px 24px; color:#fff; display:flex; align-items:center; gap:14px; }}
  .icon-badge {{ width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,.22); display:flex;
                 align-items:center; justify-content:center; font-size:18px; font-weight:bold; flex-shrink:0; }}
  .header h1 {{ margin:0; font-size:16px; font-weight:700; }}
  .body {{ padding:22px 24px; font-size:14px; line-height:1.6; }}
</style>
</head>
<body>
  <div class="card">
    <div class="header"><div class="icon-badge">{icon}</div><h1>{html.escape(title)}</h1></div>
    <div class="body"><p>{html.escape(message)}</p></div>
  </div>
</body>
</html>"""
