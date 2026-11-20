"""Giới hạn tần suất theo cửa sổ trượt (NFR-SEC-05). Bộ đếm nằm trong bộ nhớ,
đủ cho một tiến trình duy nhất ở MVP (xem README, mục giới hạn)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Callable


class SlidingWindowLimiter:
    def __init__(self, limit: int, window: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window
        self.clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> float | None:
        """Ghi một lượt. Trả None nếu được phép, hoặc số giây phải chờ nếu bị chặn."""
        now = self.clock()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(self.window - (now - q[0]), 0.1)
            q.append(now)
            if len(self._hits) > 10_000:  # dọn khóa cũ, tránh phình bộ nhớ
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return None
