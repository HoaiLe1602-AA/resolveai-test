# ResolveAI - Mục 25: Giao diện chat + triển khai (khung mẫu)

Web chat khách hàng + trang quản trị nhân viên + Backend FastAPI, đóng gói một container (docker-compose).

## Chạy
```bash
cp .env.example .env        # đổi SECRET_KEY, ADMIN_BOOTSTRAP_PASSWORD
docker compose up --build   # http://localhost:8000  (chat)   http://localhost:8000/admin/  (nhân viên)
# tùy chọn: khởi tạo dữ liệu/admin thủ công
docker compose --profile init run --rm init
```
Không dùng Docker: `pip install -r requirements.txt && uvicorn app.main:app --workers 1`.
Kiểm thử: `pip install -r requirements-dev.txt && pytest`.

## Cấu trúc
- `app/service.py` toàn bộ nghiệp vụ (không phụ thuộc framework), `app/main.py` lớp HTTP mỏng.
- `app/agent_port.py` hợp đồng với Agent; `app/stub_agent.py` Agent MẪU theo từ khóa (FAKE_LLM=1).
- `web/chat`, `web/admin`: HTML/JS thuần, không cần build.

## Thay Agent mẫu bằng Agent LangGraph (Mục 20)
Hiện thực `AgentPort.run_turn(AgentInput) -> AgentOutput`, trả về trong `build_agent()` (app/main.py).
Agent chỉ *đề nghị* tạo Ticket/Handoff; Backend tự kiểm tra điều kiện rồi mới ghi DB.

## Giới hạn đã biết (cần team quyết/hiện thực tiếp)
- Agent mẫu dùng dữ liệu chính sách mẫu; chưa có RAG/Chroma, MCP tool, Guardrail thật, Langfuse.
- API quản lý KB (`/api/admin/kb/*`) trả 501.
- Chỉ 1 worker: giới hạn tần suất và khóa phiên nằm trong bộ nhớ.
- Hotline là chỗ trống (`HOTLINE`). EX-COM-04 (tạo Ticket ngoài giờ khi Handoff) chưa làm.
- Mã Ticket theo BR5 `TK-YYYYMMDDXXXX`; Mục 18 ghi `TK-YYYYMMDD-XXXX` - cần thống nhất rồi sửa `_ticket_write`.
- Khóa phiên bản thư viện (`pip freeze`) trước khi nộp. Dùng Gemini miễn phí thì chỉ nạp dữ liệu mẫu.
