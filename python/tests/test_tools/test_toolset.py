"""
Test composio toolset.
"""

from composio import App
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
