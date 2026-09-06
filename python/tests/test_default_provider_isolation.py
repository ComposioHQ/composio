"""Regression tests for per-instance default provider isolation.

Ensures that ``Composio()`` instances constructed without an explicit provider
each receive their own provider instance, instead of sharing a module-level
singleton whose ``execute_tool`` binding is overwritten by the last-constructed
instance (see issue #4369).
"""

import os
from contextlib import ExitStack
from unittest.mock import patch

from composio import Composio
from composio.core.provider._openai import OpenAIProvider

_PATCHED_MODELS = [
    "composio.core.models.Tools",
    "composio.core.models.Toolkits",
    "composio.core.models.Triggers",
    "composio.core.models.AuthConfigs",
    "composio.core.models.ConnectedAccounts",
]


def _sdk_patches() -> list:
    return [patch(target) for target in _PATCHED_MODELS]


def _make_sdk(api_key: str) -> Composio:
    with patch.dict(os.environ, {"COMPOSIO_API_KEY": api_key}):
        patches = _sdk_patches()
        for started in patches:
            started.start()
        try:
            return Composio()
        finally:
            for started in patches:
                started.stop()


def test_default_provider_is_not_shared_between_instances():
    sdk_a = _make_sdk("key-a")
    sdk_b = _make_sdk("key-b")
    assert sdk_a.provider is not sdk_b.provider


def test_default_provider_is_openai_provider():
    sdk = _make_sdk("key-a")
    assert isinstance(sdk.provider, OpenAIProvider)
    assert sdk.provider.name == "openai"


def test_explicit_provider_is_used_unchanged():
    provider = OpenAIProvider()
    with ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ, {"COMPOSIO_API_KEY": "key-a"}))
        for started in _sdk_patches():
            started.start()
            stack.push(started)
        sdk = Composio(provider=provider)
    assert sdk.provider is provider
