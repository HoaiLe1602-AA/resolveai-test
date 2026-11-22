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
    ("SV100005", "2468", "Hoàng Gia Bảo", "Chờ xác nhận",
     [{"name": "Áo sơ mi nam Oxford", "size": "L", "qty": 2, "price": 249000}], 498000,
     "Thanh toán khi nhận hàng (COD)", None, None, "Đơn vừa đặt, nhân viên sẽ gọi xác nhận trong ngày", "2026-11-23"),
    ("SV100006", "1357", "Đỗ Khánh Linh", "Đang giao",
     [{"name": "Quần jean nữ ống suông", "size": "M", "qty": 1, "price": 96000},
      {"name": "Áo len nữ cổ tròn kẻ sọc", "size": "M", "qty": 1, "price": 299000}], 395000,
     "Chuyển khoản", "Viettel Post", "VTP556677889", "Đang ở bưu cục trung chuyển, dự kiến giao ngày 25/11/2026", "2026-11-21"),
    ("SV100007", "8080", "Vũ Đức Thịnh", "Đã giao",
     [{"name": "Áo polo nam cafe", "size": "XL", "qty": 1, "price": 189000}], 189000,
     "Thanh toán khi nhận hàng (COD)", "GHN", "GHN445566778", "Giao thành công ngày 08/10/2026 (đã quá 30 ngày đổi hàng)", "2026-10-05"),
    ("SV100008", "7777", "Bùi Mai Phương", "Hoàn trả",
     [{"name": "Đầm midi", "size": "S", "qty": 1, "price": 399000}], 399000,
     "Chuyển khoản", "GHTK", "GHTK112233445", "Đã nhận lại hàng, đang xử lý hoàn tiền", "2026-11-05"),
    ("SV100009", "3690", "Ngô Quang Huy", "Đã giao",
     [{"name": "Áo khoác bomber", "size": "XL", "qty": 1, "price": 459000},
      {"name": "Quần tây nam ống đứng", "size": "XL", "qty": 1, "price": 349000},
      {"name": "Áo polo nam cafe", "size": "XL", "qty": 1, "price": 189000}], 997000,
     "Chuyển khoản", "GHN", "GHN998877665", "Giao thành công ngày 20/11/2026, đơn trên 500K được miễn phí ship", "2026-11-17"),
    ("SV100010", "0001", "Lý Hải Yến", "Đang chuẩn bị hàng",
     [{"name": "Chân váy chữ A", "size": "M", "qty": 1, "price": 229000}], 229000,
     "Thanh toán khi nhận hàng (COD)", None, None, "Kho đang đóng gói, thường giao đi trong 24 giờ", "2026-11-23"),
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
