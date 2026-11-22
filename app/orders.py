"""Tra cứu đơn hàng. Hiện đọc bảng shop_order (SQLite) với vài đơn MẪU.

Muốn nối đơn hàng thật của Savani (Haravan, Shopify, KiotViet...): viết lớp khác có cùng
phương thức `lookup(code, phone_last4)` rồi truyền vào GeminiAgent ở build_agent().
Bảo mật: chỉ trả đơn khi KHỚP cả mã đơn lẫn 4 số cuối SĐT; sai thì không nói là sai mã hay sai SĐT.
"""
from __future__ import annotations

import hmac
import json
import re
from datetime import datetime, timezone

from .db import Database

DEMO_ORDERS = [
    ("SV100001", "5678", "Nguyễn Văn An", "Đang giao",
     [{"name": "Áo polo nam cafe", "size": "M", "qty": 1, "price": 189000}], 189000,
     "Thanh toán khi nhận hàng (COD)", "GHN", "GHN123456789", "Dự kiến giao ngày 24/11/2026", "2026-11-20"),
    ("SV100002", "1234", "Trần Thị Bích", "Đã giao",
     [{"name": "Áo len nữ cổ tròn kẻ sọc", "size": "S", "qty": 1, "price": 299000},
      {"name": "Chân váy chữ A", "size": "S", "qty": 1, "price": 229000}], 528000,
     "Chuyển khoản", "GHTK", "GHTK987654321", "Giao thành công ngày 15/11/2026", "2026-11-12"),
    ("SV100003", "9999", "Lê Minh Quân", "Đang chuẩn bị hàng",
     [{"name": "Áo khoác bomber", "size": "L", "qty": 1, "price": 459000},
      {"name": "Quần tây nam ống đứng", "size": "L", "qty": 1, "price": 349000}], 808000,
     "Chuyển khoản", None, None, "Kho đang đóng gói, thường giao đi trong 24 giờ", "2026-11-23"),
    ("SV100004", "4321", "Phạm Thu Hà", "Đã hủy",
     [{"name": "Đầm midi", "size": "M", "qty": 1, "price": 399000}], 399000,
     "Thanh toán khi nhận hàng (COD)", None, None, "Đơn đã hủy theo yêu cầu của khách", "2026-11-18"),
]


def normalize_code(code: str) -> str:
    c = re.sub(r"[^A-Z0-9]", "", (code or "").upper())
    return "SV" + c if c.isdigit() and len(c) == 6 else c


def last4(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")[-4:]


class OrderRepo:
    def __init__(self, db: Database):
        self.db = db

    def lookup(self, code: str, phone: str) -> dict | None:
        with self.db.conn() as c:
            r = c.execute("SELECT * FROM shop_order WHERE code=?", (normalize_code(code),)).fetchone()
        l4 = last4(phone)
        if not r or len(l4) != 4 or not hmac.compare_digest(l4, r["phone_last4"]):
            return None
        return {"code": r["code"], "status": r["status"], "items": json.loads(r["items_json"]),
                "total": r["total"], "payment": r["payment"], "carrier": r["carrier"],
                "tracking": r["tracking"], "note": r["note"], "created_at": r["created_at"][:10]}

    def seed_demo(self) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self.db.tx() as c:
            for (code, l4, name, st, items, total, pay, car, trk, note, created) in DEMO_ORDERS:
                c.execute("INSERT OR IGNORE INTO shop_order(code, phone_last4, customer_name, status, items_json,"
                          " total, payment, carrier, tracking, note, created_at, updated_at)"
                          " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                          (code, l4, name, st, json.dumps(items, ensure_ascii=False), total, pay, car, trk,
                           note, created, now))
