"""
Test composio toolset.
"""

import logging
from unittest import mock

import pytest

from composio import Action, App
from composio.exceptions import ComposioSDKError
from composio.tools import ComposioToolSet
from composio.tools.base.abs import action_registry, tool_registry


def test_get_schemas() -> None:
    """Test `ComposioToolSet.find_actions_by_tags` method."""
    toolset = ComposioToolSet()
    assert (
        len(
            toolset.get_action_schemas(
                actions=[
                    Action.SHELLTOOL_EXEC_COMMAND,
                    Action.GITHUB_ACCEPT_A_REPOSITORY_INVITATION,
                ]
            )
        )
        > 0
    )


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
    """Test if the usage of an app without connected account raises error or not."""
    with pytest.raises(
        ComposioSDKError,
        match=(
            "No connected account found for app `apify`; "
            "Run `composio add apify` to fix this"
        ),
    ):
        ComposioToolSet().get_action_schemas(actions=[Action.APIFY_CREATE_APIFY_ACTOR])


class TestValidateTools:
    toolset: ComposioToolSet
    package = "somepackage1"

    @classmethod
    def setup_class(cls) -> None:
        cls.toolset = ComposioToolSet()
        tool_registry["local"][App.BROWSER_TOOL.slug].requires = [cls.package]
        action_registry["local"][Action.BROWSER_TOOL_CLICK_ELEMENT.slug].requires = [
            cls.package
        ]

    def test_validate_tools_app(self, caplog) -> None:
        """Test `ComposioToolSet.validate_tools` method."""
        with caplog.at_level(logging.INFO), mock.patch(
            "subprocess.check_output",
            return_value=b"Successfully installed",
        ):
            self.toolset.validate_tools(apps=[App.BROWSER_TOOL])
            assert f"Installed {self.package}" in caplog.text

    def test_validate_tools_action(self, caplog) -> None:
        """Test `ComposioToolSet.validate_tools` method."""
        with caplog.at_level(logging.INFO), mock.patch(
            "subprocess.check_output",
            return_value=b"Successfully installed",
        ):
            self.toolset.validate_tools(
                actions=[
                    Action.BROWSER_TOOL_CLICK_ELEMENT,
                ]
            )
            assert f"Installed {self.package}" in caplog.text

    def test_installation_failed(self, caplog) -> None:
        """Test `ComposioToolSet.validate_tools` method."""
        with caplog.at_level(logging.INFO), mock.patch(
            "subprocess.check_output",
            return_value=b"",
        ), pytest.raises(
            ComposioSDKError,
            match=f"Error installing {self.package}",
        ):
            self.toolset.validate_tools(apps=[App.BROWSER_TOOL])
