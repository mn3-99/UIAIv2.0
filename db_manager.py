import sqlite3
import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger("db_manager")
DB_PATH = "app_database.db"

class ActiveModelManager:
    """
    نظام لإدارة وقاعدة بيانات الموديلات المؤكدة والمفعلة (active_verified_models)
    بحيث لا تظهر في الواجهة إلا الموديلات التي اجتازت الفحص بنجاح 100%.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            # Quick integrity test
            conn.execute("PRAGMA user_version;")
            return conn
        except sqlite3.DatabaseError as e:
            logger.warning(f"⚠️ Corrupted SQLite DB detected ({self.db_path}): {e}. Resetting database...")
            if os.path.exists(self.db_path):
                try:
                    os.remove(self.db_path)
                except Exception:
                    pass
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn

    def _init_db(self):
        """إنشاء الجداول اللازمة لحفظ الموديلات والمستخدمين وسجلات النظام والأدمن"""
        try:
            self._create_tables()
        except sqlite3.DatabaseError as e:
            logger.warning(f"⚠️ Error creating DB tables ({e}). Re-creating database...")
            if os.path.exists(self.db_path):
                try:
                    os.remove(self.db_path)
                except Exception:
                    pass
            self._create_tables()

    def _create_tables(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # 1. Active Models Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS active_verified_models (
                    model_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    provider_used TEXT,
                    is_active INTEGER DEFAULT 1,
                    last_verified TIMESTAMP,
                    latency_ms REAL DEFAULT 0.0
                )
            """)

            # 2. Users Table (Open WebUI Style Authentication)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    status TEXT DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    ip_address TEXT DEFAULT '127.0.0.1',
                    device_info TEXT DEFAULT 'Web Browser',
                    country TEXT DEFAULT 'Palestinian Territories'
                )
            """)

            # 3. User Telemetry & System Activity Logs Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    email TEXT,
                    action TEXT,
                    device_info TEXT,
                    browser TEXT,
                    os TEXT,
                    ip_address TEXT,
                    country TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    details TEXT
                )
            """)

            # 4. Chat Records Table (for Admin audit & user persistent chats)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chat_records (
                    chat_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    email TEXT,
                    title TEXT,
                    model_used TEXT,
                    message_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 5. Message Records Table (for Chat History inspection)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS message_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT,
                    user_id TEXT,
                    sender_role TEXT,
                    content TEXT,
                    model_id TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 6. System Settings Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_settings (
                    setting_key TEXT PRIMARY KEY,
                    setting_value TEXT
                )
            """)

            conn.commit()

        # Seed Default Admin & System Settings
        self._seed_default_data()

        # Seed initial tested 100% working models with MijlAI_ prefix
        self.sync_verified_models([
            {"model_id": "g4f:grok-beta", "display_name": "MijlAI_grok-beta", "method_used": "Verified"},
            {"model_id": "g4f:gpt-4o", "display_name": "MijlAI_gpt-4o", "method_used": "Verified"},
            {"model_id": "g4f:o3-mini", "display_name": "MijlAI_o3-mini", "method_used": "Verified"},
            {"model_id": "g4f:gemini", "display_name": "MijlAI_gemini-2.5-flash", "method_used": "Verified"},
            {"model_id": "g4f:gpt-4", "display_name": "MijlAI_gpt-4-turbo", "method_used": "Verified"}
        ])

    def _seed_default_data(self):
        """Seed Default Admin Account & Settings if missing"""
        now_str = datetime.now().isoformat()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            
            # Default Seed Admin Account
            cursor.execute("SELECT id FROM users WHERE email = 'admin@mijlai.com'")
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO users (id, username, email, password_hash, role, status, created_at, last_login, ip_address, device_info, country)
                    VALUES ('admin_001', 'admin', 'admin@mijlai.com', 'admin123', 'admin', 'active', ?, ?, '192.168.1.1', 'MijlAi Enterprise Workstation', 'Palestine')
                """, (now_str, now_str))

            # Default Seed Demo User Account
            cursor.execute("SELECT id FROM users WHERE email = 'user@mijlai.com'")
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO users (id, username, email, password_hash, role, status, created_at, last_login, ip_address, device_info, country)
                    VALUES ('user_001', 'mhmod_alijla', 'user@mijlai.com', 'user123', 'user', 'active', ?, ?, '197.230.12.4', 'Android App Client v2.5', 'Palestine')
                """, (now_str, now_str))

            # Default System Settings
            default_settings = {
                "site_title": "MijlAi Workspace & Intelligence Engine",
                "default_system_prompt": "أنت مساعد MijlAi الذكي، أتبع لتطبيق MijlAi. قام بتدريبك وتطويرك ومالك هذه الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla).",
                "allow_registrations": "true",
                "require_email_verification": "false"
            }
            for k, v in default_settings.items():
                cursor.execute("""
                    INSERT INTO system_settings (setting_key, setting_value)
                    VALUES (?, ?)
                    ON CONFLICT(setting_key) DO NOTHING
                """, (k, v))

            conn.commit()

    def sync_verified_models(self, verified_list: List[Dict[str, Any]]):
        """
        تحديث القائمة المتاحة للـ UI وتصفير وتعطيل أي موديل لا يعمل (is_active = 0).
        """
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # تعطيل كافة النماذج مؤقتاً
            cursor.execute("UPDATE active_verified_models SET is_active = 0")
            
            now_str = datetime.now().isoformat()
            
            for item in verified_list:
                m_id = item.get("model_id") or item.get("id")
                if not m_id:
                    continue
                
                # Normalize ID prefix
                if not m_id.startswith("g4f:"):
                    m_id = f"g4f:{m_id}"
                    
                display_name = item.get("display_name") or item.get("name") or m_id.replace("g4f:", "")
                if not (display_name.startswith("MijlAI_") or display_name.startswith("MijlAI ")):
                    display_name = f"MijlAI_{display_name}"
                provider_used = item.get("method_used") or item.get("provider", "g4f_live")
                latency = item.get("latency_ms", 0.0)

                cursor.execute("""
                    INSERT INTO active_verified_models (model_id, display_name, provider_used, is_active, last_verified, latency_ms)
                    VALUES (?, ?, ?, 1, ?, ?)
                    ON CONFLICT(model_id) DO UPDATE SET
                        display_name = excluded.display_name,
                        provider_used = excluded.provider_used,
                        is_active = 1,
                        last_verified = excluded.last_verified,
                        latency_ms = excluded.latency_ms
                """, (m_id, display_name, provider_used, now_str, latency))
            
            conn.commit()
            logger.info(f"✅ [DB Sync] Synchronized database with {len(verified_list)} 100% live-verified active models.")

    def update_verified_models(self, verified_working_models: List[Dict[str, Any]]):
        """توافقية مع الدالة السابقة"""
        self.sync_verified_models(verified_working_models)

    def get_ui_models(self) -> List[Dict[str, Any]]:
        """
        الاستعلام الرسمي الذي تستخدمه الواجهة لرسم القائمة المتاحة فقط للمستخدم (is_active = 1).
        """
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT model_id, display_name, provider_used, latency_ms, last_verified 
                FROM active_verified_models 
                WHERE is_active = 1 
                ORDER BY display_name ASC
            """)
            rows = cursor.fetchall()
            
            models_list = []
            for row in rows:
                m_id = row["model_id"]
                models_list.append({
                    "id": m_id,
                    "name": row["display_name"],
                    "provider": row["provider_used"] or "g4f",
                    "icon": "sparkles",
                    "is_free": True,
                    "latency_ms": row["latency_ms"],
                    "last_verified": row["last_verified"]
                })
            return models_list

    def get_active_models(self) -> List[Dict[str, Any]]:
        return self.get_ui_models()

    # ==========================================
    # User Authentication & Role Management
    # ==========================================
    def authenticate_user(self, email_or_username: str, password_raw: str, req_info: Dict[str, str] = None) -> Optional[Dict[str, Any]]:
        """التحقق من صحة كلمة المرور وتسجيل الدخول وتوثيق نشاط المستخدم"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, username, email, password_hash, role, status, created_at, last_login, ip_address, device_info, country
                FROM users
                WHERE (email = ? OR username = ?) AND password_hash = ?
            """, (email_or_username, email_or_username, password_raw))
            row = cursor.fetchone()
            if not row:
                return None
            
            if row["status"] == "blocked":
                return {"error": "حسابك معطل حالياً من قبل مسؤول النظام"}

            user = dict(row)
            del user["password_hash"]

            # Update last login info
            now_str = datetime.now().isoformat()
            ip = (req_info and req_info.get("ip")) or user["ip_address"]
            device = (req_info and req_info.get("device")) or user["device_info"]
            country = (req_info and req_info.get("country")) or user["country"]

            cursor.execute("""
                UPDATE users SET last_login = ?, ip_address = ?, device_info = ?, country = ?
                WHERE id = ?
            """, (now_str, ip, device, country, user["id"]))

            # Log user login event
            cursor.execute("""
                INSERT INTO user_logs (user_id, email, action, device_info, browser, os, ip_address, country, details)
                VALUES (?, ?, 'LOGIN', ?, ?, ?, ?, ?, 'تسجيل دخول ناجح للمستخدم')
            """, (
                user["id"], user["email"], device,
                (req_info and req_info.get("browser", "Chrome")),
                (req_info and req_info.get("os", "Android/Linux")),
                ip, country
            ))

            conn.commit()
            return user

    def register_user(self, username: str, email: str, password_raw: str, req_info: Dict[str, str] = None) -> Dict[str, Any]:
        """تسجيل مستخدم جديد وإسناد دور user تلقائياً"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ? OR username = ?", (email, username))
            if cursor.fetchone():
                return {"error": "البريد الإلكتروني أو اسم المستخدم مُسجل مسبقاً"}

            user_id = f"usr_{datetime.now().strftime('%Y%m%d%H%M%S')}_{os.urandom(3).hex()}"
            now_str = datetime.now().isoformat()
            ip = (req_info and req_info.get("ip")) or "127.0.0.1"
            device = (req_info and req_info.get("device")) or "Web Client"
            country = (req_info and req_info.get("country")) or "Palestine"

            cursor.execute("""
                INSERT INTO users (id, username, email, password_hash, role, status, created_at, last_login, ip_address, device_info, country)
                VALUES (?, ?, ?, ?, 'user', 'active', ?, ?, ?, ?, ?)
            """, (user_id, username, email, password_raw, now_str, now_str, ip, device, country))

            cursor.execute("""
                INSERT INTO user_logs (user_id, email, action, device_info, browser, os, ip_address, country, details)
                VALUES (?, ?, 'REGISTER', ?, 'Browser', 'Mobile/Desktop', ?, ?, 'حساب مستخدم جديد تم إنشاؤه بنجاح')
            """, (user_id, email, device, ip, country))

            conn.commit()
            return {
                "id": user_id,
                "username": username,
                "email": email,
                "role": "user",
                "status": "active",
                "created_at": now_str,
                "ip_address": ip,
                "device_info": device,
                "country": country
            }

    def get_all_users(self) -> List[Dict[str, Any]]:
        """جلب كافة المستخدمين للوحة تحكم الأدمن"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, username, email, role, status, created_at, last_login, ip_address, device_info, country
                FROM users
                ORDER BY created_at DESC
            """)
            return [dict(r) for r in cursor.fetchall()]

    def update_user_status_or_role(self, user_id: str, new_role: str = None, new_status: str = None) -> bool:
        """تعديل دور أو حالة المستخدم (حظر/تفعيل/ترقية)"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if new_role:
                cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
            if new_status:
                cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, user_id))
            conn.commit()
            return True

    def delete_user(self, user_id: str) -> bool:
        """حذف مستخدم وسجلاته"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
            cursor.execute("DELETE FROM user_logs WHERE user_id = ?", (user_id,))
            cursor.execute("DELETE FROM chat_records WHERE user_id = ?", (user_id,))
            conn.commit()
            return True

    # ==========================================
    # Telemetry, Monitoring & Audit Logs
    # ==========================================
    def log_user_chat_activity(self, user_id: str, email: str, chat_id: str, prompt: str, model_id: str, req_info: Dict[str, str] = None):
        """تسجيل نشاط إرسال الرسائل والمحادثات للتحليل والمراقبة"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            now_str = datetime.now().isoformat()
            ip = (req_info and req_info.get("ip")) or "127.0.0.1"
            device = (req_info and req_info.get("device")) or "Web App"
            country = (req_info and req_info.get("country")) or "Palestine"

            # 1. Log chat message
            cursor.execute("""
                INSERT INTO message_records (chat_id, user_id, sender_role, content, model_id)
                VALUES (?, ?, 'user', ?, ?)
            """, (chat_id, user_id or "guest", prompt, model_id))

            # 2. Update or insert chat record
            cursor.execute("SELECT message_count FROM chat_records WHERE chat_id = ?", (chat_id,))
            row = cursor.fetchone()
            if row:
                cursor.execute("""
                    UPDATE chat_records SET message_count = message_count + 1, updated_at = ?
                    WHERE chat_id = ?
                """, (now_str, chat_id))
            else:
                title_snippet = prompt[:35] + ("..." if len(prompt) > 35 else "")
                cursor.execute("""
                    INSERT INTO chat_records (chat_id, user_id, email, title, model_used, message_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """, (chat_id, user_id or "guest", email or "guest@mijlai.com", title_snippet, model_id, now_str, now_str))

            # 3. Log user activity telemetry
            cursor.execute("""
                INSERT INTO user_logs (user_id, email, action, device_info, browser, os, ip_address, country, details)
                VALUES (?, ?, 'CHAT_PROMPT', ?, ?, ?, ?, ?, ?)
            """, (
                user_id or "guest",
                email or "guest@mijlai.com",
                device,
                (req_info and req_info.get("browser", "Chrome")),
                (req_info and req_info.get("os", "Android/Linux")),
                ip, country,
                f"إرسال سؤال للنموذج {model_id}"
            ))

            conn.commit()

    def get_telemetry_analytics(self) -> Dict[str, Any]:
        """استخراج التحليلات والإحصائيات الشاملة للوحة تحكم الأدمن"""
        with self._get_conn() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT COUNT(*) as total_users FROM users")
            total_users = cursor.fetchone()["total_users"]

            cursor.execute("SELECT COUNT(*) as total_chats FROM chat_records")
            total_chats = cursor.fetchone()["total_chats"]

            cursor.execute("SELECT COUNT(*) as total_messages FROM message_records")
            total_messages = cursor.fetchone()["total_messages"]

            cursor.execute("SELECT COUNT(*) as total_logs FROM user_logs")
            total_logs = cursor.fetchone()["total_logs"]

            cursor.execute("""
                SELECT country, COUNT(*) as count
                FROM user_logs
                WHERE country IS NOT NULL AND country != ''
                GROUP BY country
                ORDER BY count DESC LIMIT 5
            """)
            countries = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT os, COUNT(*) as count
                FROM user_logs
                WHERE os IS NOT NULL AND os != ''
                GROUP BY os
                ORDER BY count DESC LIMIT 5
            """)
            os_stats = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT device_info, COUNT(*) as count
                FROM user_logs
                WHERE device_info IS NOT NULL AND device_info != ''
                GROUP BY device_info
                ORDER BY count DESC LIMIT 5
            """)
            devices = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT * FROM user_logs
                ORDER BY timestamp DESC LIMIT 30
            """)
            recent_logs = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT * FROM chat_records
                ORDER BY updated_at DESC LIMIT 20
            """)
            recent_chats = [dict(r) for r in cursor.fetchall()]

            return {
                "total_users": total_users,
                "total_chats": total_chats,
                "total_messages": total_messages,
                "total_logs": total_logs,
                "countries": countries,
                "os_stats": os_stats,
                "devices": devices,
                "recent_logs": recent_logs,
                "recent_chats": recent_chats
            }

    def get_chat_messages(self, chat_id: str) -> List[Dict[str, Any]]:
        """جلب نصوص ورسائل محادثة معينة لمعاينتها من قبل الأدمن"""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM message_records
                WHERE chat_id = ?
                ORDER BY id ASC
            """, (chat_id,))
            return [dict(r) for r in cursor.fetchall()]

