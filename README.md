# ResolveAI - Mục 25: Giao diện chat + triển khai (khung mẫu)

Web chat khách hàng + trang quản trị nhân viên + Backend FastAPI, đóng gói một container (docker-compose).

## Chạy
```bash
cp .env.example .env        # đổi SECRET_KEY, ADMIN_BOOTSTRAP_PASSWORD
docker compose up --build   # http://localhost:8000  (trang bán hàng demo + nút chatbot)   http://localhost:8000/admin/  (nhân viên, KHÔNG cần đăng nhập)
# tùy chọn: khởi tạo dữ liệu thủ công
docker compose --profile init run --rm init
```
Không dùng Docker: `pip install -r requirements.txt && uvicorn app.main:app --workers 1`.
Kiểm thử: `pip install -r requirements-dev.txt && pytest`.

## Nhúng chatbot vào web khác (kể cả savani.vn)
Chỉ cần 1 dòng trước `</body>`: `<script src="https://<máy-chủ-resolveai>/widget/widget.js" defer></script>`.
Khung chat là iframe `/chat/` của chính máy chủ ResolveAI nên không dính CORS. Lỗi "Không kết nối được máy chủ" thường do
mở file HTML trực tiếp (file://) hoặc bằng Live Server: hãy luôn mở qua địa chỉ của backend (`http://localhost:8000`).

## Dữ liệu mẫu cho trang quản trị
Đặt `SEED_DEMO=1` trong `.env` (đã bật sẵn ở `.env.example`) để khi khởi động nạp 12 phiên chat, 5 Ticket, hàng đợi dựa trên 6 đơn mẫu SVN1001-SVN1006 ở Mục 22.4. Chạy lại không nạp trùng (phiên `demo-*`). Tắt khi chạy thật.

## Mã Ticket
Định dạng `TK-YYYYMMDDXXXX` (ngày theo giờ Việt Nam, XXXX là số thứ tự trong ngày, bắt đầu 0001), ví dụ `TK-202611180001`.

## Quản trị không đăng nhập
Trang `/admin/` và `/api/admin/*` mở cho bất kỳ ai truy cập được máy chủ. Chỉ dùng nội bộ/localhost, hoặc đặt sau
reverse proxy có xác thực khi triển khai thật.

## Cấu trúc
- `web/store` trang bán hàng demo, `web/widget` nút chatbot nhúng, `web/chat` khung chat, `web/admin` trang nhân viên.
- `app/service.py` toàn bộ nghiệp vụ (không phụ thuộc framework), `app/main.py` lớp HTTP mỏng.
- `app/agent_port.py` hợp đồng với Agent; `app/stub_agent.py` Agent MẪU theo từ khóa (FAKE_LLM=1).
- `web/chat`, `web/admin`: HTML/JS thuần, không cần build.

## Thay Agent mẫu bằng Agent LangGraph (Mục 20)
Hiện thực `AgentPort.run_turn(AgentInput) -> AgentOutput`, trả về trong `build_agent()` (app/main.py).
Agent chỉ *đề nghị* tạo Ticket/Handoff; Backend tự kiểm tra điều kiện rồi mới ghi DB.

## Giới hạn đã biết (cần team quyết/hiện thực tiếp)
- Agent mẫu dùng dữ liệu chính sách mẫu; chưa có RAG/Chroma, MCP tool, Guardrail thật, Langfuse.
- Tab "Tài liệu KB" chỉ xem (đọc `data/policies/*.md`, KB-01..KB-06 theo Mục 6.4 và 21.3). Tải lên/sửa/xóa (`POST/PUT/DELETE /api/admin/kb/docs`) vẫn trả 501, thuộc module RAG.
- KB-03/KB-04 dùng bảng size phổ thông S-2XL, Savani cần xác nhận số đo riêng; KB-06 (vận chuyển) chưa có phí/thời gian giao chính thức. Cần Savani cung cấp.
- Chỉ 1 worker: giới hạn tần suất và khóa phiên nằm trong bộ nhớ.
- Hotline là chỗ trống (`HOTLINE`). EX-COM-04 (tạo Ticket ngoài giờ khi Handoff) chưa làm.
- Khóa phiên bản thư viện (`pip freeze`) trước khi nộp. Dùng Gemini miễn phí thì chỉ nạp dữ liệu mẫu.
