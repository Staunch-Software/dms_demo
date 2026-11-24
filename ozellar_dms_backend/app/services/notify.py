"""Best-effort notifications for the approval workflow.

Always logs the notification (so there's an audit trail even without email
configured). Additionally attempts a real email via Graph's application-only
`sendMail` when `settings.notify_sender_email` is set — this requires the
Mail.Send application permission, which is NOT part of the Graph permission
set documented in docs/SETUP.md, so it's opt-in rather than assumed. A failure
here is always caught and logged; it must never block the approve/reject
transaction it's called from.
"""
import logging

from ..config import settings

logger = logging.getLogger("vessel_dms.notify")


async def notify_email(to: str, subject: str, body: str) -> None:
    logger.info("NOTIFY -> %s | %s | %s", to, subject, body)

    sender = (getattr(settings, "notify_sender_email", None) or getattr(settings, "graph_sender_mailbox", None) or "spe.admin@ozellarmarine.com").strip()
    if not (settings.graph_configured and sender):
        return  # stub mode, or no sender mailbox configured yet — log only

    try:
        from ..graph.client import graph

        await graph().post(
            f"/users/{sender}/sendMail",
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "Text", "content": body},
                    "toRecipients": [{"emailAddress": {"address": to}}],
                },
                "saveToSentItems": False,
            },
        )
    except Exception:
        logger.exception("Failed to send notification email to %s", to)
