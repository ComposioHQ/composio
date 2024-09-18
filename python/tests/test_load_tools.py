"""
E2E Tests for plugin demos and examples.
"""

import importlib
import os
from unittest import mock

import pytest

from composio import Action


# Plugin test definitions
PLUGINS = (
    "autogen",
    "camel",
    "claude",
    "crew_ai",
    "griptape",
    "julep",
    "langchain",
    "llamaindex",
    "lyzr",
    "openai",
    "langgraph",
    "phidata",
)


@pytest.mark.skipif(
    condition=os.environ.get("CI", "false") == "true",
    reason="Testing in CI will lead to too much LLM API usage",
)
@pytest.mark.parametrize("plugin", PLUGINS)
def test_load_tools(plugin: str) -> None:
    """Test an example with given environment."""
    plugin_to_test = os.getenv("PLUGIN_TO_TEST")
    if plugin_to_test is not None and plugin_to_test != plugin:
        pytest.skip(f"Skipping {plugin}")

    toolset = importlib.import_module(f"composio_{plugin}").ComposioToolSet()
    actions = [action for action in Action.all() if "APIFY_" not in action.slug]
    with (
        mock.patch.object(toolset, "check_connected_account"),
        mock.patch.object(toolset, "validate_tools"),
    ):
        if plugin == "autogen":
            toolset.register_tools(
                actions=actions,
                caller=mock.MagicMock(),
                executor=mock.MagicMock(),
            )
        else:
            toolset.get_tools(actions=actions)
