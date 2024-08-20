"""
Test the auto-generate Enum
"""

from composio.client.enums import Action, App, Tag, Trigger


def test_tag_enum() -> None:
    """Test `Tag` enum."""
    tag = Tag("ASANA_ALLOCATIONS")
    assert tag.app == "asana"
    assert tag.value == "Allocations"


def test_app_enum() -> None:
    """Test `App` enum."""
    assert App.GITHUB == "GITHUB"
    assert not App.GITHUB.is_local
    assert App.SHELLTOOL.is_local


def test_action_enum() -> None:
    """Test `Action` enum."""
    action = Action("github_issues_list")
    assert action.app == "github"
    assert action.name == "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"
    assert not action.no_auth


def test_trigger_enum() -> None:
    """Test `Trigger` enum."""
    trigger = Trigger("slack_receive_message")
    assert trigger.app == "slack"
    assert trigger.name == "SLACK_RECEIVE_MESSAGE"


def test_get_actions() -> None:
    """Test `App.get_actions` method."""
    for action in App.GITHUB.get_actions():
        assert action.app == "github"

    for action in App.GITHUB.get_actions(tags=["repo"]):
        assert action.app == "github"
        assert "repo" in action.tags
