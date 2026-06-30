"""Composio + OpenAI clients, lazily created and degrade-gracefully.

READ-ONLY GUARANTEE: this module is the single place tools are registered. Only the
read-only toolkits below are ever exposed, plus Slack send for internal updates.
The spec's forbidden actions (refunds, budget changes, emails, lifecycle edits, …)
are never added here, so the agent structurally cannot perform them.
"""
from __future__ import annotations

from app.config import settings

# Read-only data toolkits the agent may query, plus Slack send for internal alerts.
READ_ONLY_TOOLKITS = ["STRIPE", "HUBSPOT", "MAILCHIMP", "GOOGLEADS", "METAADS", "SLACK"]

_openai = None
_composio = None
_composio_failed = False


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
    """Return a Composio client (OpenAI Responses provider), or None if unavailable."""
    global _composio, _composio_failed
    if _composio is not None or _composio_failed:
        return _composio
    if not settings.has_composio:
        _composio_failed = True
        return None
    try:
        from composio import Composio
        from composio_openai import OpenAIResponsesProvider
        _composio = Composio(provider=OpenAIResponsesProvider(),
                             api_key=settings.composio_api_key)
        return _composio
    except Exception:
        _composio_failed = True
        return None
