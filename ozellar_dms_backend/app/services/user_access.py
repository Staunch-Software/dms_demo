"""Helpers for the user-access flow: tenant lookup, login throttling, status messages."""
from __future__ import annotations

import re
import time
from collections import defaultdict, deque

import httpx
from fastapi import HTTPException

from ..config import settings
from ..graph.http import verify as graph_tls_verify

# user-facing messages, keyed by the `reason` the login endpoints return
MESSAGES = {
    "access_pending": "Your access request has been sent to the administrator. You will get an email when it is approved.",
    "access_denied": "Your access request was declined. Contact your administrator.",
    "account_disabled": "Your account is disabled. Contact your administrator.",
    "wrong_login_method_sso": "This account signs in with Microsoft. Use \"Sign in with Microsoft\".",
    "wrong_login_method_password": "This account signs in with a User ID and password. Use the password form.",
    "password_not_set": "Your password has not been set yet. Use the link in your invitation email.",
    "invalid_credentials": "Invalid email or password.",
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_login_email(raw: str | None) -> str:
    return (raw or "").strip().lower()


def looks_like_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(value or ""))


def reject(status_code: int, reason: str, message: str | None = None) -> HTTPException:
    return HTTPException(status_code, detail={"reason": reason, "message": message or MESSAGES.get(reason, reason)})


async def tenant_lookup(email: str) -> dict:
    """Confirm ``email`` belongs to the company tenant (member or guest) via Microsoft Graph.

    Strict: any failure to ask Microsoft raises, so an unverified address is never accepted.
    Returns the directory entry (id, displayName, mail, userPrincipalName, userType).
    """
    if not settings.graph_configured:
        raise HTTPException(503, "Microsoft is not configured on the server, so the tenant check cannot run.")
    safe = email.replace("'", "''")
    token_url = f"{settings.graph_authority}/{settings.azure_tenant_id}/oauth2/v2.0/token"
    try:
        async with httpx.AsyncClient(verify=graph_tls_verify(), timeout=15.0) as client:
            token_resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": settings.graph_client_id,
                    "client_secret": settings.graph_client_secret,
                    "scope": settings.graph_scope,
                },
            )
            if token_resp.status_code != 200:
                raise HTTPException(503, "Could not reach Microsoft to check the tenant. Try again.")
            app_token = token_resp.json().get("access_token", "")
            resp = await client.get(
                f"{settings.graph_base_url}/users",
                params={
                    "$filter": f"mail eq '{safe}' or userPrincipalName eq '{safe}' or otherMails/any(m:m eq '{safe}')",
                    "$select": "id,displayName,mail,userPrincipalName,userType",
                    "$top": "1",
                },
                headers={"Authorization": f"Bearer {app_token}", "ConsistencyLevel": "eventual"},
            )
    except HTTPException:
        raise
    except (httpx.TimeoutException, httpx.RequestError):
        raise HTTPException(503, "Could not reach Microsoft to check the tenant. Try again.")
    if resp.status_code != 200:
        raise HTTPException(503, f"Microsoft could not check this address (HTTP {resp.status_code}).")
    users = resp.json().get("value", [])
    if not users:
        raise HTTPException(400, "This email is not in your organisation's Microsoft tenant.")
    return users[0]


# ── brute-force throttle for the password form (per email + IP, in memory) ──────────────────────
_FAILS: dict[str, deque[float]] = defaultdict(deque)
_WINDOW_SECONDS = 600
_MAX_FAILS = 5


def _key(email: str, ip: str | None) -> str:
    return f"{email}|{ip or '-'}"


def throttle_check(email: str, ip: str | None) -> None:
    q = _FAILS[_key(email, ip)]
    cutoff = time.time() - _WINDOW_SECONDS
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= _MAX_FAILS:
        raise HTTPException(429, detail={"reason": "too_many_attempts", "message": "Too many failed attempts. Try again in 10 minutes."})


def throttle_fail(email: str, ip: str | None) -> None:
    _FAILS[_key(email, ip)].append(time.time())


def throttle_clear(email: str, ip: str | None) -> None:
    _FAILS.pop(_key(email, ip), None)
