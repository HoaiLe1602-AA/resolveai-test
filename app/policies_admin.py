"""API thêm/sửa/xóa chính sách thủ công (ghi file .md vào data/policies).

Bảo mật: mọi thao tác cần header X-Admin-Key khớp biến môi trường POLICY_ADMIN_KEY
(nếu không đặt thì dùng ADMIN_BOOTSTRAP_PASSWORD). Không có khóa nào được đặt thì từ chối hết.
"""
from __future__ import annotations

import hmac
import os
import re
import unicodedata
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

POLICY_DIR = Path(os.getenv("POLICIES_DIR") or os.getenv("POLICY_DIR") or Path(__file__).resolve().parent.parent / "data" / "policies")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def slugify(text: str) -> str:
    text = text.lower().replace("đ", "d")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:80]


def _check_key(key: Optional[str]) -> None:
    if os.getenv("POLICY_ADMIN_OPEN") == "1":  # chế độ mở: ai cũng sửa được (chỉ nên dùng khi demo)
        return
    expected = os.getenv("POLICY_ADMIN_KEY") or os.getenv("ADMIN_BOOTSTRAP_PASSWORD")
    if not expected:
        raise HTTPException(403, "Chưa đặt POLICY_ADMIN_KEY (hoặc ADMIN_BOOTSTRAP_PASSWORD) trong .env")
    if not key or not hmac.compare_digest(key, expected):
        raise HTTPException(401, "Sai khóa quản trị")


def _reload_kb() -> bool:
    """Cố gắng nạp lại KB nếu app/kb.py có hàm nạp lại; không có thì cần khởi động lại server."""
    try:
        from app import kb  # type: ignore
    except Exception:
        return False
    for name in ("reload", "reload_kb", "refresh", "rebuild", "build_index", "load_policies", "load"):
        fn = getattr(kb, name, None)
        if callable(fn):
            try:
                fn()
                return True
            except TypeError:
                continue
            except Exception:
                return False
    return False


def _title_of(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


class PolicyIn(BaseModel):
    title: str
    content: str
    slug: Optional[str] = None


def make_router() -> APIRouter:
    router = APIRouter(prefix="/api/admin/policies", tags=["policies"])

    @router.get("")
    def list_policies(x_admin_key: Optional[str] = Header(None)):
        _check_key(x_admin_key)
        POLICY_DIR.mkdir(parents=True, exist_ok=True)
        return [{"slug": p.stem, "title": _title_of(p), "size": p.stat().st_size}
                for p in sorted(POLICY_DIR.glob("*.md"))]

    @router.get("/{slug}")
    def get_policy(slug: str, x_admin_key: Optional[str] = Header(None)):
        _check_key(x_admin_key)
        path = POLICY_DIR / f"{slug}.md"
        if not SLUG_RE.match(slug) or not path.exists():
            raise HTTPException(404, "Không có chính sách này")
        text = path.read_text(encoding="utf-8")
        title = _title_of(path)
        body = re.sub(r"^# .*\n+", "", text, count=1)
        return {"slug": slug, "title": title, "content": body}

    @router.post("")
    def save_policy(body: PolicyIn, x_admin_key: Optional[str] = Header(None)):
        _check_key(x_admin_key)
        title, content = body.title.strip(), body.content.strip()
        if not title or not content:
            raise HTTPException(400, "Cần nhập tiêu đề và nội dung")
        slug = (body.slug or slugify(title)).strip()
        if not SLUG_RE.match(slug):
            raise HTTPException(400, "Tên file không hợp lệ (chỉ chữ thường, số, dấu gạch ngang)")
        POLICY_DIR.mkdir(parents=True, exist_ok=True)
        (POLICY_DIR / f"{slug}.md").write_text(f"# {title}\n\n{content}\n", encoding="utf-8")
        return {"slug": slug, "saved": True, "reloaded": _reload_kb()}

    @router.delete("/{slug}")
    def delete_policy(slug: str, x_admin_key: Optional[str] = Header(None)):
        _check_key(x_admin_key)
        path = POLICY_DIR / f"{slug}.md"
        if not SLUG_RE.match(slug) or not path.exists():
            raise HTTPException(404, "Không có chính sách này")
        path.unlink()
        return {"slug": slug, "deleted": True, "reloaded": _reload_kb()}

    return router
