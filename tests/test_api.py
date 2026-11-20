"""Kiểm thử lớp HTTP (FastAPI). Bỏ qua nếu chưa cài fastapi/httpx."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def client(tmp_path):
    s = Settings(data_dir=tmp_path, secret_key="k", admin_user="admin", admin_password="pw12345", hotline="1900")
    return TestClient(create_app(s))


def test_health(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_chat_flow_and_403(client):
    r = client.post("/api/chat/messages", json={"text": "giờ làm việc", "client_msg_id": "a"})
    assert r.status_code == 200
    sid, tok = r.json()["session_id"], r.json()["session_token"]
    assert client.get(f"/api/chat/sessions/{sid}/messages").status_code == 403
    assert client.get(f"/api/chat/sessions/{sid}/messages", headers={"X-Session-Token": tok}).status_code == 200


def test_rate_limit_429_header(client):
    r = client.post("/api/chat/messages", json={"text": "a"})
    sid, tok = r.json()["session_id"], r.json()["session_token"]
    codes = [client.post("/api/chat/messages", json={"session_id": sid, "text": "a"},
                         headers={"X-Session-Token": tok}) for _ in range(15)]
    assert codes[-1].status_code == 429 and "retry-after" in codes[-1].headers


def test_admin_requires_login_and_cookie_flags(client):
    assert client.get("/api/admin/queue").status_code == 401
    r = client.post("/api/admin/login", json={"username": "admin", "password": "pw12345"})
    assert r.status_code == 200
    sc = r.headers["set-cookie"].lower()
    assert "httponly" in sc and "samesite=strict" in sc
    assert client.get("/api/admin/queue").status_code == 200
    assert client.get("/api/admin/kb/docs").status_code == 501
