"""Agent dùng Gemini (gọi REST bằng thư viện chuẩn, không cần cài thêm gói).

- Gemini hiểu câu hỏi (kể cả viết tắt, không dấu) và quyết định gọi công cụ: lookup_order, suggest_size,
  start_support_request, request_human.
- Luồng thu thập thông tin Ticket vẫn do StubAgent đảm nhiệm (xác định, có thẻ xác nhận) để Backend Guard hoạt động.
- Lỗi mạng/HTTP -> ném RuntimeError; ChatService tự thử lại 2 lần rồi Handoff HO-08.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Callable

from .agent_port import AgentInput, AgentOutput
from .knowledge import build_system_prompt
from .orders import OrderRepo
from .stub_agent import StubAgent, _suggest_size, norm

log = logging.getLogger("resolveai")

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_ROUNDS = 4          # số vòng gọi công cụ tối đa trong một lượt
HISTORY_MESSAGES = 16   # số tin gần nhất gửi lại cho Gemini
MAX_ORDER_FAILS = 5     # chặn dò đoán 4 số cuối SĐT

TOOLS = [{"functionDeclarations": [
    {"name": "lookup_order",
     "description": "Tra cứu đơn hàng. Chỉ gọi khi khách đã cung cấp đủ mã đơn VÀ 4 số cuối SĐT đặt hàng.",
     "parameters": {"type": "object", "properties": {
         "order_code": {"type": "string", "description": "Mã đơn, ví dụ SV100001"},
         "phone_last4": {"type": "string", "description": "4 chữ số cuối SĐT đặt hàng"}},
         "required": ["order_code", "phone_last4"]}},
    {"name": "suggest_size",
     "description": "Gợi ý size theo chiều cao (cm) và cân nặng (kg).",
     "parameters": {"type": "object", "properties": {
         "height_cm": {"type": "integer"}, "weight_kg": {"type": "integer"}},
         "required": ["height_cm", "weight_kg"]}},
    {"name": "start_support_request",
     "description": "Bắt đầu ghi nhận yêu cầu đổi trả, bảo hành hoặc khiếu nại khi khách muốn tạo yêu cầu.",
     "parameters": {"type": "object", "properties": {
         "type": {"type": "string", "enum": ["Đổi trả", "Bảo hành", "Khiếu nại"]}}, "required": ["type"]}},
    {"name": "request_human",
     "description": "Chuyển cho nhân viên khi khách đòi gặp người, đang bức xúc, hoặc không có thông tin để trả lời.",
     "parameters": {"type": "object", "properties": {
         "reason": {"type": "string", "enum": ["customer_asked", "angry", "cannot_answer"]}},
         "required": ["reason"]}},
]}]

HANDOFF = {  # reason -> (mã Handoff, câu báo khách)
    "customer_asked": ("HO-03", "Mình sẽ chuyển cuộc trò chuyện cho nhân viên CSKH."),
    "angry": ("HO-04", "Mình rất tiếc về trải nghiệm này của bạn. Mình chuyển ngay cho nhân viên CSKH để hỗ trợ bạn."),
    "cannot_answer": ("HO-01", "Mình chưa có thông tin chính thức cho câu hỏi này, mình chuyển nhân viên CSKH hỗ trợ bạn."),
}


def http_transport(api_key: str, model: str, timeout: float = 25.0) -> Callable[[dict], dict]:
    def call(payload: dict) -> dict:
        req = urllib.request.Request(
            ENDPOINT.format(model=model), data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:   # không đưa nội dung lỗi/khóa vào log
            raise RuntimeError(f"Gemini HTTP {e.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise RuntimeError(f"Gemini không kết nối được: {type(e).__name__}") from None
    return call


class GeminiAgent:
    def __init__(self, orders: OrderRepo, transport: Callable[[dict], dict], hotline: str = "",
                 policy_provider: Callable[[], str] | None = None):
        self.orders, self.transport, self.hotline = orders, transport, hotline
        self.policy_provider = policy_provider
        self.stub = StubAgent()

    # ------------------------------------------------------------------ một lượt
    def run_turn(self, inp: AgentInput) -> AgentOutput:
        state = dict(inp.state)
        if inp.action or state.get("flow") == "ticket":   # đang thu thập Ticket: luồng xác định
            return self.stub.run_turn(inp)

        contents = [{"role": h["role"], "parts": [{"text": h["text"]}]} for h in state.get("history", [])]
        contents.append({"role": "user", "parts": [{"text": inp.text}]})
        sources: list[dict[str, str]] = []
        intent = state.get("intent") or self._guess_intent(inp.text)

        for _ in range(MAX_ROUNDS):
            content = self._first_content(self.transport(self._payload(contents, inp.in_business_hours)))
            parts = content.get("parts", [])
            calls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not calls:
                text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                if not text:
                    raise RuntimeError("Gemini trả về nội dung rỗng")
                return AgentOutput(text, self._remember(state, inp.text, text), sources=sources, intent=intent)
            contents.append(content)   # giữ nguyên để không mất chữ ký suy luận của model
            replies = []
            for call in calls:
                name, args = call.get("name"), call.get("args") or {}
                if name == "start_support_request":
                    return self._start_ticket(state, inp.text, str(args.get("type", "Khiếu nại")))
                if name == "request_human":
                    code, msg = HANDOFF.get(args.get("reason"), HANDOFF["cannot_answer"])
                    return AgentOutput(msg, self._remember(state, inp.text, msg), intent=intent, handoff_reason=code)
                result = self._tool(name, args, state, sources)
                if name == "lookup_order":
                    intent = "Đơn hàng"
                replies.append({"functionResponse": {"name": name, "response": {"result": result}}})
            contents.append({"role": "user", "parts": replies})
        raise RuntimeError("Gemini gọi công cụ quá số vòng cho phép")

    # ------------------------------------------------------------------ công cụ
    def _tool(self, name: str | None, args: dict, state: dict, sources: list) -> Any:
        if name == "lookup_order":
            if state.get("order_fails", 0) >= MAX_ORDER_FAILS:
                return {"found": False, "locked": True,
                        "message": "Đã thử quá nhiều lần, hãy đề nghị khách gặp nhân viên CSKH."}
            o = self.orders.lookup(str(args.get("order_code", "")), str(args.get("phone_last4", "")))
            if o is None:
                state["order_fails"] = state.get("order_fails", 0) + 1
                return {"found": False}
            state["order_fails"] = 0
            sources.append({"title": "Tra cứu đơn hàng", "section": o["code"]})
            return {"found": True, "order": o}
        if name == "suggest_size":
            try:
                h, w = int(args["height_cm"]), int(args["weight_kg"])
            except (KeyError, TypeError, ValueError):
                return {"error": "Thiếu hoặc sai chiều cao/cân nặng"}
            if not (120 <= h <= 210 and 25 <= w <= 150):
                return {"error": "Số đo ngoài phạm vi, hãy hỏi lại khách"}
            sources.append({"title": "Bảng size (dữ liệu mẫu)", "section": "Gợi ý theo chiều cao, cân nặng"})
            return {"advice": _suggest_size(h, w)}
        return {"error": "Công cụ không tồn tại"}

    def _start_ticket(self, state: dict, user_text: str, ttype: str) -> AgentOutput:
        ttype = ttype if ttype in ("Đổi trả", "Bảo hành", "Khiếu nại") else "Khiếu nại"
        state.update(flow="ticket", draft={"type": ttype}, asking=None, awaiting_confirm=False)
        out = self.stub._ask_next(state, "Mình sẽ ghi nhận yêu cầu " + ttype.lower() + " của bạn. ", ttype)
        out.state = self._remember(out.state, user_text, out.reply)
        return out

    # ------------------------------------------------------------------ tiện ích
    def _payload(self, contents: list, in_hours: bool) -> dict:
        return {"systemInstruction": {"parts": [{"text": build_system_prompt(self.hotline, in_hours, self.policy_provider() if self.policy_provider else None)}]},
                "contents": contents, "tools": TOOLS,
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 700}}

    @staticmethod
    def _first_content(resp: dict) -> dict:
        cands = resp.get("candidates") or []
        if not cands or "content" not in cands[0]:
            raise RuntimeError("Gemini không trả về ứng viên nào (có thể bị chặn)")
        return cands[0]["content"]

    @staticmethod
    def _remember(state: dict, user_text: str, reply: str) -> dict:
        h = list(state.get("history", [])) + [{"role": "user", "text": user_text}, {"role": "model", "text": reply}]
        state = dict(state)
        state["history"] = h[-HISTORY_MESSAGES:]
        return state

    @staticmethod
    def _guess_intent(text: str) -> str | None:
        t = norm(text)
        if "bao hanh" in t:
            return "Bảo hành"
        if any(w in t for w in ("doi tra", "doi hang", "tra hang", "doi size")):
            return "Đổi trả"
        return "Tư vấn"
