"""FastAPI: lớp HTTP mỏng, mọi nghiệp vụ nằm ở app/service.py."""
from __future__ import annotations

from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent_port import AgentPort
from .config import Settings, load_settings
from .db import Database
from .service import ApiError, ChatService
from .stub_agent import StubAgent

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def build_agent(settings: Settings) -> AgentPort:
    """Điểm thay Agent: FAKE_LLM=0 sẽ nối Agent LangGraph (Mục 20) khi module đó sẵn sàng."""
    if settings.fake_llm:
        return StubAgent()
    raise RuntimeError("FAKE_LLM=0 cần Agent thật: hiện thực AgentPort.run_turn rồi trả về ở build_agent().")


class ChatIn(BaseModel):
    session_id: str | None = None
    text: str | None = None
    client_msg_id: str | None = None
    action: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class TextIn(BaseModel):
    text: str


class StatusIn(BaseModel):
    status: str
    note: str | None = None


def create_app(settings: Settings | None = None, agent: AgentPort | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.app_db_path)
    db.init()
    svc = ChatService(db, settings, agent or build_agent(settings))
    svc.ensure_bootstrap_admin()

    app = FastAPI(title="ResolveAI", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.service = svc

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError):
        body = {"error": {"code": e.code, "message": e.message, **e.extra}}
        return JSONResponse(body, status_code=e.status, headers=e.headers)

    def staff(admin_session: str | None = Cookie(default=None)) -> dict:
        return svc.require_staff(admin_session)

    # ---------------- khách hàng
    @app.get("/healthz")
    def healthz():
        with db.conn() as c:
            c.execute("SELECT 1")
        return {"status": "ok"}

    @app.post("/api/chat/messages")
    def post_message(body: ChatIn, request: Request, x_session_token: str | None = Header(default=None)):
        ip = request.client.host if request.client else None
        return svc.post_message(body.session_id, x_session_token, body.text, body.client_msg_id,
                                body.action, client_ip=ip)

    @app.get("/api/chat/sessions/{session_id}/messages")
    def get_messages(session_id: str, after: int = 0, x_session_token: str | None = Header(default=None)):
        return svc.get_messages(session_id, x_session_token, after)

    # ---------------- nhân viên
    @app.post("/api/admin/login")
    def login(body: LoginIn):
        token = svc.login(body.username, body.password)
        resp = JSONResponse({"ok": True})
        resp.set_cookie("admin_session", token, httponly=True, samesite="strict",
                        secure=settings.cookie_secure, max_age=settings.staff_session_hours * 3600, path="/")
        return resp

    @app.post("/api/admin/logout")
    def logout(admin_session: str | None = Cookie(default=None)):
        svc.logout(admin_session)
        resp = JSONResponse({"ok": True})
        resp.delete_cookie("admin_session", path="/")
        return resp

    @app.get("/api/admin/me")
    def me(s: dict = Depends(staff)):
        return s

    @app.get("/api/admin/queue")
    def queue(_: dict = Depends(staff)):
        return {"items": svc.queue()}

    @app.post("/api/admin/sessions/{session_id}/claim")
    def claim(session_id: str, s: dict = Depends(staff)):
        return svc.claim(s, session_id)

    @app.post("/api/admin/sessions/{session_id}/messages")
    def staff_msg(session_id: str, body: TextIn, s: dict = Depends(staff)):
        return svc.staff_message(s, session_id, body.text)

    @app.post("/api/admin/sessions/{session_id}/close")
    def close(session_id: str, s: dict = Depends(staff)):
        return svc.close(s, session_id)

    @app.get("/api/admin/sessions")
    def sessions(status: str | None = None, intent: str | None = None, _: dict = Depends(staff)):
        return {"items": svc.list_sessions(status, intent)}

    @app.get("/api/admin/sessions/{session_id}")
    def session_detail(session_id: str, after: int = 0, _: dict = Depends(staff)):
        return svc.session_detail(session_id, after)

    @app.get("/api/admin/tickets")
    def tickets(status: str | None = None, type: str | None = None, _: dict = Depends(staff)):
        return {"items": svc.list_tickets(status, type)}

    @app.get("/api/admin/tickets/{ticket_id}")
    def ticket(ticket_id: str, _: dict = Depends(staff)):
        return svc.ticket_detail(ticket_id)

    @app.patch("/api/admin/tickets/{ticket_id}/status")
    def ticket_status(ticket_id: str, body: StatusIn, s: dict = Depends(staff)):
        return svc.update_ticket_status(s, ticket_id, body.status, body.note)

    @app.get("/api/admin/dashboard")
    def dashboard(date_from: str | None = None, date_to: str | None = None, _: dict = Depends(staff)):
        return svc.dashboard(date_from, date_to)

    @app.api_route("/api/admin/kb/docs", methods=["GET", "POST"])
    @app.api_route("/api/admin/kb/docs/{doc_id}", methods=["PUT", "DELETE"])
    def kb(doc_id: str | None = None, _: dict = Depends(staff)):
        svc.kb_not_implemented()

    # ---------------- giao diện tĩnh (đặt sau cùng để không che /api)
    app.mount("/admin", StaticFiles(directory=WEB_DIR / "admin", html=True), name="admin")
    app.mount("/", StaticFiles(directory=WEB_DIR / "chat", html=True), name="chat")
    return app


app = create_app()
