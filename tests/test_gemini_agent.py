"""Gemini giả lập (transport giả): kiểm tra tra đơn, chống dò SĐT, ticket, handoff."""
from app.agent_port import AgentInput
from app.db import Database
from app.gemini_agent import GeminiAgent
from app.orders import OrderRepo


def call(name, **args):
    return {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}}]}


def text(t):
    return {"candidates": [{"content": {"role": "model", "parts": [{"text": t}]}}]}


def make_agent(tmp_path, script):
    db = Database(tmp_path / "a.db")
    db.init()
    repo = OrderRepo(db)
    repo.seed_demo()
    sent = []

    def transport(payload):
        sent.append(payload)
        return script.pop(0)
    return GeminiAgent(repo, transport, hotline="0888"), sent


def turn(agent, msg, state=None, action=None):
    return agent.run_turn(AgentInput("s", msg, action, state or {}, True))


def test_order_lookup_found(tmp_path):
    agent, sent = make_agent(tmp_path, [call("lookup_order", order_code="sv-100001", phone_last4="5678"),
                                        text("Đơn SV100001 đang giao.")])
    out = turn(agent, "đh sv100001 sdt đuôi 5678 tới đâu r")
    assert out.reply == "Đơn SV100001 đang giao." and out.intent == "Đơn hàng"
    assert out.sources[0]["section"] == "SV100001"
    fr = sent[1]["contents"][-1]["parts"][0]["functionResponse"]["response"]["result"]
    assert fr["found"] is True and fr["order"]["status"] == "Đang giao"
    assert "customer_name" not in fr["order"] and "phone_last4" not in fr["order"]


def test_order_wrong_phone_and_lock(tmp_path):
    script = [x for _ in range(6) for x in (call("lookup_order", order_code="SV100001", phone_last4="0000"), text("Không thấy."))]
    agent, sent = make_agent(tmp_path, script)
    state = {}
    for _ in range(6):
        out = turn(agent, "tra đơn", state)
        state = out.state
    last = sent[-1]["contents"][-1]["parts"][0]["functionResponse"]["response"]["result"]
    assert last["found"] is False and last.get("locked") is True


def test_ticket_flow_and_handoff(tmp_path):
    agent, _ = make_agent(tmp_path, [call("start_support_request", type="Đổi trả"), call("request_human", reason="angry")])
    out = turn(agent, "mk muốn đổi hàng")
    assert out.state["flow"] == "ticket" and "họ tên" in out.reply
    out2 = turn(agent, "tệ quá")
    assert out2.handoff_reason == "HO-04"


def test_history_kept_and_capped(tmp_path):
    agent, sent = make_agent(tmp_path, [text("a")] * 12)
    state = {}
    for i in range(12):
        state = turn(agent, f"tin {i}", state).state
    assert len(state["history"]) == 16 and len(sent[-1]["contents"]) == 16 + 1
