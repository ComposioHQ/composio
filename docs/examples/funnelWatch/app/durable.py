"""Durable storage for compact end-of-session summaries (SQLite).

Swappable for Supabase / Google Sheets / Notion later — the interface is just
save_daily_summary() and load_recent_summaries().
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone

from app.config import settings


def _conn() -> sqlite3.Connection:
    settings.durable_db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.durable_db)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS summaries ("
        "session_date TEXT PRIMARY KEY, created_at TEXT, summary_json TEXT)"
    )
    # Arbitrary agent-saved artifacts (findings, snapshots) keyed by a string.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS artifacts ("
        "key TEXT PRIMARY KEY, created_at TEXT, value_json TEXT)"
    )
    # Lightweight profile of what the user asks about, so the agent can target context.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS interests ("
        "topic TEXT PRIMARY KEY, count INTEGER, last_asked TEXT, last_question TEXT)"
    )
    # Webhook delivery ids already processed (dedup that survives restarts).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS deliveries ("
        "id TEXT PRIMARY KEY, received_at TEXT)"
    )
    return conn


def seen_delivery(delivery_id: str, retention_days: int = 3) -> bool:
    """Record a webhook delivery id; return True if it was already seen.

    Composio deliveries repeat (retries, redeliveries), and a replayed payment event
    must not double-count MRR — so the seen-set lives in durable storage, not memory:
    restarts happen, and retries cluster exactly around them.
    """
    now = datetime.now(timezone.utc)
    with _conn() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO deliveries VALUES (?, ?)",
            (delivery_id, now.isoformat()),
        )
        conn.execute("DELETE FROM deliveries WHERE received_at < ?",
                     ((now - timedelta(days=retention_days)).isoformat(),))
        return cur.rowcount == 0


def save_daily_summary(session_date: str, summary: dict) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO summaries VALUES (?, ?, ?)",
            (session_date, datetime.now(timezone.utc).isoformat(), json.dumps(summary)),
        )


def load_recent_summaries(limit: int = 7) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT summary_json FROM summaries ORDER BY session_date DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [json.loads(r[0]) for r in rows]


def load_summaries(limit: int | None = None) -> list[dict]:
    """All daily summaries as rows (newest first), for querying the durable archive."""
    q = "SELECT summary_json FROM summaries ORDER BY session_date DESC"
    params: tuple = ()
    if limit is not None:
        q += " LIMIT ?"
        params = (limit,)
    with _conn() as conn:
        rows = conn.execute(q, params).fetchall()
    return [json.loads(r[0]) for r in rows]


def has_summary(session_date: str) -> bool:
    with _conn() as conn:
        return conn.execute(
            "SELECT 1 FROM summaries WHERE session_date = ?", (session_date,)
        ).fetchone() is not None


def prune_summaries(cutoff_date: str) -> list[str]:
    """Delete summaries dated strictly before ``cutoff_date`` (ISO). Returns the dates."""
    with _conn() as conn:
        dropped = [r[0] for r in conn.execute(
            "SELECT session_date FROM summaries WHERE session_date < ?", (cutoff_date,)
        ).fetchall()]
        conn.execute("DELETE FROM summaries WHERE session_date < ?", (cutoff_date,))
    return dropped


def save_artifact(key: str, value) -> None:
    """Upsert an arbitrary keyed artifact (agent finding, computed snapshot, …)."""
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO artifacts VALUES (?, ?, ?)",
            (key, datetime.now(timezone.utc).isoformat(), json.dumps(value, default=str)),
        )


def load_artifact(key: str, default=None):
    with _conn() as conn:
        row = conn.execute(
            "SELECT value_json FROM artifacts WHERE key = ?", (key,)
        ).fetchone()
    return json.loads(row[0]) if row else default


def list_artifacts() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT key, created_at FROM artifacts ORDER BY created_at DESC"
        ).fetchall()
    return [{"key": k, "created_at": c} for k, c in rows]


def bump_interest(topic: str, question: str) -> None:
    """Increment a topic's tally and remember the latest example question."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO interests(topic, count, last_asked, last_question) VALUES (?, 1, ?, ?) "
            "ON CONFLICT(topic) DO UPDATE SET count = count + 1, "
            "last_asked = excluded.last_asked, last_question = excluded.last_question",
            (topic, now, question),
        )


def top_interests(limit: int = 5) -> list[dict]:
    """Most-asked-about topics, most frequent first."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT topic, count, last_asked, last_question FROM interests "
            "ORDER BY count DESC, last_asked DESC LIMIT ?", (limit,)
        ).fetchall()
    return [{"topic": t, "count": c, "last_asked": la, "last_question": lq}
            for t, c, la, lq in rows]
