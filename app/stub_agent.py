"""Agent MẪU theo từ khóa (tương đương FAKE_LLM=1), chỉ để chạy được giao diện đầu-cuối.

KHÔNG phải Agent thật và KHÔNG chứa nghiệp vụ chính thức: câu trả lời chính sách là dữ liệu mẫu.
Thay bằng Agent LangGraph (Mục 20) bằng cách hiện thực AgentPort.run_turn.
"""
from __future__ import annotations

import re
import unicodedata

from .agent_port import AgentInput, AgentOutput

TICKET_TYPES_NEED_ORDER = {"Đổi trả", "Bảo hành"}
FIELD_PROMPTS = {
    "customer_name": "Bạn vui lòng cho mình biết họ tên?",
    "contact": "Số điện thoại hoặc email để nhân viên liên hệ với bạn là gì?",
    "order_id": "Mã đơn hàng của bạn là gì?",
    "product": "Tên hoặc mã sản phẩm liên quan là gì?",
    "description": "Bạn mô tả giúp mình vấn đề gặp phải (lý do đổi trả, lỗi cần bảo hành, nội dung khiếu nại)?",
}
CONFIRM_WORDS = {"dong y", "xac nhan", "ok", "oke", "co", "vang", "duoc"}


def norm(text: str) -> str:
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    return t.replace("đ", "d").strip()


def _has(t: str, words) -> bool:
    return any(w in t for w in words)


def _fields_for(ticket_type: str) -> list[str]:
    base = ["customer_name", "contact"]
    if ticket_type in TICKET_TYPES_NEED_ORDER:
        base += ["order_id", "product"]
    return base + ["description"]


class StubAgent:
    def run_turn(self, inp: AgentInput) -> AgentOutput:
        state = dict(inp.state)
        t = norm(inp.text)

        # ---- Hành động có cấu trúc từ nút trên thẻ tóm tắt Ticket
        if inp.action == "confirm_ticket":
            if state.get("awaiting_confirm") and state.get("draft"):
                draft = dict(state["draft"])
                new_state = {"clarify_count": 0}
                return AgentOutput("", new_state, intent=draft["type"], create_ticket=draft)
            return AgentOutput("Hiện chưa có yêu cầu nào đang chờ xác nhận.", state)
        if inp.action == "reject_ticket":
            state["awaiting_confirm"] = False
            state["asking"] = "description"
            return AgentOutput(
                "Bạn muốn chỉnh sửa điểm nào? Hãy gõ lại mô tả mới, mình sẽ cập nhật bản tóm tắt.", state)

        # ---- Guardrails mẫu (thay bằng Mục 23): chặn thao túng, không Handoff
        if _has(t, ["bo qua huong dan", "ignore previous", "system prompt", "ma giam gia 100", "tiet lo prompt"]):
            return AgentOutput("Mình không thể thực hiện yêu cầu này. Mình có thể hỗ trợ bạn về chính sách, "
                               "đơn hàng và các yêu cầu đổi trả, bảo hành.", state)

        # ---- Handoff sớm (BR6): đòi gặp người, bức xúc
        if _has(t, ["gap nhan vien", "gap nguoi", "noi chuyen voi nguoi", "chuyen nhan vien", "tu van vien"]):
            return AgentOutput("Mình sẽ chuyển cuộc trò chuyện cho nhân viên CSKH.", state,
                               intent=state.get("intent"), handoff_reason="HO-03")
        if _has(t, ["buc xuc", "qua te", "lua dao", "te hai", "khong chap nhan", "to cao"]):
            return AgentOutput("Mình rất tiếc về trải nghiệm này của bạn. Mình chuyển ngay cho nhân viên "
                               "CSKH để hỗ trợ bạn.", state, intent="Khiếu nại", handoff_reason="HO-04")

        # ---- Đang thu thập thông tin Ticket
        if state.get("flow") == "ticket":
            return self._ticket_step(inp, state, t)

        # ---- Bắt đầu luồng tạo Ticket
        ttype = self._ticket_trigger(t)
        if ttype:
            state.update(flow="ticket", draft={"type": ttype}, asking=None, awaiting_confirm=False)
            return self._ask_next(state, "Mình sẽ ghi nhận yêu cầu " + ttype.lower() + " của bạn. ", ttype)

        # ---- Tư vấn theo dữ liệu mẫu
        if _has(t, ["doi tra", "doi hang", "tra hang"]):
            return AgentOutput(
                "Savani nhận đổi trả trong 15 ngày kể từ ngày nhận hàng, sản phẩm còn tem mác và chưa qua sử "
                "dụng. Chính sách không áp dụng cho đồ lót, tất/vớ, phụ kiện và hàng giảm giá từ 50%.",
                state, sources=[{"title": "Chính sách đổi trả (dữ liệu mẫu)", "section": "Điều kiện đổi trả"}],
                intent="Đổi trả")
        if "bao hanh" in t:
            return AgentOutput(
                "Savani bảo hành sản phẩm lỗi do nhà sản xuất trong 30 ngày kể từ ngày nhận hàng.",
                state, sources=[{"title": "Chính sách bảo hành (dữ liệu mẫu)", "section": "Thời hạn bảo hành"}],
                intent="Bảo hành")
        if _has(t, ["gio lam viec", "mo cua", "may gio"]):
            return AgentOutput("CSKH Savani làm việc 08:00-17:30, từ Thứ Hai đến Thứ Bảy.", state,
                               sources=[{"title": "Thông tin CSKH (dữ liệu mẫu)", "section": "Giờ làm việc"}],
                               intent="Tư vấn")
        if _has(t, ["don hang", "ma don", "tra don", "giao hang"]):
            return AgentOutput("[Bản mẫu] Để tra cứu đơn hàng, bạn cần cung cấp mã đơn và 4 số cuối số điện "
                               "thoại. Chức năng tra đơn do module MCP đảm nhiệm, chưa nối trong khung mẫu.",
                               state, intent="Tư vấn")
        if _has(t, ["xin chao", "chao", "hello", "hi"]) and len(t) < 20:
            return AgentOutput("Xin chào, mình là trợ lý CSKH của Savani. Mình có thể giải đáp chính sách đổi "
                               "trả, bảo hành, và ghi nhận yêu cầu của bạn.", state, intent="Tư vấn")

        # ---- Không hiểu: làm rõ tối đa 1 lượt rồi Handoff (BR1, BR6)
        if state.get("clarify_count", 0) < 1:
            state["clarify_count"] = state.get("clarify_count", 0) + 1
            return AgentOutput("Bạn có thể nói rõ hơn bạn cần hỗ trợ về đổi trả, bảo hành, đơn hàng hay vấn đề khác?",
                               state)
        return AgentOutput("Mình chưa có thông tin chính thức cho câu hỏi này.", state,
                           intent=state.get("intent"), handoff_reason="HO-01")

    # ------------------------------------------------------------------ Ticket
    @staticmethod
    def _ticket_trigger(t: str) -> str | None:
        if "khieu nai" in t:
            return "Khiếu nại"
        wants = _has(t, ["tao yeu cau", "gui yeu cau", "yeu cau", "muon doi", "muon tra", "can bao hanh",
                         "muon bao hanh"])
        if "bao hanh" in t and wants:
            return "Bảo hành"
        if _has(t, ["doi tra", "doi hang", "tra hang"]) and wants:
            return "Đổi trả"
        return None

    def _ticket_step(self, inp: AgentInput, state: dict, t: str) -> AgentOutput:
        draft = dict(state.get("draft", {}))
        ttype = draft.get("type", "Khiếu nại")
        if state.get("awaiting_confirm"):
            hint = "Để bảo đảm chính xác, bạn vui lòng bấm nút “Xác nhận” hoặc “Chỉnh sửa” trên thẻ tóm tắt nhé."
            return AgentOutput(hint, state, ui=self._summary_ui(draft), intent=ttype)
        asking = state.get("asking")
        value = inp.text.strip()
        if asking == "contact" and not (re.search(r"\d{8,}", value) or "@" in value):
            return AgentOutput("Thông tin liên hệ chưa hợp lệ, bạn nhập số điện thoại hoặc email giúp mình nhé.",
                               state, intent=ttype)
        if asking:
            draft[asking] = value
        state["draft"] = draft
        return self._ask_next(state, "", ttype)

    def _ask_next(self, state: dict, lead: str, ttype: str) -> AgentOutput:
        draft = state["draft"]
        for f in _fields_for(ttype):
            if not draft.get(f):
                state["asking"] = f
                return AgentOutput(lead + FIELD_PROMPTS[f], state, intent=ttype)
        state["asking"] = None
        state["awaiting_confirm"] = True
        return AgentOutput("Mình đã ghi lại thông tin như dưới đây. Bạn kiểm tra và xác nhận giúp mình nhé.",
                           state, ui=self._summary_ui(draft), intent=ttype)

    @staticmethod
    def _summary_ui(draft: dict) -> dict:
        labels = {"customer_name": "Họ tên", "contact": "Liên hệ", "order_id": "Mã đơn",
                  "product": "Sản phẩm", "description": "Mô tả"}
        fields = [{"label": labels[k], "value": draft[k]} for k in labels if draft.get(k)]
        return {"type": "ticket_summary", "ticket_type": draft.get("type"), "fields": fields}
