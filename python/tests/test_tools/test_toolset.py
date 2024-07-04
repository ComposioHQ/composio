"""
Test composio toolset.
"""

import pytest

from composio import Action, App
from composio.exceptions import ComposioSDKError
from composio.tools import ComposioToolSet


def test_find_actions_by_tags() -> None:
    """Test `ComposioToolSet.find_actions_by_tags` method."""
    toolset = ComposioToolSet()
    for action in toolset.find_actions_by_tags(tags=["important"]):
        assert "important" in action.tags

    for action in toolset.find_actions_by_tags(
        App.SLACK, App.GITHUB, tags=["important"]
    ):
        assert "important" in action.tags
        assert action.app in ("github", "slack", "slackbot")


def test_uninitialize_app() -> None:
    """Test if the usage of an app without connected account raises erorr or not."""
    with pytest.raises(
        ComposioSDKError,
        match=(
            "No connected account found for app `apify`; "
            "Run `composio add apify` to fix this"
        ),
    ):
        ComposioToolSet().get_action_schemas(actions=[Action.APIFY_CREATE_APIFY_ACTOR])
