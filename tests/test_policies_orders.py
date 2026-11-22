"""Kho chính sách (admin thêm) + tra đơn trong Agent mẫu. Chạy được không cần FastAPI."""


from app.agent_port import AgentInput
from app.db import Database
from app.orders import OrderRepo
from app.policies import PolicyRepo
from app.service import ApiError
from app.stub_agent import StubAgent


def build(tmp_path):
    db = Database(tmp_path / "t.db")
    db.init()
    orders, kb = OrderRepo(db), PolicyRepo(db)
    orders.seed_demo()
    kb.seed_defaults()
    return StubAgent(orders=orders, kb_search=kb.search), kb


def say(agent, state, text):
    out = agent.run_turn(AgentInput("s", text, None, state, True))
    return out, out.state


def test_order_lookup_asks_then_answers(tmp_path):
    agent, _ = build(tmp_path)
    out, st = say(agent, {}, "Tra cứu đơn hàng")
    assert "mã đơn" in out.reply
    out, st = say(agent, st, "SV100001")
    assert "4 số cuối" in out.reply
    out, st = say(agent, st, "5678")
    assert "Đang giao" in out.reply and "GHN123456789" in out.reply and out.intent == "Đơn hàng"


def test_order_wrong_phone_and_one_shot(tmp_path):
    agent, _ = build(tmp_path)
    out, _ = say(agent, {}, "đơn sv100001 sdt 0000")
    assert "không tìm thấy" in out.reply
    out, _ = say(agent, {}, "kiểm tra đơn SV-100002 đuôi sđt 1234")
    assert "Đã giao" in out.reply


def test_leaving_order_flow(tmp_path):
    agent, _ = build(tmp_path)
    _, st = say(agent, {}, "tra đơn hàng")
    out, st = say(agent, st, "chính sách đổi hàng thế nào")
    assert "30 ngày" in out.reply and not st.get("order_flow")


def test_admin_added_policy_is_used(tmp_path):
    agent, kb = build(tmp_path)
    kb.create("Chính sách thanh toán", "Savani nhận thanh toán bằng tiền mặt, chuyển khoản và ví MoMo.")
    out, _ = say(agent, {}, "thanh toán bằng momo được không")
    assert "MoMo" in out.reply and out.sources[0]["title"] == "Chính sách thanh toán"
    assert "ví MoMo" in kb.text()
    d = kb.list()[-1]
    kb.update(d["id"], d["title"], "Chỉ nhận chuyển khoản.")
    assert "Chỉ nhận chuyển khoản" in kb.text()
    kb.delete(d["id"])
    assert all(x["id"] != d["id"] for x in kb.list())


def test_policy_validation(tmp_path):
    _, kb = build(tmp_path)
    for fn in (lambda: kb.create("", "x"), lambda: kb.update(9999, "a", "b")):
        try:
            fn()
        except ApiError:
            continue
        raise AssertionError("phải báo lỗi")
