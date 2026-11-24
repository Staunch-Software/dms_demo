"""
Microsoft Graph integration: acquires an app-only token via client
credentials (msal) and sends mail through /users/{mailbox}/sendMail.
"""

import requests
import msal

from .config import settings

DEFAULT_SENDER_MAILBOX = "spe.admin@ozellarmarine.com"


def _get_sender_mailbox() -> str:
    sender = (getattr(settings, "graph_sender_mailbox", None) or DEFAULT_SENDER_MAILBOX).strip()
    return sender or DEFAULT_SENDER_MAILBOX


def _get_access_token() -> str:
    authority = f"{settings.graph_authority}/{settings.azure_tenant_id}"
    app = msal.ConfidentialClientApplication(
        client_id=settings.graph_client_id,
        client_credential=settings.graph_client_secret,
        authority=authority,
    )
    result = app.acquire_token_for_client(scopes=[settings.graph_scope])
    if "access_token" not in result:
        raise RuntimeError(
            f"Failed to acquire Graph token: "
            f"{result.get('error')} - {result.get('error_description')}"
        )
    return result["access_token"]


def send_mail(
    to_address: str,
    subject: str,
    body_html: str,
    attachments: list,
) -> None:
    """
    Sends an email via Microsoft Graph as GRAPH_SENDER_MAILBOX (defaults to spe.admin@ozellarmarine.com).
    attachments: list of dicts with filename, content_base64, content_type
    """
    token = _get_access_token()
    sender = _get_sender_mailbox()
    send_url = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"

    graph_attachments = [
        {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": a["filename"],
            "contentType": a.get("content_type", "application/octet-stream"),
            "contentBytes": a["content_base64"],
        }
        for a in attachments
    ]

    message = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html or ""},
            "toRecipients": [{"emailAddress": {"address": to_address}}],
            "attachments": graph_attachments,
        },
        "saveToSentItems": "true",
    }

    resp = requests.post(
        send_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=message,
        timeout=30,
    )

    if resp.status_code not in (200, 202):
        raise RuntimeError(
            f"Graph sendMail failed: {resp.status_code} - {resp.text}"
        )
