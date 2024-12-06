"""
Test the auto-generate Enum
"""

import logging
from typing import Dict, List
from unittest import mock

import pytest
from pydantic import BaseModel

from composio import action
from composio.client.enums import Action, App, Tag, Trigger, base
from composio.exceptions import ComposioSDKError
from composio.tools.base.local import LocalAction, LocalTool


class SomeLocalToolRequest(BaseModel):
    pass


class SomeLocalToolResponse(BaseModel):
    pass


class SomeLocalAction(LocalAction[SomeLocalToolRequest, SomeLocalToolResponse]):
    def execute(
        self, request: SomeLocalToolRequest, metadata: Dict
    ) -> SomeLocalToolResponse:
        return SomeLocalToolResponse()


class SomeLocalTool(LocalTool, autoload=True):
    logo = ""

    @classmethod
    def actions(cls) -> List[type[LocalAction]]:
        return [SomeLocalAction]


class TestBase:
    """Test enum base."""

    def test_load_load_local_app(self) -> None:
        enum = App(value=SomeLocalTool.enum)
        assert enum.slug == SomeLocalTool.enum
        assert enum.is_local

    def test_load_local_action(self) -> None:
        enum = Action(SomeLocalAction.enum)
        assert enum.slug == SomeLocalAction.enum
        assert enum.is_local
        assert not enum.is_runtime

    def test_load_runtime_action(self) -> None:
        @action(toolname="cow")
        def say(message: str) -> str:
            """
            Make cow say things.

            :param message: Message string
            :return output: Formatted message string
            """
            return f"Cow says `{message}`"

        enum = Action(say)
        assert enum.slug == say.enum
        assert enum.app == "COW"
        assert enum.is_runtime
        assert enum.is_local

    @mock.patch("pathlib.Path.exists", return_value=False)
    def test_load_remote_app(self, _patch, caplog: pytest.LogCaptureFixture) -> None:
        caplog.set_level(logging.DEBUG)
        enum = App(value=App.ATTIO.slug)
        assert enum.slug == App.ATTIO.slug
        assert not enum.is_local # This load()s the app from cache
        assert any(
            "Storing AppData to" in record.message and "apps/ATTIO" in record.message
            for record in caplog.records
        )

    @mock.patch("pathlib.Path.exists", return_value=False)
    def test_load_remote_action(self, _patch, caplog: pytest.LogCaptureFixture) -> None:
        caplog.set_level(logging.DEBUG)
        enum = Action(value=Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.slug)
        assert enum.slug == Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.slug
        assert not enum.is_local  # This load()s the action from cache
        assert any(
            "Storing ActionData to" in record.message
            and "actions/GITHUB_ACCEPT_A_REPOSITORY_INVITATION" in record.message
            for record in caplog.records
        )

    @mock.patch("pathlib.Path.exists", return_value=False)
    def test_load_remote_trigger(
        self, _patch, caplog: pytest.LogCaptureFixture
    ) -> None:
        caplog.set_level(logging.DEBUG)
        enum = Trigger(value=Trigger.GITHUB_COMMIT_EVENT.slug)
        assert enum.slug == Trigger.GITHUB_COMMIT_EVENT.slug
        assert enum.name == "GITHUB_COMMIT_EVENT" # This load()s the trigger from cache
        assert any(
            "Storing TriggerData to" in record.message
            and "triggers/GITHUB_COMMIT_EVENT" in record.message
            for record in caplog.records
        )


class TestDisableRemoteCaching:
    def setup_method(self) -> None:
        base.NO_REMOTE_ENUM_FETCHING = True

    def teardown_method(self) -> None:
        base.NO_REMOTE_ENUM_FETCHING = False

    def test_error(self) -> None:
        """Test `NO_REMOTE_ENUM_FETCHING` set to True."""
        with pytest.raises(
            ComposioSDKError,
            match=(
                "No metadata found for enum `GITHUB_GITHUB_API_ROOT`, You might be "
                "trying to use an app or action that is deprecated, run "
                "`composio apps update` and try again"
            ),
        ):
            Action.GITHUB_GITHUB_API_ROOT._cache_from_remote()  # pylint: disable=protected-access


def test_tag_enum() -> None:
    """Test `Tag` enum."""
    tag = Tag("GITHUB_ORGS")
    assert tag.app.upper() == "GITHUB"
    assert tag.value == "orgs"


def test_app_enum() -> None:
    """Test `App` enum."""
    assert App.GITHUB == "GITHUB"
    assert not App.GITHUB.is_local
    assert App("OUTLOOK") == App.OUTLOOK
    assert App("gmail") == App.GMAIL
    assert App.SHELLTOOL == "SHELLTOOL"
    assert App.SHELLTOOL.is_local


def test_action_enum() -> None:
    """Test `Action` enum."""
    # Auth enums
    action = Action("GMAIL_SEND_EMAIL")
    assert action == Action.GMAIL_SEND_EMAIL
    assert action.app == "gmail"
    assert action.slug == "GMAIL_SEND_EMAIL"
    assert not action.no_auth

    # Non-auth enums
    action = Action("HACKERNEWS_GET_FRONTPAGE")
    assert action == Action.HACKERNEWS_GET_FRONTPAGE
    assert action.app == "hackernews"
    assert action.slug == "HACKERNEWS_GET_FRONTPAGE"
    assert action.no_auth

    # Deprecated enum should redirect to new one
    action = Action("github_issues_list")
    assert action == Action.GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER
    assert action.app == "github"
    assert action.slug == "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"
    assert not action.no_auth


def test_trigger_enum() -> None:
    """Test `Trigger` enum."""
    trg = Trigger("slack_receive_message")
    assert trg.app == "slack"
    assert trg.name == "SLACK_RECEIVE_MESSAGE"


def test_get_actions() -> None:
    """Test `App.get_actions` method."""
    for act in App.GITHUB.get_actions():
        assert act.app == "github"

    for act in App.GITHUB.get_actions(tags=["repo"]):
        assert act.app == "github"
        assert "repo" in act.tags
