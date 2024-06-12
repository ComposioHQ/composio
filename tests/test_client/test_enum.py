"""
Test the auto-generate Enum
"""


import os

import pytest

from composio.client.enums import Action, App, Tag, Trigger


SKIP_CI = pytest.mark.skipif(
    condition=os.environ.get("CI") is not None,
    reason="INVESTIGATE: The enum tests causes the CI to timeout.",
)


@SKIP_CI
def test_tag_enum() -> None:
    """Test `Tag` enum."""
    tag = Tag(("default", "important"))
    assert tag.value == ("default", "important")
    assert tag.app == "default"
    assert tag.val == "important"


@SKIP_CI
def test_app_enum() -> None:
    """Test `App` enum."""
    assert App.GITHUB.value == "github"
    assert not App.GITHUB.is_local
    assert App.LOCALWORKSPACE.is_local


@SKIP_CI
def test_action_enum() -> None:
    """Test `Action` enum."""
    action = Action(("github", "github_issues_list", False))
    assert action.app == "github"
    assert action.action == "github_issues_list"


@SKIP_CI
def test_trigger_enum() -> None:
    """Test `Trigger` enum."""
    trigger = Trigger(("slack", "slack_receive_message"))
    assert trigger.app == "slack"
    assert trigger.event == "slack_receive_message"
