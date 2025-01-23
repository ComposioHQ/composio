"""
Test the auto-generate Enum
"""

import logging
from typing import Dict, List

import pytest
from pydantic import BaseModel

from composio import action
from composio.client.enums import Action, App, Tag, Trigger
from composio.client.enums.action import clean_version_string
from composio.client.enums.enum import EnumStringNotFound
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

    def test_load_remote_app(self) -> None:
        if App.ATTIO.storage_path.exists():
            App.ATTIO.storage_path.unlink()

        enum = App(value=App.ATTIO.slug)
        assert enum.slug == App.ATTIO.slug
        assert not enum.is_local  # This load()s the app from api

    def test_load_remote_action(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.DEBUG):
            if Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.storage_path.exists():
                Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.storage_path.unlink()

            enum = Action(value=Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.slug)
            assert enum.slug == Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.slug
            assert not enum.is_local  # This load()s the action from api

        assert (
            "Storing ActionData to" in message
            and ".composio/actions/GITHUB_ACCEPT_A_REPOSITORY_INVITATION" in message
            for message in caplog.messages
        )

    def test_load_remote_trigger(self) -> None:
        if Trigger.GITHUB_COMMIT_EVENT.storage_path.exists():
            Trigger.GITHUB_COMMIT_EVENT.storage_path.unlink()

        enum = Trigger(value=Trigger.GITHUB_COMMIT_EVENT.slug)
        assert enum.slug == Trigger.GITHUB_COMMIT_EVENT.slug
        # This load()s the trigger from api
        assert enum.name == "GITHUB_COMMIT_EVENT"


@pytest.mark.xfail(
    reason=(
        "This relies on the fact that we ran 'composio apps update'"
        "before starting the test suite. Need to get rid of tag enums actually."
    )
)
def test_tag_enum() -> None:
    """Test `Tag` enum."""
    tag = Tag("GITHUB_ORGS")
    assert tag.app == "GITHUB"
    assert tag.value == "orgs"


def test_app_enum() -> None:
    """Test `App` enum."""
    assert App.GITHUB == "GITHUB"
    assert str(App.GITHUB) == "GITHUB"
    assert not App.GITHUB.is_local
    assert App("OUTLOOK") == App.OUTLOOK
    assert App("gmail") == App.GMAIL
    assert App.SHELLTOOL == "SHELLTOOL"
    assert App.SHELLTOOL.is_local


def test_action_enum() -> None:
    """Test `Action` enum."""
    # Auth enums
    action = Action("GMAIL_SEND_EMAIL")
    assert action is Action.GMAIL_SEND_EMAIL
    assert action.app == "GMAIL"
    assert action.slug == "GMAIL_SEND_EMAIL"
    assert not action.no_auth

    # Non-auth enums
    action = Action("HACKERNEWS_GET_FRONTPAGE")
    assert action is Action.HACKERNEWS_GET_FRONTPAGE
    assert action.app == "HACKERNEWS"
    assert action.slug == "HACKERNEWS_GET_FRONTPAGE"
    assert action.no_auth

    # Deprecated enum should redirect to new one
    action = Action("github_issues_list")
    assert action.load().name == "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"
    assert action.app == "GITHUB"
    assert not action.no_auth


def test_trigger_enum() -> None:
    """Test `Trigger` enum."""
    trg = Trigger("slack_receive_message")
    assert trg.app == "SLACK"
    assert trg.name == "SLACK_RECEIVE_MESSAGE"


def test_get_actions() -> None:
    """Test `App.get_actions` method."""
    for act in App.GITHUB.get_actions():
        assert act.app == "GITHUB"

    tag = "repos"
    assert len(list(App.GITHUB.get_actions(tags=[tag]))) > 0
    for act in App.GITHUB.get_actions(tags=[tag]):
        assert act.app == "GITHUB"
        assert tag in act.tags


def test_invalid_enum():
    with pytest.raises(EnumStringNotFound):
        App("some_bs").is_local  # pylint: disable=expression-not-assigned

    with pytest.raises(EnumStringNotFound):
        App.SOME_BS.load()


@pytest.mark.parametrize(
    "version,clean",
    (
        ("2.0", "2_0"),
        ("v0.1", "0_1"),
        ("v2.0", "2_0"),
        ("Latest", "latest"),
    ),
)
def test_clean_action_version_strings(version: str, clean: str):
    assert clean_version_string(version=version) == clean


@pytest.mark.parametrize("version", ("0_5", "2_0", "latest"))
def test_action_version_specifier(version):
    assert Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.version != version
    assert (Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION @ version).version == version


def test_is_version_set():
    assert Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.is_version_set is False
    assert (Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION @ "0_1").is_version_set is True
    assert Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION.is_version_set is False
