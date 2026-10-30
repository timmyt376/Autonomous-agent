import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

class Memory:
    def __init__(self, path: Path):
        self.path = path
        self._init()

    def _connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        return db

    def _init(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)

    def add_message(self, role: str, content: str):
        with self._connect() as db:
            db.execute("INSERT INTO messages(role,content,created_at) VALUES(?,?,?)", (role, content, self._now()))

    def recent_messages(self, limit=12):
        with self._connect() as db:
            rows = db.execute("SELECT role,content FROM messages ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(x) for x in reversed(rows)]

    def remember(self, content: str, kind="note"):
        with self._connect() as db:
            db.execute("INSERT INTO memories(kind,content,created_at) VALUES(?,?,?)", (kind, content, self._now()))

    def search(self, query: str, limit=10):
        with self._connect() as db:
            rows = db.execute("SELECT id,kind,content,created_at FROM memories WHERE content LIKE ? ORDER BY id DESC LIMIT ?", (f"%{query}%", limit)).fetchall()
        return [dict(x) for x in rows]

    def add_goal(self, title: str):
        with self._connect() as db:
            cur = db.execute("INSERT INTO goals(title,created_at) VALUES(?,?)", (title, self._now()))
            return cur.lastrowid

    def goals(self):
        with self._connect() as db:
            return [dict(x) for x in db.execute("SELECT * FROM goals ORDER BY id DESC").fetchall()]

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat()
