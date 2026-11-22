# ResolveAI 

Web chat khách hàng + trang quản trị nhân viên + Backend FastAPI, đóng gói một container (docker-compose).

## Chạy
```bash
cp .env.example .env        # đổi SECRET_KEY; đặt POLICY_ADMIN_KEY nếu dùng trang quản lý chính sách
docker compose up --build   # http://localhost:8000  (trang bán hàng demo + nút chatbot)   http://localhost:8000/admin/  (nhân viên, KHÔNG cần đăng nhập)
# tùy chọn: khởi tạo dữ liệu thủ công
docker compose --profile init run --rm init
```
Không dùng Docker: `pip install -r requirements.txt && uvicorn app.main:app --workers 1`.
Kiểm thử: `pip install -r requirements-dev.txt && pytest`.

## Bật Gemini và công cụ của Agent

Mặc định `FAKE_LLM=1` để chạy an toàn không cần gọi API. Để dùng Gemini, đặt các biến sau trong môi trường chạy (Render: Environment) rồi khởi động lại service:

```env
FAKE_LLM=0
GEMINI_API_KEY=<khóa Gemini>
LLM_MODEL=gemini-3.5-flash-lite
LLM_FALLBACK_MODEL=gemini-3.1-flash-lite
EMBED_MODEL=gemini-embedding-2
```

Không commit khóa API vào GitHub. Gemini 3.5 Flash-Lite là model chính; nếu gọi lỗi, Agent thử Gemini 3.1 Flash-Lite rồi mới quay về StubAgent. Agent dùng vòng lặp function calling có giới hạn: Gemini có thể tự chọn `search_kb` để lấy tài liệu chính sách, `lookup_order` để tra Mock Order DB đã xác thực, hoặc `recommend_size` để tính size. Backend chạy công cụ allowlist, gửi kết quả lại cho Gemini, rồi kiểm tra câu trả lời và nguồn trước khi trả khách. Ticket vẫn phải qua luồng thu thập/xác nhận hiện có; AI không được ghi trực tiếp vào DB.

Workflow Gemini dùng LangGraph với các node Input Guard, Intent Router, Policy RAG, Order Lookup, Ticket/Handoff và Output Guard. RAG chia tài liệu thành đoạn 400 token, overlap 50, dùng Gemini Embedding 2 với vector 768 chiều, cosine, Top-3 và ngưỡng Handoff 0,65. Chroma nhúng lưu tại `DATA_DIR/chroma`; chỉ mục tự lập lại khi tài liệu hoặc model embedding đổi.

Để bật trace Langfuse, đặt `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` và tùy chọn `LANGFUSE_HOST`. Trace ghi tên model, loại bước và token usage Gemini; mặc định không gửi nội dung hội thoại vào Langfuse. Thiếu khóa hoặc Langfuse lỗi thì chat vẫn tiếp tục. Cài thêm thư viện bằng `pip install -r requirements.txt`.

Eval có 21 ca cố định trong `evals/resolveai.jsonl`. Chạy thủ công sau khi đặt `FAKE_LLM=0` và `GEMINI_API_KEY` bằng `python -m scripts.run_evals`; kết quả sẽ ghi vào `DATA_DIR/evals/latest.json`. Không tự chạy khi app khởi động. Đầu vào gửi Gemini và câu trả lời Gemini được che email/số điện thoại theo regex trước khi gửi/hiển thị.

Để demo, hệ thống có Mock Order DB SQLite gồm 6 đơn giả `SVN1001`–`SVN1006` ở `DATA_DIR/mock_orders.db`. Tra đơn bắt buộc có mã đơn và 4 số cuối số điện thoại hoặc email; kết quả chỉ trả các trường được phép và luôn ghi rõ là dữ liệu demo. Agent chưa tra cứu đơn hàng thật: repo không có API hoặc bảng dữ liệu đơn hàng đang vận hành.

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

Trang thủ công `/admin/policies.html` cho phép thêm/sửa/xóa file chính sách. Trang này yêu cầu
`POLICY_ADMIN_KEY` (hoặc `ADMIN_BOOTSTRAP_PASSWORD`); sau khi lưu cần khởi động lại service để Chroma nạp lại chỉ mục.

## Cấu trúc
- `web/store` trang bán hàng demo, `web/widget` nút chatbot nhúng, `web/chat` khung chat, `web/admin` trang nhân viên.
- `app/service.py` toàn bộ nghiệp vụ (không phụ thuộc framework), `app/main.py` lớp HTTP mỏng.
- `app/agent_port.py` hợp đồng với Agent; `app/stub_agent.py` Agent MẪU theo từ khóa (FAKE_LLM=1).
- `web/chat`, `web/admin`: HTML/JS thuần, không cần build.

## Kiến trúc Agent và giới hạn

`app/agent_port.py` là hợp đồng Agent; `app/main.py` chọn `StubAgent` hoặc `GeminiAgent` theo `FAKE_LLM`. `app/gemini_agent.py` chạy workflow LangGraph và điều phối tool loop; các công cụ chỉ thực thi hàm backend cho phép. Agent chỉ *đề nghị* Ticket/Handoff; Backend tự kiểm tra điều kiện rồi mới ghi DB. `app/rag.py` xử lý chunking, embedding, xếp hạng vector và cache index; `app/observability.py` gửi span không kèm nội dung khách hàng tới Langfuse khi đã cấu hình.

## Giới hạn đã biết (cần team quyết/hiện thực tiếp)
- Chroma chạy nhúng và lưu trên ổ đĩa cục bộ của service; chưa có MCP tool hoặc tích hợp đơn hàng thật.
- Ticket, tư vấn size thiếu thông tin, guardrail theo cụm từ và chuyển nhân viên vẫn có các bước xử lý cố định trong `StubAgent`; tool loop chưa tự quyết định mọi luồng.
- Tab "Tài liệu KB" chỉ xem. Việc quản lý file chính sách dùng trang riêng `/admin/policies.html`; các API KB cũ vẫn trả 501.
- KB-03/KB-04 dùng bảng size phổ thông S-2XL, Savani cần xác nhận số đo riêng; KB-06 (vận chuyển) chưa có phí/thời gian giao chính thức. Cần Savani cung cấp.
- Chỉ 1 worker: giới hạn tần suất và khóa phiên nằm trong bộ nhớ.
- Hotline là chỗ trống (`HOTLINE`). EX-COM-04 (tạo Ticket ngoài giờ khi Handoff) chưa làm.
- Báo cáo eval cần được chạy và lưu trước khi nộp; không chạy tự động vì sẽ gọi Gemini API.
- Chi phí chưa được tính thành tiền trong trace; hiện ghi token usage để đối chiếu. Dùng Gemini miễn phí thì chỉ nạp dữ liệu mẫu.
