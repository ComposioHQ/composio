"""
Test composio toolset.
"""

import logging
import re
from unittest import mock

import pytest

from composio import Action, App
from composio.exceptions import ApiKeyNotProvidedError, ComposioSDKError
from composio.tools.base.abs import action_registry, tool_registry
from composio.tools.base.runtime import action as custom_action
from composio.tools.toolset import ComposioToolSet

from composio_langchain.toolset import ComposioToolSet as LangchainToolSet


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
            "No connected account found for app `asana`; "
            "Run `composio add asana` to fix this"
        ),
    ):
        ComposioToolSet().get_action_schemas(
            actions=[Action.ASANA_ADD_A_PROJECT_TO_A_TASK]
        )


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


class TestConnectedAccountProvider:
    connected_account = "some_account_id"

    def test_invalid_account_id(self) -> None:
        with pytest.raises(
            ComposioSDKError,
            match=re.escape(
                f"Invalid connected accounts found: [('GITHUB', '{self.connected_account}')]"
            ),
        ):
            ComposioToolSet(
                connected_account_ids={
                    App.GITHUB: self.connected_account,
                }
            )

    def test_using_provided_account_id(self) -> None:
        def _patch(*_, **kwargs):
            assert kwargs.get("connected_account_id") == self.connected_account

        with mock.patch("composio.client.Entity.get_connection"):
            toolset = ComposioToolSet(
                connected_account_ids={
                    App.GITHUB: self.connected_account,
                }
            )
            setattr(toolset, "_execute_remote", _patch)
            setattr(
                toolset,
                "_try_get_github_access_token_for_current_entity",
                lambda *_: "",
            )
            toolset.execute_action(
                action=Action.GITHUB_META_ROOT,
                params={},
            )


def test_api_key_missing() -> None:
    toolset = ComposioToolSet()
    toolset._api_key = None  # pylint: disable=protected-access
    with pytest.raises(
        ApiKeyNotProvidedError,
        match=(
            "API Key not provided, either provide API key or export it as "
            "`COMPOSIO_API_KEY` or run `composio login`"
        ),
    ):
        _ = toolset.workspace


def test_processors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test the `processors` field in `ComposioToolSet` constructor."""
    preprocessor_called = postprocessor_called = False

    def preprocess(request: dict) -> dict:
        nonlocal preprocessor_called
        preprocessor_called = True
        return request

    def postprocess(response: dict) -> dict:
        nonlocal postprocessor_called
        postprocessor_called = True
        return response

    with pytest.warns(DeprecationWarning):
        toolset = ComposioToolSet(
            processors={
                "pre": {App.GMAIL: preprocess},
                "post": {App.GMAIL: postprocess},
            }
        )
    monkeypatch.setattr(toolset, "_execute_remote", lambda **_: {})

    # Happy case
    toolset.execute_action(action=Action.GMAIL_FETCH_EMAILS, params={})
    assert preprocessor_called
    assert postprocessor_called

    # Improperly defined processors
    preprocessor_called = postprocessor_called = False

    def weird_postprocessor(reponse: dict) -> None:
        """Forgets to return the reponse."""
        reponse["something"] = True

    # users may not respect our type annotations
    toolset = ComposioToolSet(
        processors={"post": {App.SERPAPI: weird_postprocessor}}  # type: ignore
    )
    monkeypatch.setattr(toolset, "_execute_remote", lambda **_: {})

    with pytest.warns(
        UserWarning,
        match="Expected post-processor to return 'dict', got 'NoneType'",
    ):
        result = toolset.execute_action(action=Action.SERPAPI_SEARCH, params={})

    assert result is None


def test_processors_on_execute_action(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test the `processors` field in `execute_action()` methods of ToolSet's."""
    preprocessor_called = False

    def preprocess(response: dict) -> dict:
        nonlocal preprocessor_called
        preprocessor_called = True
        return response

    toolset = LangchainToolSet()
    monkeypatch.setattr(toolset, "_execute_remote", lambda **_: {})
    toolset.execute_action(
        Action.ATTIO_LIST_NOTES,
        params={},
        processors={"pre": {Action.ATTIO_LIST_NOTES: preprocess}},
    )
    assert preprocessor_called


def test_processors_on_get_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test the `processors` field in `get_tools()` methods of ToolSet's."""
    postprocessor_called = False

    def postprocess(response: dict) -> dict:
        nonlocal postprocessor_called
        postprocessor_called = True
        return response

    toolset = LangchainToolSet()
    monkeypatch.setattr(toolset, "_execute_remote", lambda **_: {})

    toolset.get_tools(
        actions=[Action.COMPOSIO_ENABLE_TRIGGER],
        processors={"post": {Action.COMPOSIO_ENABLE_TRIGGER: postprocess}},
    )
    toolset.execute_action(Action.COMPOSIO_ENABLE_TRIGGER, {})
    assert postprocessor_called


def test_check_connected_accounts_flag() -> None:
    """Test the `check_connected_accounts` flag on `get_tools()`."""

    toolset = LangchainToolSet()
    # Ensure `check_connected_account()` gets called by default
    with mock.patch.object(toolset, "check_connected_account") as mocked:
        toolset.get_tools(actions=[Action.GMAIL_FETCH_EMAILS])
        mocked.assert_called_once()

    # Ensure `check_connected_account()` DOES NOT get called when the flag is set
    with mock.patch.object(toolset, "check_connected_account") as mocked:
        with pytest.warns(
            UserWarning,
            match="Not verifying connected accounts for apps.",
        ):
            toolset.get_tools(
                actions=[Action.GMAIL_FETCH_EMAILS],
                check_connected_accounts=False,
            )
        mocked.assert_not_called()


def test_get_action_schemas_description_for_runtime_tool() -> None:

    @custom_action(toolname="runtime")
    def some_action(name: str) -> str:
        """
        Some action

        :param name: Name of the user
        :return message: Message for user
        """
        return f"Hello, {name}"

    (schema_0,) = ComposioToolSet().get_action_schemas(actions=[some_action])
    assert (
        schema_0.parameters.properties["name"]["description"]
        == "Name of the user. Please provide a value of type string. This parameter is required."
    )

    (schema_1,) = ComposioToolSet().get_action_schemas(actions=[some_action])
    assert (
        schema_1.parameters.properties["name"]["description"]
        == "Name of the user. Please provide a value of type string. This parameter is required."
    )


def test_execute_action() -> None:
    toolset = ComposioToolSet()
    response = toolset.execute_action(Action.HACKERNEWS_GET_FRONTPAGE, {})
    assert response["successfull"]
