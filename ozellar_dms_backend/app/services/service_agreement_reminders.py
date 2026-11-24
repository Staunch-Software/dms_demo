"""Service agreement reminder emails (daily job).

For every contract that is not terminated and has an expiry date:
  * from its Reminder Date (expiry - notice period, or 60 days) -> one "expiring soon" mail
  * after the Current Expiry Date has passed                    -> one "expired" mail

Mails go to the Contract Owner / PIC (or whoever created the contract when no owner is set),
sent from the same mailbox the certificate emails use (email_automation.send_mail_graph).
Each mail is remembered against the expiry date it was sent for, so it is sent once; after a
renewal the expiry changes and the reminders start again. A failed send is retried next run.

Still to confirm with the client: other recipients (CC), and whether reminders should repeat.
"""
from __future__ import annotations

import html
import logging
from datetime import date
from typing import Any, Callable

from ..db import models
from ..db.base import SessionLocal

log = logging.getLogger(__name__)


def _send_default(to: str, subject: str, body_html: str) -> None:
    from ..email_automation import send_mail_graph

    send_mail_graph(to_address=to, subject=subject, body_html=body_html, attachments=[])


def _fmt(d: date | None) -> str:
    return d.strftime("%d %b %Y") if d else "-"


def _body(a: "models.ServiceAgreement", kind: str, reminder: date | None, today: date) -> str:
    e = lambda v: html.escape(str(v or "-"))  # noqa: E731
    days = (a.expiry_date - today).days if a.expiry_date else 0
    if kind == "expired":
        headline = f"This contract expired on {_fmt(a.expiry_date)}."
        colour = "#b91c1c"
    else:
        headline = f"This contract expires on {_fmt(a.expiry_date)} ({days} day{'s' if days != 1 else ''} left)."
        colour = "#b45309"
    second = next((p.name for p in a.parties if p.role == "second"), None) or a.vendor
    rows = [
        ("Contract No", a.contract_no),
        ("Contract Title", a.agreement_name),
        ("Second Party", second),
        ("Category", a.category),
        ("Business Unit", a.business_unit),
        ("Current Expiry", _fmt(a.expiry_date)),
        ("Notice Period", f"{a.notice_period_days} days" if a.notice_period_days is not None else "Not applicable"),
        ("Reminder Date", _fmt(reminder)),
        ("Auto-Renewal", "Yes" if a.auto_renewal else "No"),
    ]
    table = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#64748b;">{k}</td><td style="padding:4px 0;font-weight:600;">{e(v)}</td></tr>'
        for k, v in rows
    )
    link = (
        f'<p><a href="{html.escape(a.sharepoint_file_url)}">Open the contract file</a></p>'
        if a.sharepoint_file_url else ""
    )
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;">
      <p>Dear {e(a.owner_name or a.owner_email or a.created_by)},</p>
      <p style="color:{colour};font-weight:600;">{html.escape(headline)}</p>
      <table style="border-collapse:collapse;">{table}</table>
      {link}
      <p>Please renew or terminate it in Ozellar Marine DMS &rarr; Service Agreements.</p>
      <div style="border-top:1px solid #e2e8f0;margin-top:18px;padding-top:10px;font-size:12px;color:#94a3b8;">
        This reminder was sent automatically by Ozellar Marine DMS.
      </div>
    </div>
    """


def send_due_reminders(
    today: date | None = None,
    send: Callable[[str, str, str], None] | None = None,
    only_ids: set[int] | None = None,
) -> dict[str, Any]:
    """Send the reminder / expired mails that are due today. Returns a summary.
    `only_ids` limits the run to those agreements (used by tests)."""
    from ..service_agreements_api import reminder_date

    today = today or date.today()
    send = send or _send_default
    out: dict[str, Any] = {"reminders": 0, "expired": 0, "failed": 0, "no_recipient": 0}
    with SessionLocal() as db:
        query = db.query(models.ServiceAgreement).filter(
            models.ServiceAgreement.status != "terminated",
            models.ServiceAgreement.no_expiry.is_(False),
            models.ServiceAgreement.expiry_date.isnot(None),
        )
        if only_ids is not None:
            query = query.filter(models.ServiceAgreement.id.in_(only_ids))
        rows = query.all()
        for a in rows:
            rd = reminder_date(a)
            if a.expiry_date < today:
                if a.expired_notice_sent_for == a.expiry_date:
                    continue
                kind = "expired"
            elif rd and today >= rd:
                if a.reminder_sent_for == a.expiry_date:
                    continue
                kind = "reminder"
            else:
                continue

            to = (a.owner_email or a.created_by or "").strip()
            if not to:
                out["no_recipient"] += 1
                log.warning("[sa_reminders] %s has no owner or creator email; skipped", a.contract_no)
                continue
            subject = (
                f"Contract expired: {a.contract_no} - {a.agreement_name}" if kind == "expired"
                else f"Contract expiring on {_fmt(a.expiry_date)}: {a.contract_no} - {a.agreement_name}"
            )
            try:
                send(to, subject, _body(a, kind, rd, today))
            except Exception as exc:  # retried on the next run
                out["failed"] += 1
                log.error("[sa_reminders] Mail to %s for %s failed: %s", to, a.contract_no, exc)
                continue
            if kind == "expired":
                a.expired_notice_sent_for = a.expiry_date
                a.reminder_sent_for = a.expiry_date  # no "expiring" mail after the expired one
                out["expired"] += 1
            else:
                a.reminder_sent_for = a.expiry_date
                out["reminders"] += 1
            db.commit()
            log.info("[sa_reminders] %s mail sent to %s for %s", kind, to, a.contract_no)
    return out
