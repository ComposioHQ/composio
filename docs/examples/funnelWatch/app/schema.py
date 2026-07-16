"""The canonical layout of the storage mount — the single source of truth.

The structure under ``/mnt/files/{date}/`` is *defined here*, not discovered by scanning
the mount (which the agent's ad-hoc code could pollute). ``app.normalize`` writes exactly
these streams with exactly these columns; ``app.analytics`` writes the snapshots; readers
(``app.pipe``, ``app.analysis``, the agent prompt) consult this registry so "what's in the
mount" always has a deterministic answer owned by code we control.

To add a data stream you register it here and add its handler in ``app.normalize`` — the
agent never gets to invent one.
"""
from __future__ import annotations

# Canonical event streams (normalized/*.jsonl). Keep in lockstep with app.normalize.
STREAMS: dict[str, dict] = {
    "subscription_events": {
        "path": "normalized/subscription_events.jsonl",
        "event_types": ["trial_started", "subscription_started", "subscription_churned",
                        "payment_succeeded", "payment_failed"],
        "columns": ["ts", "type", "plan", "mrr_cents", "account_id", "source", "campaign"],
    },
    "funnel_events": {
        "path": "normalized/funnel_events.jsonl",
        "event_types": ["visit", "signup", "activation", "click"],
        "columns": ["ts", "type", "source", "campaign", "visitor_id", "account_id", "element"],
    },
    "lead_events": {
        "path": "normalized/lead_events.jsonl",
        "event_types": ["lead_created", "lead_qualified", "deal_created", "deal_won", "deal_lost"],
        "columns": ["ts", "type", "lead_id", "account_id", "source", "campaign", "segment", "value_cents"],
    },
    "ad_events": {
        "path": "normalized/ad_events.jsonl",
        "event_types": ["ad_snapshot", "campaign_snapshot", "spend_snapshot"],
        "columns": ["ts", "type", "source", "campaign", "spend_cents", "clicks", "impressions"],
    },
}

# Subtrees the app owns and readers trust. Anything else on the mount (e.g. the agent's
# scratch under scripts/) is ignored as data and may be pruned freely.
CANONICAL_DIRS = ("raw", "normalized", "analytics", "reports", "durable")
SCRATCH_DIRS = ("scripts",)


def stream(name: str) -> dict:
    """Return a registered stream's spec, or raise with the list of known streams."""
    name = name[:-6] if name.endswith(".jsonl") else name
    if name not in STREAMS:
        raise KeyError(f"unknown stream {name!r}; known streams: {sorted(STREAMS)}")
    return STREAMS[name]


def columns(name: str) -> list[str]:
    return list(stream(name)["columns"])


def is_canonical(rel: str) -> bool:
    """True if a mount-relative path belongs to an app-owned (trusted) subtree."""
    top = rel.strip("/").split("/", 1)[0]
    return top in CANONICAL_DIRS


def describe() -> dict:
    """The contract, as plain data — safe to return over an API or feed a prompt."""
    return {
        "streams": {name: {"path": s["path"], "columns": s["columns"],
                           "event_types": s["event_types"]}
                    for name, s in STREAMS.items()},
        "canonical_dirs": list(CANONICAL_DIRS),
    }


def prompt_layout() -> str:
    """Compact LLM-readable description of the mount data layout (relative to the day's
    workspace path)."""
    lines = ["Event streams: <workspace>/normalized/<name>.jsonl (one JSON object per line):"]
    for name, s in STREAMS.items():
        types = ", ".join(s["event_types"])
        cols = ", ".join(s["columns"])
        lines.append(f"  {name}.jsonl  type in {{{types}}}; columns: {cols}.")
    lines.append("Precomputed snapshots: <workspace>/analytics/*.json.")
    return "\n".join(lines)
