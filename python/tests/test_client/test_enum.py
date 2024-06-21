"""
Test the auto-generate Enum
"""

from composio.client.enums import Action, App, Tag, Trigger


def test_tag_enum() -> None:
    """Test `Tag` enum."""
    tag = Tag(("default", "important"))
    assert tag.value == ("default", "important")
    assert tag.app == "default"
    assert tag.val == "important"


def test_app_enum() -> None:
    """Test `App` enum."""
    assert App.GITHUB.value == "github"
    assert not App.GITHUB.is_local
    assert App.LOCALWORKSPACE.is_local


def test_action_enum() -> None:
    """Test `Action` enum."""
    action = Action(("github", "github_issues_list", False))
    assert action.app == "github"
    assert action.action == "github_issues_list"


def test_trigger_enum() -> None:
    """Test `Trigger` enum."""
    trigger = Trigger(("slack", "slack_receive_message"))
    assert trigger.app == "slack"
    assert trigger.event == "slack_receive_message"
