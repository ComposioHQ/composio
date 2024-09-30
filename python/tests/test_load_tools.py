"""
E2E Tests for plugin demos and examples.
"""

import importlib
import os
from unittest import mock

import pytest

from composio import Action
from composio.exceptions import ComposioSDKError


# Plugin test definitions
PLUGINS = (
    "autogen",
    "camel",
    "claude",
    "crewai",
    # "griptape", # TODO(@kaavee315): Handle oneOf in Griptape
    # "julep", # TODO: Update the julep plugin implementation
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
    actions = []
    for action in Action.all():
        try:
            action.load()
            actions.append(action)
        except ComposioSDKError:
            continue

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
