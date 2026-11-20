"""Token phiên và băm mật khẩu (chỉ dùng thư viện chuẩn)."""
from __future__ import annotations

import hashlib
import hmac
import secrets

_ITERATIONS = 200_000


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str, key: str) -> str:
    """DB chỉ lưu bản băm, rò rỉ DB không làm lộ token còn hiệu lực."""
    return hmac.new(key.encode(), token.encode(), hashlib.sha256).hexdigest()


def verify_token(token: str | None, stored_hash: str, key: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(hash_token(token, key), stored_hash)


def hash_password(password: str, salt_hex: str | None = None) -> str:
    salt_hex = salt_hex or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), _ITERATIONS)
    return f"pbkdf2${salt_hex}${dk.hex()}"


def check_password(password: str, stored: str | None) -> bool:
    # Luôn tính băm, kể cả khi không có tài khoản, để thời gian phản hồi không lộ thông tin.
    dummy = "pbkdf2$" + "00" * 16 + "$" + "00" * 32
    try:
        _, salt_hex, _ = (stored or dummy).split("$")
    except ValueError:
        stored, salt_hex = None, "00" * 16
    candidate = hash_password(password, salt_hex)
    return stored is not None and hmac.compare_digest(candidate, stored)
