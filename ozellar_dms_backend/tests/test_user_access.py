"""User access flow: SSO requires an existing User Management row, access requests,
grant / deny, invite emails, PASSWORD users and the set-password link.

Runs against an in-memory SQLite database; Microsoft Graph and email sending are mocked.
"""
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, PropertyMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main as app_main
from app.config import Settings
from app.db import models
from app.services import auth_guard, passwords, user_access

ADMIN = "admin@corp.com"


def _me(email, name="New Person", oid="oid-1"):
    return {"id": oid, "mail": email, "userPrincipalName": email, "displayName": name,
            "givenName": "New", "surname": "Person"}


class UserAccessTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        models.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, expire_on_commit=False)
        self.client = TestClient(app_main.app, raise_server_exceptions=False)
        self.sent: list[tuple[str, str, str]] = []

        async def fake_send(to, subject, body):
            self.sent.append((to, subject, body))
            return None

        self.send_mock = AsyncMock(side_effect=fake_send)
        user_access._FAILS.clear()
        patches = [
            patch.object(auth_guard, "insecure_dev_auth_enabled", return_value=False),
            patch.object(Settings, "db_configured", new_callable=PropertyMock, return_value=True),
            patch.object(Settings, "graph_configured", new_callable=PropertyMock, return_value=True),
            patch.object(Settings, "admin_email_set", new_callable=PropertyMock, return_value={ADMIN}),
            patch("app.db.base.SessionLocal", self.Session),
            patch("app.services.user_invite.send_email", self.send_mock),
            patch("app.services.user_access.tenant_lookup", AsyncMock(return_value={"id": "oid-9", "displayName": "From Tenant"})),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    # ── helpers ────────────────────────────────────────────────────────────────
    def _sso(self, email, name="New Person"):
        with patch.object(auth_guard, "verify_graph_identity", AsyncMock(return_value=_me(email, name))):
            return self.client.post("/api/auth/login", json={"access_token": "tok"})

    def _add_user(self, email, **kw):
        defaults = dict(display_name=email.split("@")[0], role="User", login_method="SSO", status="ACTIVE", is_active=True)
        defaults.update(kw)
        with self.Session() as db:
            db.add(models.UserProfile(email=email, **defaults))
            db.commit()

    def _row(self, email):
        with self.Session() as db:
            return db.query(models.UserProfile).filter_by(email=email).one_or_none()

    def _admin_headers(self):
        from app.services.session_service import create_session
        self._add_user(ADMIN, role="Admin")
        with self.Session() as db:
            sess = create_session(db, ADMIN, "test-agent", "127.0.0.1")
            return {"X-Session-ID": sess.session_id}

    # ── SSO: unknown tenant user -> PENDING access request ─────────────────────
    def test_unknown_tenant_user_becomes_pending_request_and_is_not_logged_in(self):
        r = self._sso("new@corp.com")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["detail"]["reason"], "access_pending")
        row = self._row("new@corp.com")
        self.assertEqual((row.status, row.role, row.login_method, row.is_active), ("PENDING", "User", "SSO", False))
        with self.Session() as db:
            self.assertEqual(db.query(models.UserSession).count(), 0)
            self.assertEqual(db.query(models.ActivityLog).filter_by(action="access_request").count(), 1)
        self.assertEqual([m[0] for m in self.sent], [ADMIN])  # admins are emailed
        self.assertIn("New access request", self.sent[0][1])

    def test_pending_user_trying_again_creates_no_duplicate_and_no_new_email(self):
        self._sso("new@corp.com")
        r = self._sso("new@corp.com")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()["detail"]["reason"], "access_pending")
        with self.Session() as db:
            self.assertEqual(db.query(models.UserProfile).filter_by(email="new@corp.com").count(), 1)
            self.assertEqual(db.query(models.ActivityLog).filter_by(action="access_request").count(), 1)
        self.assertEqual(len(self.sent), 1)

    def test_out_of_tenant_token_is_rejected_and_creates_nothing(self):
        err = HTTPException(401, detail={"reason": "wrong_tenant", "message": "Token was issued by a different tenant."})
        with patch.object(auth_guard, "verify_graph_identity", AsyncMock(side_effect=err)):
            r = self.client.post("/api/auth/login", json={"access_token": "tok"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()["detail"]["reason"], "wrong_tenant")
        self.assertIsNone(self._row("new@corp.com"))
        self.assertEqual(self.sent, [])

    def test_active_sso_user_logs_in_and_keeps_admin_set_role(self):
        self._add_user("user@corp.com", role="User")
        r = self._sso("user@corp.com")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["session_id"])
        self.assertEqual(self._row("user@corp.com").role, "User")

    def test_inactive_and_disabled_users_are_refused(self):
        self._add_user("off@corp.com", status="DISABLED", is_active=False)
        r = self._sso("off@corp.com")
        self.assertEqual((r.status_code, r.json()["detail"]["reason"]), (403, "account_disabled"))

    def test_password_user_cannot_use_sso(self):
        self._add_user("pw@corp.com", login_method="PASSWORD")
        r = self._sso("pw@corp.com")
        self.assertEqual((r.status_code, r.json()["detail"]["reason"]), (403, "wrong_login_method_password"))

    def test_admin_email_can_sign_in_without_being_created(self):
        r = self._sso(ADMIN, "The Admin")
        self.assertEqual(r.status_code, 200, r.text)
        row = self._row(ADMIN)
        self.assertEqual((row.role, row.status), ("Admin", "ACTIVE"))

    # ── password form ──────────────────────────────────────────────────────────
    def test_sso_user_cannot_use_password_form(self):
        self._add_user("sso@corp.com", login_method="SSO", password_hash=passwords.hash_password("Secret123!"))
        r = self.client.post("/api/auth/password-login", json={"email": "sso@corp.com", "password": "Secret123!"})
        self.assertEqual((r.status_code, r.json()["detail"]["reason"]), (403, "wrong_login_method_sso"))

    def test_password_form_never_creates_accounts_or_sets_first_password(self):
        r = self.client.post("/api/auth/password-login", json={"email": "ghost@corp.com", "password": "Whatever1"})
        self.assertEqual(r.status_code, 401)
        self.assertIsNone(self._row("ghost@corp.com"))
        r = self.client.post("/api/auth/password-login", json={"email": ADMIN, "password": "Whatever1"})
        self.assertEqual(r.status_code, 401)  # no admin auto-provisioning, no demo accounts
        self._add_user("nopw@corp.com", login_method="PASSWORD")
        r = self.client.post("/api/auth/password-login", json={"email": "nopw@corp.com", "password": "Whatever1"})
        self.assertEqual((r.status_code, r.json()["detail"]["reason"]), (403, "password_not_set"))
        self.assertIsNone(self._row("nopw@corp.com").password_hash)

    def test_password_login_works_for_password_user_and_upgrades_legacy_hash(self):
        import hashlib
        self._add_user("pw@corp.com", login_method="PASSWORD",
                       password_hash=hashlib.sha256(b"OldPass123").hexdigest())
        bad = self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": "nope"})
        self.assertEqual(bad.status_code, 401)
        ok = self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": "OldPass123"})
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertTrue(self._row("pw@corp.com").password_hash.startswith("$argon2"))

    def test_stored_hash_is_not_accepted_as_the_password(self):
        import hashlib
        digest = hashlib.sha256(b"OldPass123").hexdigest()
        self._add_user("pw@corp.com", login_method="PASSWORD", password_hash=digest)
        r = self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": digest})
        self.assertEqual(r.status_code, 401)

    def test_password_login_locks_after_repeated_failures(self):
        self._add_user("pw@corp.com", login_method="PASSWORD", password_hash=passwords.hash_password("Right-pass1"))
        for _ in range(5):
            self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": "bad"})
        r = self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": "Right-pass1"})
        self.assertEqual(r.status_code, 429)

    # ── admin: create / grant / deny / resend ──────────────────────────────────
    def test_admin_creates_sso_user_checks_tenant_and_sends_invite(self):
        h = self._admin_headers()
        r = self.client.post("/api/admin/users", headers=h, json={"email": "Sso@Corp.com", "role": "User", "login_method": "SSO"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["invite_sent"])
        row = self._row("sso@corp.com")
        self.assertEqual((row.login_method, row.status, row.password_hash), ("SSO", "ACTIVE", None))
        to, subject, body = self.sent[-1]
        self.assertEqual(to, "sso@corp.com")
        self.assertIn("Sign in with Microsoft", body)
        self.assertNotIn("password", body.lower().replace("no password", "").replace("do not need a password", ""))

    def test_admin_cannot_create_sso_user_outside_tenant(self):
        h = self._admin_headers()
        with patch("app.services.user_access.tenant_lookup", AsyncMock(side_effect=HTTPException(400, "This email is not in your organisation's Microsoft tenant."))):
            r = self.client.post("/api/admin/users", headers=h, json={"email": "out@other.com", "login_method": "SSO"})
        self.assertEqual(r.status_code, 400)
        self.assertIsNone(self._row("out@other.com"))

    def test_password_user_gets_set_password_link_not_a_password(self):
        h = self._admin_headers()
        r = self.client.post("/api/admin/users", headers=h, json={"email": "pw@corp.com", "login_method": "PASSWORD", "password": "ignored-by-create"})
        self.assertEqual(r.status_code, 200, r.text)
        row = self._row("pw@corp.com")
        self.assertIsNone(row.password_hash)
        self.assertTrue(row.set_password_token_hash and row.set_password_expires_at)
        to, subject, body = self.sent[-1]
        self.assertIn("vdms_setpw=", body)
        self.assertIn("pw@corp.com", body)
        self.assertNotIn("ignored-by-create", body)
        token = body.split("vdms_setpw=")[1].split('"')[0]

        # the link sets the password once, then the user signs in with it
        bad = self.client.post("/api/auth/set-password", json={"token": token, "password": "short"})
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post("/api/auth/set-password", json={"token": token, "password": "My-new-pass1"})
        self.assertEqual(ok.status_code, 200, ok.text)
        again = self.client.post("/api/auth/set-password", json={"token": token, "password": "Another-pass2"})
        self.assertEqual(again.status_code, 400)  # single use
        login = self.client.post("/api/auth/password-login", json={"email": "pw@corp.com", "password": "My-new-pass1"})
        self.assertEqual(login.status_code, 200, login.text)

    def test_expired_set_password_link_is_rejected(self):
        token, token_hash, _ = passwords.new_set_password_token(datetime.utcnow())
        self._add_user("pw@corp.com", login_method="PASSWORD", set_password_token_hash=token_hash,
                       set_password_expires_at=datetime.utcnow() - timedelta(minutes=1))
        r = self.client.post("/api/auth/set-password", json={"token": token, "password": "My-new-pass1"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"]["reason"], "link_expired")

    def test_grant_activates_sets_role_and_sends_welcome_email(self):
        h = self._admin_headers()
        self._sso("new@corp.com")
        self.sent.clear()
        r = self.client.post("/api/admin/users/new@corp.com/grant", headers=h,
                             json={"role": "User", "allowed_modules": ["Documents"], "assigned_vessels": ["Belle Lune"]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["invite_sent"])
        row = self._row("new@corp.com")
        self.assertEqual((row.status, row.is_active, row.decided_by), ("ACTIVE", True, ADMIN))
        self.assertEqual(self.sent[-1][0], "new@corp.com")
        self.assertIn("Documents", self.sent[-1][2])
        self.assertEqual(self._sso("new@corp.com").status_code, 200)  # now they can sign in

    def test_deny_blocks_user_without_new_requests_or_emails_and_can_be_regranted(self):
        h = self._admin_headers()
        self._sso("new@corp.com")
        self.sent.clear()
        r = self.client.post("/api/admin/users/new@corp.com/deny", headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        again = self._sso("new@corp.com")
        self.assertEqual((again.status_code, again.json()["detail"]["reason"]), (403, "access_denied"))
        with self.Session() as db:
            self.assertEqual(db.query(models.ActivityLog).filter_by(action="access_request").count(), 1)
        self.assertEqual(self.sent, [])
        g = self.client.post("/api/admin/users/new@corp.com/grant", headers=h, json={"role": "User"})
        self.assertEqual(g.status_code, 200, g.text)
        self.assertEqual(self._sso("new@corp.com").status_code, 200)

    def test_access_requests_list_and_non_admin_cannot_decide(self):
        h = self._admin_headers()
        self._sso("new@corp.com")
        lst = self.client.get("/api/admin/access-requests", headers=h)
        self.assertEqual([x["email"] for x in lst.json()], ["new@corp.com"])
        self._add_user("plain@corp.com")
        from app.services.session_service import create_session
        with self.Session() as db:
            sid = create_session(db, "plain@corp.com", "ua", "127.0.0.1").session_id
        r = self.client.post("/api/admin/users/new@corp.com/grant", headers={"X-Session-ID": sid}, json={"role": "Admin"})
        self.assertEqual(r.status_code, 403)

    def test_resend_invite_and_clear_error_when_sending_fails(self):
        h = self._admin_headers()
        self._add_user("sso@corp.com")
        self.send_mock.side_effect = AsyncMock(return_value="The sender mailbox has no Exchange mailbox.")
        r = self.client.post("/api/admin/users/sso@corp.com/resend-invite", headers=h)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["invite_sent"])
        self.assertIn("no Exchange mailbox", r.json()["invite_error"])
        self.assertIn("no Exchange mailbox", self._row("sso@corp.com").invite_error)

    def test_disabling_a_user_ends_their_existing_session(self):
        self._add_user("user@corp.com")
        sid = self._sso("user@corp.com").json()["session_id"]
        self.assertEqual(self.client.get("/api/sessions", headers={"X-Session-ID": sid}).status_code, 200)
        with self.Session() as db:
            row = db.query(models.UserProfile).filter_by(email="user@corp.com").one()
            row.status, row.is_active = "DISABLED", False
            db.commit()
        r = self.client.get("/api/sessions", headers={"X-Session-ID": sid})
        self.assertEqual(r.status_code, 401)

    def test_user_list_only_shows_user_management_rows(self):
        h = self._admin_headers()
        with patch("app.main._fetch_tenant_users", AsyncMock(return_value=[
            {"email": "tenantonly@corp.com", "displayName": "Tenant Only", "accountEnabled": True},
        ])):
            r = self.client.get("/api/users", headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn("tenantonly@corp.com", [u["email"] for u in r.json()])


class PasswordHashTests(unittest.TestCase):
    def test_argon2_roundtrip_and_wrong_password(self):
        h = passwords.hash_password("Correct-horse1")
        self.assertTrue(h.startswith("$argon2"))
        self.assertEqual(passwords.verify_password(h, "Correct-horse1"), (True, False))
        self.assertEqual(passwords.verify_password(h, "wrong"), (False, False))

    def test_salted(self):
        self.assertNotEqual(passwords.hash_password("same-pass-1"), passwords.hash_password("same-pass-1"))

    def test_policy(self):
        self.assertIsNotNone(passwords.password_problem("short"))
        self.assertIsNone(passwords.password_problem("long-enough-1"))


if __name__ == "__main__":
    unittest.main()
