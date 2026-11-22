"""Cấu hình đọc từ biến môi trường (xem .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("./var")
    secret_key: str = "dev-only-change-me"
    rate_limit_per_min: int = 15            # NFR-SEC-05
    session_create_limit_per_min: int = 20  # chống tạo phiên hàng loạt để né giới hạn theo phiên
    max_message_len: int = 1000
    hotline: str = "[hotline Savani - cần điền]"
    admin_user: str = ""
    admin_password: str = ""
    timezone: str = "Asia/Ho_Chi_Minh"      # giờ làm việc CSKH 08:00-17:30, T2-T7
    cookie_secure: bool = False             # đặt 1 khi chạy sau HTTPS
    staff_session_hours: int = 8
    fake_llm: bool = True                   # True: dùng StubAgent, không gọi API
    gemini_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"
    seed_demo_orders: bool = True           # nạp vài đơn hàng mẫu để thử tra cứu (tắt khi nối hệ thống đơn thật)
    admin_auth: bool = False                # False: trang quản trị KHÔNG cần đăng nhập
    cors_origins: tuple[str, ...] = ()      # nguồn khác được phép gọi API chat (nhúng widget vào web khác)

    @property
    def app_db_path(self) -> Path:
        return self.data_dir / "app.db"


def load_settings() -> Settings:
    e = os.environ.get
    return Settings(
        data_dir=Path(e("DATA_DIR", "./var")),
        secret_key=e("SECRET_KEY", "dev-only-change-me"),
        rate_limit_per_min=int(e("RATE_LIMIT_PER_MIN", "15")),
        session_create_limit_per_min=int(e("SESSION_CREATE_LIMIT_PER_MIN", "20")),
        max_message_len=int(e("MAX_MESSAGE_LEN", "1000")),
        hotline=e("HOTLINE", "[hotline Savani - cần điền]"),
        admin_user=e("ADMIN_BOOTSTRAP_USER", ""),
        admin_password=e("ADMIN_BOOTSTRAP_PASSWORD", ""),
        timezone=e("TZ", "Asia/Ho_Chi_Minh"),
        cookie_secure=_bool(e("COOKIE_SECURE")),
        staff_session_hours=int(e("STAFF_SESSION_HOURS", "8")),
        fake_llm=_bool(e("FAKE_LLM"), True),
        gemini_api_key=e("GEMINI_API_KEY", "").strip(),
        llm_model=e("LLM_MODEL", "").strip() or "gemini-2.5-flash",
        seed_demo_orders=_bool(e("SEED_DEMO_ORDERS"), True),
        admin_auth=_bool(e("ADMIN_AUTH"), False),
        cors_origins=tuple(o.strip() for o in e("CORS_ORIGINS", "").split(",") if o.strip()),
    )
