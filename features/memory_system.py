# features/memory_system.py
import sqlite3
import json
from datetime import datetime
from typing import List, Dict

class LongTermMemory:
    def __init__(self, db_path: str = "app_database.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    importance REAL DEFAULT 1.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)")

    def add_memory(self, user_id: str, memory_type: str, content: str, importance: float = 1.0):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO memories (user_id, memory_type, content, importance)
                VALUES (?, ?, ?, ?)
            """, (user_id, memory_type, content, importance))

    def retrieve_relevant_memories(self, user_id: str, query: str, top_k: int = 5) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT id, memory_type, content, importance, created_at
                FROM memories WHERE user_id = ?
                ORDER BY importance DESC, created_at DESC LIMIT ?
            """, (user_id, top_k))
            return [
                {"id": r[0], "type": r[1], "content": r[2], "importance": r[3], "created_at": r[4]}
                for r in cursor.fetchall()
            ]

    def get_user_context(self, user_id: str, current_query: str) -> str:
        memories = self.retrieve_relevant_memories(user_id, current_query)
        if not memories:
            return ""
        context_parts = []
        for mem in memories:
            prefix = {"fact": "حقيقة معروفة:", "summary": "ملخص سابق:", "preference": "تفضيل:"}.get(mem["type"], "سجل:")
            context_parts.append(f"{prefix} {mem['content']}")
        return "\n".join(context_parts)

long_term_memory = LongTermMemory()
