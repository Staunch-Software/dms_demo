"""Identity verification helpers for Microsoft SSO.

The web part obtains a Microsoft Graph access token from SharePoint's own
Entra sign-in (``aadTokenProviderFactory``).  The backend never trusts an e-mail
address supplied by the browser; it proves identity by

1. sanity-checking the token's (unverified) claims — expiry, audience and
   tenant — to give clear errors and to reject tokens issued by another tenant,
2. calling Microsoft Graph ``/me`` with that token.  Graph validates the
   signature/issuer itself, so a forged or tampered token cannot succeed.

(A Graph-audience token cannot be signature-verified by a third party, so the
Graph ``/me`` round-trip *is* the trusted verification step.)

Development shortcuts (``mock-token``, header-only identity, e-mail-only
login) are gated behind :func:`insecure_dev_auth_enabled`, which requires BOTH
``APP_ENV=local`` and ``ALLOW_INSECURE_DEV_AUTH=true``.
"""
from __future__ import annotations

import base64
import json
import time
from contextvars import ContextVar
from functools import lru_cache

import httpx
from fastapi import HTTPException

from ..config import _RawEnv, settings
from ..graph.http import verify as graph_tls_verify

# Email of the user whose server-side session was validated for the current
# request (set by ``require_session``).  Authorization checks read this — never
# a client-supplied header.
AUTH_EMAIL: ContextVar[str | None] = ContextVar("auth_email", default=None)

_GRAPH_AUDIENCES = {
    "https://graph.microsoft.com",
    "https://graph.microsoft.com/",
    "00000003-0000-0000-c000-000000000000",
}
_TRUTHY = {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def _raw() -> _RawEnv:
    return _RawEnv()


def _flag(name: str) -> bool:
    return str(getattr(_raw(), name, "") or "").strip().lower() in _TRUTHY


def insecure_dev_auth_enabled() -> bool:
    """True only for an explicit local developer opt-in (never dev/prod)."""
    return (_raw().app_env or "").strip().lower() == "local" and _flag("allow_insecure_dev_auth")


def password_login_enabled() -> bool:
    return insecure_dev_auth_enabled() or _flag("enable_password_login")


def unverified_claims(token: str) -> dict:
    """Decode a JWT payload WITHOUT verifying it. Returns {} if not a JWT."""
    parts = (token or "").split(".")
    if len(parts) != 3:
        return {}
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def precheck_token(token: str) -> None:
    """Reject obviously unusable tokens before spending a Graph call."""
    if not token or not token.strip():
        raise HTTPException(401, detail={"reason": "missing_token", "message": "Access token required."})
    claims = unverified_claims(token)
    if not claims:
        return  # opaque token — Graph /me decides
    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and exp < time.time():
        raise HTTPException(401, detail={"reason": "token_expired", "message": "Microsoft access token expired. Please sign in again."})
    aud = claims.get("aud")
    if aud and str(aud).rstrip("/") not in {a.rstrip("/") for a in _GRAPH_AUDIENCES}:
        raise HTTPException(401, detail={"reason": "wrong_audience", "message": "Access token was not issued for Microsoft Graph."})
    tenant = (settings.azure_tenant_id or "").strip().lower()
    tid = str(claims.get("tid") or "").strip().lower()
    if tenant and tid and tid != tenant:
        raise HTTPException(401, detail={"reason": "wrong_tenant", "message": "Token was issued by a different tenant."})


async def verify_graph_identity(access_token: str) -> dict:
    """Return the Graph ``/me`` profile for ``access_token`` or raise 401/503."""
    precheck_token(access_token)
    try:
        async with httpx.AsyncClient(verify=graph_tls_verify(), timeout=15.0) as client:
            resp = await client.get(
                f"{settings.graph_base_url}/me",
                params={
                    "$select": (
                        "id,displayName,givenName,surname,mail,userPrincipalName,"
                        "jobTitle,department,mobilePhone,businessPhones,"
                        "officeLocation,companyName,employeeId"
                    )
                },
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except (httpx.TimeoutException, httpx.RequestError):
        raise HTTPException(503, "Authentication service is temporarily unavailable. Please try again.")
    if resp.status_code != 200:
        raise HTTPException(401, detail={"reason": "token_invalid", "message": "Token validation failed."})
    me = resp.json()
    if not (me.get("mail") or me.get("userPrincipalName")):
        raise HTTPException(401, detail={"reason": "token_invalid", "message": "Token has no usable identity."})
    return me
