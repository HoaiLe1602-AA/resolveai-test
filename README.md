# ResolveAI - Mục 25: Giao diện chat + triển khai (khung mẫu)

Web chat khách hàng + trang quản trị nhân viên + Backend FastAPI, đóng gói một container (docker-compose).

## Chạy
```bash
cp .env.example .env        # đổi SECRET_KEY, ADMIN_BOOTSTRAP_PASSWORD
docker compose up --build   # http://localhost:8000 (trang shop + chatbot)   http://localhost:8000/admin/ (nhân viên, không cần đăng nhập)
# tùy chọn: khởi tạo dữ liệu/admin thủ công
docker compose --profile init run --rm init
```
Không dùng Docker: `pip install -r requirements.txt && uvicorn app.main:app --workers 1`.
Kiểm thử: `pip install -r requirements-dev.txt && pytest`.

## Cấu trúc
- `app/service.py` toàn bộ nghiệp vụ (không phụ thuộc framework), `app/main.py` lớp HTTP mỏng.
- `app/agent_port.py` hợp đồng với Agent; `app/stub_agent.py` Agent MẪU theo từ khóa (FAKE_LLM=1).
- `web/shop`: trang shop Savani mẫu; `web/widget/chatbot.js`: nút chatbot ở góc phải (nhúng vào web khác bằng 1 thẻ script).
- `web/admin`: trang nhân viên, mặc định KHÔNG đăng nhập (`ADMIN_AUTH=1` để bật lại). Hãy mở qua http://localhost:8000, không mở file HTML trực tiếp.
- `app/gemini_agent.py` Agent Gemini (hiểu viết tắt, gọi công cụ tra đơn/size/ticket/handoff); `app/orders.py` tra cứu đơn.

## Thử tra đơn (dữ liệu mẫu, cần đúng cả mã đơn và 4 số cuối SĐT)
SV100001/5678 (đang giao), SV100002/1234 (đã giao), SV100003/9999 (đang chuẩn bị), SV100004/4321 (đã hủy).

## Agent
`FAKE_LLM=0` + `GEMINI_API_KEY` dùng GeminiAgent. Muốn thay bằng Agent LangGraph (Mục 20):
Hiện thực `AgentPort.run_turn(AgentInput) -> AgentOutput`, trả về trong `build_agent()` (app/main.py).
Agent chỉ *đề nghị* tạo Ticket/Handoff; Backend tự kiểm tra điều kiện rồi mới ghi DB.

## Giới hạn đã biết (cần team quyết/hiện thực tiếp)
- Agent mẫu dùng dữ liệu chính sách mẫu; chưa có RAG/Chroma, MCP tool, Guardrail thật, Langfuse.
- API quản lý KB (`/api/admin/kb/*`) trả 501.
- Chỉ 1 worker: giới hạn tần suất và khóa phiên nằm trong bộ nhớ.
- Hotline là chỗ trống (`HOTLINE`). EX-COM-04 (tạo Ticket ngoài giờ khi Handoff) chưa làm.
- Mã Ticket theo BR5 `TK-YYYYMMDDXXXX`; Mục 18 ghi `TK-YYYYMMDD-XXXX` - cần thống nhất rồi sửa `_ticket_write`.
- Khóa phiên bản thư viện (`pip freeze`) trước khi nộp. Dùng Gemini miễn phí thì chỉ nạp dữ liệu mẫu.
