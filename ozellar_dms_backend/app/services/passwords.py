"""Password hashing and one-time "set your password" tokens.

Passwords are hashed with Argon2id (salted, memory-hard).  Older rows may still
hold a plain SHA-256 hex digest (or, from very old builds, the raw password);
:func:`verify_password` still accepts those so existing users can log in once,
and reports ``needs_rehash`` so the caller upgrades the stored value.  A stored
hash is never accepted *as* the password.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()
_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")

MIN_PASSWORD_LENGTH = 8
SET_PASSWORD_TTL = timedelta(hours=24)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored: str | None, supplied: str) -> tuple[bool, bool]:
    """Return ``(ok, needs_rehash)`` for ``supplied`` against the stored value."""
    if not stored or not supplied:
        return False, False
    if stored.startswith("$argon2"):
        try:
            _hasher.verify(stored, supplied)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False, False
        return True, _hasher.check_needs_rehash(stored)
    if _SHA256_HEX.match(stored):
        digest = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
        return hmac.compare_digest(stored, digest), True
    # Legacy: the raw password was stored. Compare in constant time, then upgrade.
    return hmac.compare_digest(stored.encode("utf-8"), supplied.encode("utf-8")), True


def password_problem(password: str) -> str | None:
    """Return a user-facing reason the password is not acceptable, or None."""
    if len(password or "") < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if (password or "").strip() != password:
        return "Password must not start or end with a space."
    return None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_set_password_token(now: datetime) -> tuple[str, str, datetime]:
    """Return ``(token, token_hash, expires_at)``. Only the hash is stored."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token), now + SET_PASSWORD_TTL
