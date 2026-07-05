"""Interactive Slackbot.

Handles inbound Slack messages (delivered as Composio Slack triggers): answers
questions about the funnel/revenue using the agent, or creates a custom alert when
the message is a standing request — the same two capabilities as the dashboard.

Outbound replies go through slack.send_message (real Slack when connected, otherwise
the local outbox). Replies to the bot's own messages are ignored to avoid loops.
"""
from __future__ import annotations

import collections
import re

from app import agent, monitors, slack
from app.config import settings
from app.volume import Volume

# Loop guard: channel triggers also fire for the bot's OWN replies. Remember the last
# few things we said and ignore inbound messages that match, so we never reply to
# ourselves (in addition to the bot_id/app_id check in _extract).
_recent_replies: "collections.deque[str]" = collections.deque(maxlen=30)

# Idempotency: Composio can deliver the same Slack message event more than once
# (webhook retries, or multiple subscribed trigger instances). Track message ids we've
# already handled so each user message is answered exactly once.
_seen_messages: "collections.deque[str]" = collections.deque(maxlen=500)


def _norm(text: str) -> str:
    return " ".join((text or "").split())[:200]


def _message_id(data: dict) -> str | None:
    """A stable per-message id from a (flexible) Slack event payload, used to drop
    duplicate deliveries. Falls back to channel+user+text when no id is present."""
    event = data.get("event") or data.get("message") or data
    for key in ("client_msg_id", "event_id", "ts", "event_ts", "message_id"):
        val = event.get(key) or data.get(key)
        if val:
            return str(val)
    channel = event.get("channel") or event.get("channel_id") or data.get("channel")
    user = event.get("user") or event.get("user_id") or data.get("user")
    text = event.get("text") or data.get("text") or ""
    return f"{channel}:{user}:{_norm(text)}" if (channel or user or text) else None

STARTUP_MESSAGE = "watching your growth and sales funnels - stay tuned :)"

# A standing request to be notified — distinct from a one-off question.
_ALERT_RE = re.compile(
    r"\b(alert me|notify me|ping me|warn me|let me know|set ?up an alert|create an alert|"
    r"add an alert|watch (for|whether|if|when)|keep an eye|remind me (if|when|whenever)|"
    r"tell me (if|when|whenever)|monitor (if|when|whether))\b",
    re.IGNORECASE,
)


def is_inbound(slug: str) -> bool:
    """True for Slack message-received triggers (not our own outbound action)."""
    s = (slug or "").upper()
    return s.startswith("SLACK") and any(k in s for k in ("RECEIVE", "MESSAGE", "MENTION", "REPLY"))


def announce_startup(volume: Volume) -> dict:
    return slack.send_message(volume, STARTUP_MESSAGE)


# Slack encodes mentions as <@U123> or <@U123|name>.
_MENTION_RE = re.compile(r"<@([A-Z0-9]+)(?:\|[^>]*)?>")


def _extract(data: dict) -> dict:
    """Pull text/channel/user/bot from a (flexible) Slack event payload."""
    event = data.get("event") or data.get("message") or data
    # Bound the input before any regex work — inbound text is attacker-controlled.
    raw = (event.get("text") or data.get("text") or "")[:4000]
    channel = (event.get("channel") or event.get("channel_id")
               or data.get("channel") or data.get("channel_id"))
    user = event.get("user") or event.get("user_id") or data.get("user")
    is_bot = bool(event.get("bot_id") or data.get("bot_id") or event.get("app_id")
                  or data.get("app_id") or event.get("subtype") == "bot_message")
    mentions = _MENTION_RE.findall(raw)
    # Strip mention tokens so the agent sees a clean question ("@FunnelWatch mrr?" -> "mrr?").
    text = _MENTION_RE.sub("", raw).strip()
    # Slack DM channel ids start with "D"; channel type is sometimes given explicitly.
    is_dm = (event.get("channel_type") == "im") or str(channel or "").startswith("D")
    return {"text": text, "channel": channel, "user": user, "is_bot": is_bot,
            "mentions": mentions, "is_dm": is_dm}


def _context(volume: Volume) -> dict:
    return {
        "daily_metrics": volume.read_json("analytics/daily_metrics.json", {}),
        "plan_comparison": volume.read_json("analytics/plan_comparison.json", {}),
        "funnel": volume.read_json("analytics/funnel.json", {}),
        "button_clicks": volume.read_json("analytics/clicks.json", {}),
        "source_performance": volume.read_json("analytics/source_performance.json", {}),
        "insights": volume.read_json("analytics/insights.json", {}),
    }


def process_inbound(volume: Volume, payload: dict) -> dict:
    data = payload.get("data", {}) or {}
    msg = _extract(data)
    if msg["is_bot"] or not msg["text"]:
        return {"status": "ignored", "reason": "bot or empty message"}
    # When the bot's user id is known, only engage when tagged or DM'd — so it can
    # live in many channels and answer on @mention instead of every message.
    bot_id = settings.slack_bot_user_id
    if bot_id and not (bot_id in msg["mentions"] or msg["is_dm"]):
        return {"status": "ignored", "reason": "not addressed (no mention / not a DM)"}
    mid = _message_id(data)
    if mid is not None:
        if mid in _seen_messages:
            return {"status": "ignored", "reason": "duplicate delivery"}
        _seen_messages.append(mid)
    if _norm(msg["text"]) in _recent_replies:
        return {"status": "ignored", "reason": "own reply (loop guard)"}

    if _ALERT_RE.search(msg["text"]):
        monitor = monitors.add_monitor({"question": msg["text"],
                                        "slack_channel": msg["channel"]})
        reply = (f'✅ Got it — I\'ll watch this for you: "{monitor["name"]}". '
                 f"I'll post here when it triggers.")
        result = {"intent": "create_alert", "reply": reply, "monitor_id": monitor["id"],
                  "monitor_name": monitor["name"]}
    else:
        # Acknowledge immediately so the user sees an answer is coming before the
        # (slower) agent runs. Tracked in _recent_replies so the echo doesn't loop.
        ack = "🔎 On it — pulling the latest numbers…"
        _recent_replies.append(_norm(ack))
        slack.send_message(volume, ack, channel=msg["channel"])
        # Same depth as the dashboard chat: the full agent loop (sandbox + tools)
        # with a deterministic fallback. We're on a worker thread, so the slow
        # path can't block the webhook.
        reply = agent.deep_answer(volume, msg["text"], _context(volume))
        result = {"intent": "answer", "reply": reply}

    _recent_replies.append(_norm(reply))
    slack.send_message(volume, reply, channel=msg["channel"])
    return result
