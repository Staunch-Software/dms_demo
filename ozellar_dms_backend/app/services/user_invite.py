"""Invite / access emails for Vessel DMS users.

* :func:`send_user_invite` — welcome email to a user an admin created or granted.
  SSO users get "click Sign in with Microsoft"; PASSWORD users get their user ID and
  a one-time "set your password" link (never a password).
* :func:`notify_admins_access_request` — tells the ADMIN_EMAILS list that someone
  from the tenant asked for access.

Mail goes out through Microsoft Graph as the configured sender mailbox
(``GRAPH_SENDER_MAILBOX``, needs the Mail.Send *application* permission).  Failures
are returned/recorded, never swallowed, so the UI can show them.
"""
from __future__ import annotations

import asyncio
import html
import json
import logging
from datetime import datetime
from urllib.parse import quote

from ..config import settings

log = logging.getLogger(__name__)

DEFAULT_APP_PAGE_URL = "https://{tenant}.sharepoint.com/sites/OzellarDMS"


def app_page_url() -> str:
    from .auth_guard import _raw
    url = str(getattr(_raw(), "app_page_url", "") or "").strip()
    return (url or DEFAULT_APP_PAGE_URL).rstrip("/")


def set_password_link(token: str) -> str:
    base = app_page_url()
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}vdms_setpw={quote(token)}"


def _json_list(raw: str | None) -> list[str] | None:
    if raw is None:
        return None
    try:
        value = json.loads(raw)
    except Exception:
        return None
    return [str(v) for v in value] if isinstance(value, list) else None


def _permission_rows(user) -> list[tuple[str, str]]:
    modules = _json_list(getattr(user, "allowed_modules", None))
    tabs = _json_list(getattr(user, "allowed_settings_tabs", None))
    vessels = _json_list(getattr(user, "assigned_vessels", None))
    return [
        ("Role", user.role or "User"),
        ("Modules", ", ".join(modules) if modules else "All modules" if modules is None else "None"),
        ("Settings tabs", ", ".join(tabs) if tabs else "All tabs" if tabs is None else "None"),
        ("Vessels", ", ".join(vessels) if vessels else "All vessels" if vessels is None else "None"),
        ("Can approve certificates", "Yes" if getattr(user, "can_approve_certificates", False) else "No"),
    ]


def _shell(title: str, body_html: str) -> str:
    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">'
        f'<h2 style="color:#0e7490;margin:0 0 12px">{html.escape(title)}</h2>{body_html}'
        '<p style="color:#64748b;font-size:12px;margin-top:24px">Ozellar Marine Vessel DMS. '
        "This is an automated message; please do not reply.</p></div>"
    )


def _button(url: str, label: str) -> str:
    return (
        f'<p style="margin:20px 0"><a href="{html.escape(url, quote=True)}" '
        'style="background:#0e7490;color:#ffffff;padding:11px 20px;border-radius:8px;'
        f'text-decoration:none;font-weight:600">{html.escape(label)}</a></p>'
    )


def build_invite_email(user, set_password_token: str | None = None) -> tuple[str, str]:
    name = html.escape(user.display_name or user.email)
    rows = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#475569">{html.escape(k)}</td>'
        f'<td style="padding:4px 0;font-weight:600">{html.escape(v)}</td></tr>'
        for k, v in _permission_rows(user)
    )
    perms = f'<table style="border-collapse:collapse;font-size:14px;margin:12px 0">{rows}</table>'
    page = app_page_url()
    if (user.login_method or "SSO").upper() == "PASSWORD":
        link = set_password_link(set_password_token) if set_password_token else page
        steps = (
            f"<p>Your User ID is <b>{html.escape(user.email)}</b>.</p>"
            "<p>Choose your password using the button below. The link works once and expires in 24 hours. "
            "No password is sent by email.</p>"
            + _button(link, "Set your password")
            + f'<p style="font-size:13px;color:#475569">After that, open <a href="{html.escape(page, quote=True)}">'
            "Vessel DMS</a> and sign in with your User ID and password.</p>"
        )
    else:
        steps = (
            "<p>You sign in with your Microsoft account. You do not need a password.</p>"
            + _button(page, "Open Vessel DMS")
            + '<p style="font-size:13px;color:#475569">On the sign-in screen, choose '
            "<b>Sign in with Microsoft</b>.</p>"
        )
    body = f"<p>Hello {name},</p><p>You have been given access to Vessel DMS.</p>{perms}{steps}"
    return "You now have access to Vessel DMS", _shell("Welcome to Vessel DMS", body)


def _send_sync(to_address: str, subject: str, body_html: str) -> None:
    from ..graph_client import send_mail
    send_mail(to_address, subject, body_html, [])


async def send_email(to_address: str, subject: str, body_html: str) -> str | None:
    """Send one email. Returns None on success, or a readable error message."""
    try:
        await asyncio.to_thread(_send_sync, to_address, subject, body_html)
        return None
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI by the caller
        msg = str(exc)
        log.warning("Email to %s failed: %s", to_address, msg)
        if "ErrorAccessDenied" in msg or "403" in msg:
            msg = (
                "The sender mailbox is not allowed to send. Check that GRAPH_SENDER_MAILBOX is a real "
                "Exchange mailbox and the app has the Mail.Send application permission with admin consent. "
                f"({msg[:200]})"
            )
        elif "MailboxNotEnabledForRESTAPI" in msg or "MailboxNotFound" in msg or "404" in msg:
            msg = f"The sender mailbox has no Exchange mailbox. ({msg[:200]})"
        return msg[:500]


async def send_user_invite(db, user, set_password_token: str | None = None) -> str | None:
    """Send the welcome email and record the outcome on the row. Returns the error, if any."""
    subject, body = build_invite_email(user, set_password_token)
    error = await send_email(user.email, subject, body)
    user.invited_at = datetime.utcnow() if error is None else user.invited_at
    user.invite_error = error
    db.commit()
    return error


async def notify_admins_access_request(name: str, email: str) -> None:
    recipients = sorted(settings.admin_email_set)
    if not recipients:
        return
    body = _shell(
        "New access request",
        f"<p><b>{html.escape(name or email)}</b> ({html.escape(email)}) signed in with Microsoft and asked "
        "for access to Vessel DMS.</p><p>Open User Management, then Access Requests, to grant or deny.</p>"
        + _button(app_page_url(), "Open Vessel DMS"),
    )
    subject = f"New access request: {name or email}, {email}"
    for to in recipients:
        err = await send_email(to, subject, body)
        if err:
            log.warning("Access-request email to admin %s failed: %s", to, err)
