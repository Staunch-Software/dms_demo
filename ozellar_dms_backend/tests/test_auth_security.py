"""Authentication hardening tests (no real Microsoft tenant / database needed).

These cover the server-side guarantees only: a session is never created or
accepted from a browser-supplied e-mail, mock tokens are rejected, tokens for the
wrong audience/tenant or expired tokens are rejected, and admin identity comes
from the validated session rather than headers.  They do NOT prove end-to-end
Microsoft sign-in — that needs a real tenant (see the manual verification guide).
"""
import base64
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, PropertyMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main as app_main
from app.config import Settings
from app.services import auth_guard


def _jwt(claims: dict) -> str:
    def b64(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{b64({'alg': 'RS256'})}.{b64(claims)}.sig"


class _FakeDb:
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def commit(self): pass
    def close(self): pass


def _session(email: str):
    return SimpleNamespace(email=email, last_activity=None)


class AuthSecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_main.app, raise_server_exceptions=False)
        self._patches = [
            patch.object(auth_guard, "insecure_dev_auth_enabled", return_value=False),
            patch.object(auth_guard, "password_login_enabled", return_value=False),
            patch.object(Settings, "db_configured", new_callable=PropertyMock, return_value=True),
            patch.object(Settings, "admin_email_set", new_callable=PropertyMock, return_value={"admin@corp.com"}),
            patch("app.db.base.SessionLocal", lambda: _FakeDb()),
        ]
        for p in self._patches:
            p.start()
            self.addCleanup(p.stop)

    def _validate(self, result):
        p = patch("app.services.session_service.validate_session", return_value=result)
        p.start()
        self.addCleanup(p.stop)

    # ── require_session ────────────────────────────────────────────────────────
    def test_protected_endpoint_without_token_is_401(self):
        r = self.client.get("/api/alerts", headers={"X-User-Email": "admin@corp.com"})
        self.assertEqual(r.status_code, 401)

    def test_email_header_or_query_alone_never_authenticates(self):
        for kwargs in ({"headers": {"X-User-Email": "admin@corp.com"}}, {"params": {"admin": "admin@corp.com", "user_email": "admin@corp.com"}}):
            self.assertEqual(self.client.get("/api/sessions", **kwargs).status_code, 401)

    def test_mock_and_dev_tokens_rejected(self):
        self._validate((None, "not_found"))
        for tok in ("mock-token", "dev-token", "mock-anything"):
            r = self.client.get("/api/sessions", headers={"X-Session-ID": tok, "X-User-Email": "admin@corp.com"})
            self.assertEqual(r.status_code, 401, tok)

    def test_expired_and_revoked_sessions_rejected(self):
        for reason in ("expired", "logged_out", "revoked"):
            self._validate((None, reason))
            r = self.client.get("/api/sessions", headers={"X-Session-ID": "abc"})
            self.assertEqual(r.status_code, 401)
            self.assertEqual(r.json()["detail"]["reason"], reason)

    def test_db_error_fails_closed(self):
        with patch("app.services.session_service.validate_session", side_effect=RuntimeError("db down")):
            r = self.client.get("/api/sessions", headers={"X-Session-ID": "abc"})
        self.assertEqual(r.status_code, 503)

    # ── admin / impersonation ──────────────────────────────────────────────────
    def test_changing_email_header_cannot_become_admin(self):
        self._validate((_session("user@corp.com"), None))
        r = self.client.get(
            "/api/admin/site-configuration",
            headers={"X-Session-ID": "abc", "X-User-Email": "admin@corp.com"},
        )
        self.assertEqual(r.status_code, 403)

    def test_sessions_list_uses_session_identity_not_header(self):
        self._validate((_session("user@corp.com"), None))
        seen = {}

        def fake_list(db, email):
            seen["email"] = email
            return []

        with patch("app.services.session_service.list_user_sessions", side_effect=fake_list):
            r = self.client.get("/api/sessions", headers={"X-Session-ID": "abc", "X-User-Email": "victim@corp.com"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(seen["email"], "user@corp.com")

    def test_admin_session_passes_admin_check(self):
        token = auth_guard.AUTH_EMAIL.set("admin@corp.com")
        try:
            self.assertEqual(app_main._require_admin(None), "admin@corp.com")
        finally:
            auth_guard.AUTH_EMAIL.reset(token)
        with self.assertRaises(HTTPException) as ctx:
            app_main._require_admin("admin@corp.com")  # header alone is not identity
        self.assertEqual(ctx.exception.status_code, 403)

    # ── login routes ───────────────────────────────────────────────────────────
    def test_bypass_login_with_email_only_is_rejected(self):
        r = self.client.post("/api/auth/bypass-login", json={"email": "admin@corp.com"})
        self.assertEqual(r.status_code, 401)

    def test_bypass_login_ignores_email_when_token_invalid(self):
        with patch.object(auth_guard, "verify_graph_identity", AsyncMock(side_effect=HTTPException(401, "bad"))):
            r = self.client.post("/api/auth/bypass-login", json={"email": "admin@corp.com", "access_token": "x"})
        self.assertEqual(r.status_code, 401)

    def test_login_rejects_mock_token(self):
        r = self.client.post("/api/auth/login", json={"access_token": "mock-token"})
        self.assertEqual(r.status_code, 401)

    # Password sign-in is allowed again, but only for users whose login method is PASSWORD
    # (see tests/test_user_access.py for the password-form rules).


class VerifyGraphIdentityTests(unittest.IsolatedAsyncioTestCase):
    GRAPH_AUD = "https://graph.microsoft.com"

    def _tenant(self):
        fake = SimpleNamespace(azure_tenant_id="tenant-1", graph_base_url="https://graph.microsoft.com/v1.0")
        return patch.object(auth_guard, "settings", fake)

    def _claims(self, **over):
        c = {"aud": self.GRAPH_AUD, "tid": "tenant-1", "exp": time.time() + 600}
        c.update(over)
        return c

    async def _expect_401(self, token, reason):
        with self._tenant():
            with self.assertRaises(HTTPException) as ctx:
                await auth_guard.verify_graph_identity(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail["reason"], reason)

    async def test_expired_token(self):
        await self._expect_401(_jwt(self._claims(exp=time.time() - 5)), "token_expired")

    async def test_wrong_audience(self):
        await self._expect_401(_jwt(self._claims(aud="api://something-else")), "wrong_audience")

    async def test_wrong_tenant(self):
        await self._expect_401(_jwt(self._claims(tid="other-tenant")), "wrong_tenant")

    async def test_empty_token(self):
        await self._expect_401("", "missing_token")

    async def _graph(self, status, body=None):
        resp = SimpleNamespace(status_code=status, json=lambda: body or {})

        class _Client:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, *a, **k): return resp

        return patch("app.services.auth_guard.httpx.AsyncClient", _Client)

    async def test_graph_rejects_token(self):
        with self._tenant(), await self._graph(401):
            with self.assertRaises(HTTPException) as ctx:
                await auth_guard.verify_graph_identity(_jwt(self._claims()))
        self.assertEqual(ctx.exception.status_code, 401)

    async def test_valid_token_returns_graph_identity(self):
        me = {"id": "oid-1", "mail": "User@Corp.com", "userPrincipalName": "user@corp.com"}
        with self._tenant(), await self._graph(200, me):
            got = await auth_guard.verify_graph_identity(_jwt(self._claims()))
        self.assertEqual(got["id"], "oid-1")


if __name__ == "__main__":
    unittest.main()
