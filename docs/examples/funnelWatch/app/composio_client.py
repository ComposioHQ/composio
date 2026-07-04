"""Composio + OpenAI clients, lazily created and degrade-gracefully.

READ-ONLY GUARANTEE: this module is the single place tools are granted, and it
grants them tool-by-tool, not toolkit-by-toolkit. ``READ_ONLY_TOOLS`` is an
explicit allowlist passed to the session as per-toolkit enable lists, so the
spec's forbidden actions (refunds, budget changes, emails, lifecycle edits, …)
aren't merely unregistered — they are outside the session's tool surface, and
SEARCH_TOOLS / run_composio_tool cannot reach them. The agent prompt's
"read-only" instruction is the last layer of defense, not the only one.

Transient Composio failures retry with backoff (never latch): a blip at boot
must not permanently downgrade a 24/7 monitor to local-only mode.
"""
from __future__ import annotations

import threading
import time

from app.config import settings

# Per-toolkit allowlists of read tools (slugs verified against the live catalog).
# The agent only observes and explains, so only reads are granted. Slack sends
# happen host-side in app/slack.py — outside the session — so even "post a
# message" is not on the agent's surface.
READ_ONLY_TOOLS: dict[str, list[str]] = {
    "stripe": [
        "STRIPE_RETRIEVE_BALANCE",
        "STRIPE_LIST_BALANCE_TRANSACTIONS",
        "STRIPE_GET_BALANCE_TRANSACTION",
        "STRIPE_LIST_CHARGES",
        "STRIPE_RETRIEVE_CHARGE",
        "STRIPE_LIST_CUSTOMERS",
        "STRIPE_SEARCH_CUSTOMERS",
        "STRIPE_RETRIEVE_CUSTOMER",
        "STRIPE_LIST_SUBSCRIPTIONS",
        "STRIPE_SEARCH_SUBSCRIPTIONS",
        "STRIPE_GET_SUBSCRIPTION",
        "STRIPE_LIST_SUBSCRIPTION_ITEMS",
        "STRIPE_LIST_CUSTOMER_SUBSCRIPTIONS",
    ],
    "hubspot": [
        "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
        "HUBSPOT_LIST_CONTACTS",
        "HUBSPOT_SEARCH_DEALS",
        "HUBSPOT_LIST_DEALS",
        "HUBSPOT_SEARCH_COMPANIES",
        "HUBSPOT_RETRIEVE_ALL_PIPELINES_FOR_SPECIFIED_OBJECT_TYPE",
        "HUBSPOT_READ_BATCH_OF_CRM_OBJECTS_BY_ID_OR_PROPERTY_VALUES",
    ],
    "mailchimp": [
        "MAILCHIMP_LIST_CAMPAIGNS",
        "MAILCHIMP_SEARCH_CAMPAIGNS",
        "MAILCHIMP_GET_CAMPAIGN_INFO",
        "MAILCHIMP_GET_CAMPAIGN_REPORT",
        "MAILCHIMP_LIST_CAMPAIGN_REPORTS",
        "MAILCHIMP_LIST_CAMPAIGN_OPEN_DETAILS",
    ],
    "googleads": [
        "GOOGLEADS_SEARCH_STREAM_GAQL",
        "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS",
        "GOOGLEADS_GET_CAMPAIGN_BY_ID",
        "GOOGLEADS_GET_CAMPAIGN_BY_NAME",
    ],
    "metaads": [
        "METAADS_GET_INSIGHTS",
        "METAADS_GET_AD_ACCOUNTS",
        "METAADS_LIST_ADS",
        "METAADS_GET_OBJECT",
    ],
    "slack": [
        # Read-only Slack, for conversational context. Sending stays host-side.
        "SLACK_FETCH_CONVERSATION_HISTORY",
        "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
        "SLACK_FIND_CHANNELS",
        "SLACK_SEARCH_MESSAGES",
        "SLACK_RETRIEVE_CONVERSATION_INFORMATION",
    ],
}

# Derived from the allowlist so the toolkit list and the tool list can't drift.
READ_ONLY_TOOLKITS = [toolkit.upper() for toolkit in READ_ONLY_TOOLS]

_openai = None
_composio = None
_lock = threading.Lock()
# Backoff instead of a latch: after a failure, retry no sooner than _retry_at.
_retry_at = 0.0
_backoff_s = 30.0
_BACKOFF_MAX_S = 600.0


def get_openai():
    """Return an OpenAI client, or None if unavailable."""
    global _openai
    if _openai is not None:
        return _openai
    if not settings.has_openai:
        return None
    try:
        from openai import OpenAI
        _openai = OpenAI(api_key=settings.openai_api_key)
        return _openai
    except Exception:
        return None


def get_composio():
    """Return a Composio client (OpenAI Responses provider), or None if unavailable.

    Failures schedule a retry with exponential backoff instead of latching, so a
    transient error degrades the app only until Composio is reachable again.
    """
    global _composio, _retry_at, _backoff_s
    if _composio is not None:
        return _composio
    if not settings.has_composio or time.time() < _retry_at:
        return None
    with _lock:
        if _composio is not None or time.time() < _retry_at:
            return _composio
        try:
            from composio import Composio
            from composio_openai import OpenAIResponsesProvider
            kwargs = {}
            if settings.toolkit_versions:
                # Pinned versions keep payload/tool schemas stable and let manual
                # execution (app/slack.py) drop dangerously_skip_version_check.
                kwargs["toolkit_versions"] = settings.toolkit_versions
            _composio = Composio(provider=OpenAIResponsesProvider(),
                                 api_key=settings.composio_api_key, **kwargs)
            _backoff_s = 30.0
            return _composio
        except Exception:
            _retry_at = time.time() + _backoff_s
            _backoff_s = min(_BACKOFF_MAX_S, _backoff_s * 2)
            return None
