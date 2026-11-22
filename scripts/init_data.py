"""Khởi tạo dữ liệu (idempotent): tạo schema và tài khoản admin đầu tiên.
Chạy: docker compose --profile init run --rm init"""
from app.config import load_settings
from app.db import Database
from app.orders import OrderRepo
from app.service import ChatService
from app.stub_agent import StubAgent

s = load_settings()
db = Database(s.app_db_path)
db.init()
ChatService(db, s, StubAgent()).ensure_bootstrap_admin()
if s.seed_demo_orders:
    OrderRepo(db).seed_demo()
print(f"OK: {s.app_db_path} (admin: {'đã tạo/đã có' if s.admin_user else 'chưa cấu hình ADMIN_BOOTSTRAP_USER'})")
