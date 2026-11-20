"""Giờ làm việc CSKH: 08:00-17:30, Thứ Hai đến Thứ Bảy (OPEN-03), tính theo múi giờ
Việt Nam một cách tường minh, không phụ thuộc giờ của container."""
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

OPEN = time(8, 0)
CLOSE = time(17, 30)  # loại trừ: 17:30 đã là ngoài giờ


def in_business_hours(now: datetime, tz: str = "Asia/Ho_Chi_Minh") -> bool:
    local = now.astimezone(ZoneInfo(tz))
    return local.weekday() <= 5 and OPEN <= local.time() < CLOSE
