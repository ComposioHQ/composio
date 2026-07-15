"""A lightweight profile of what the user asks about.

Every chat question is classified into one or more business topics (deterministic
keyword match — no LLM) and tallied in durable storage. The agent reads the profile
before enriching a notification so it knows which angles the user cares about, and
therefore what extra context to pull / data to query.
"""
from __future__ import annotations

from app import durable

# topic -> trigger keywords. Mirrors the domains the analytics already model.
TOPICS: dict[str, tuple[str, ...]] = {
    "revenue/MRR": ("mrr", "revenue", "money", "arpu", "income"),
    "churn": ("churn", "cancel", "retention"),
    "failed payments": ("failed payment", "payment fail", "decline", "dunning", "invoice"),
    "trials": ("trial",),
    "funnel/signups": ("signup", "sign up", "funnel", "visit", "traffic", "convert", "conversion"),
    "activation": ("activat",),
    "plans": ("plan", "tier", "starter", "pro", "enterprise"),
    "acquisition sources": ("source", "channel", "organic", "acquisition"),
    "ad spend": ("ads", "ad spend", "spend", "campaign", "roas", "cac", "google ads", "meta"),
    "leads": ("lead", "hubspot", "crm"),
    "button clicks": ("click", "button", "cta"),
}


def classify(question: str) -> list[str]:
    """Topics a question touches, or ['general'] if none match."""
    q = (question or "").lower()
    hits = [topic for topic, kws in TOPICS.items() if any(k in q for k in kws)]
    return hits or ["general"]


def record(question: str) -> None:
    """Tally the topics of a user question. Best-effort — never breaks the request."""
    try:
        example = (question or "").strip()[:200]
        for topic in classify(question):
            durable.bump_interest(topic, example)
    except Exception:
        pass


def profile(limit: int = 5) -> list[dict]:
    """The user's most-asked topics, for the agent to target context."""
    try:
        return durable.top_interests(limit)
    except Exception:
        return []
