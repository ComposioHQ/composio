"""
Test composio toolset.
"""

import logging
import os
import re
import typing as t
from unittest import mock

import pytest
from pydantic import BaseModel, Field

from composio import Action, App, Trigger
from composio.exceptions import (
    ApiKeyNotProvidedError,
    ComposioSDKError,
    ConnectedAccountNotFoundError,
)
from composio.tools.base.abs import action_registry, tool_registry
from composio.tools.base.runtime import action as custom_action
from composio.tools.local.filetool.tool import Filetool, FindFile
from composio.tools.toolset import ComposioToolSet
from composio.utils.pypi import reset_installed_list

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


def test_get_trigger_config_scheme() -> None:
    """Test `ComposioToolSet.get_trigger_config_scheme` method."""
    toolset = ComposioToolSet()
    assert (
        toolset.get_trigger_config_scheme(trigger=Trigger.GMAIL_NEW_GMAIL_MESSAGE).title
        == "GmailNewMessageConfigSchema"
    )


def test_delete_trigger() -> None:
    """Test `ComposioToolSet.delete_trigger` method."""
    api_key = os.getenv("COMPOSIO_API_KEY")
    toolset = ComposioToolSet(api_key=api_key)

    connected_account_id: str
    for account in toolset.get_connected_accounts():
        if account.appName == "gmail":
            connected_account_id = account.id
            break

    enabled_trigger = toolset.client.triggers.enable(
        name="GMAIL_NEW_GMAIL_MESSAGE",
        connected_account_id=connected_account_id,
        config={"interval": 1, "userId": "me", "labelIds": "INBOX"},
    )

    assert enabled_trigger["triggerId"] is not None
    assert toolset.delete_trigger(id=enabled_trigger["triggerId"]) is True


def test_find_actions_by_tags() -> None:
    """Test `ComposioToolSet.find_actions_by_tags` method."""
    toolset = ComposioToolSet()
    for action in toolset.find_actions_by_tags(tags=["important"]):
        assert "important" in action.tags

    for action in toolset.find_actions_by_tags(
        App.SLACK, App.GITHUB, tags=["important"]
    ):
        assert "important" in action.tags
        assert action.app in ("GITHUB", "SLACK", "SLACKBOT")


def test_uninitialize_app() -> None:
    """Test if the usage of an app without connected account raises error or not."""
    # Ensure the app is cached
    # TODO: remove this once App.iter() uses a dedicated endpoint
    # for fetching latest enums
    App.ATTIO.load()

    with pytest.raises(
        ComposioSDKError,
        match=(
            "No connected account found for app `ATTIO`; "
            "Run `composio add attio` to fix this"
        ),
    ):
        ComposioToolSet().get_action_schemas(actions=[Action.ATTIO_UPDATE_A_LIST])


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

    def setup_method(self) -> None:
        reset_installed_list()

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
                action=Action.GITHUB_GITHUB_API_ROOT,
                params={},
            )


def test_api_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMPOSIO_API_KEY", "")
    toolset = ComposioToolSet()
    with pytest.raises(
        ApiKeyNotProvidedError,
        match=(
            "API Key not provided, either provide API key or export it as "
            "`COMPOSIO_API_KEY` or run `composio login`"
        ),
    ):
        _ = toolset.execute_action(Action.HACKERNEWS_GET_FRONTPAGE, {})


class TestProcessors:

    def test_processors(self, monkeypatch: pytest.MonkeyPatch) -> None:
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

    def test_processors_on_execute_action(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
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

    def test_processors_on_get_tools(self, monkeypatch: pytest.MonkeyPatch) -> None:
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


def test_entity_id_validation_in_check_connected_accounts() -> None:
    """Test whether check_connected_account raises error with invalid entity_id"""
    toolset = ComposioToolSet()
    with pytest.raises(
        ConnectedAccountNotFoundError,
        match=(
            "No connected account found for app `GMAIL`; "
            "Run `composio add gmail` to fix this"
        ),
    ):
        toolset.check_connected_account(
            action=Action.GMAIL_FETCH_EMAILS,
            entity_id="some_very_random_obviously_wrong_entity_id",
        )


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


class EmailAddressModel(BaseModel):
    name: str
    email: str


def test_execute_action_param_serialization() -> None:
    toolset = LangchainToolSet()
    with mock.patch.object(toolset, "_execute_remote") as mocked:
        toolset.execute_action(
            Action.OUTLOOK_OUTLOOK_CREATE_CONTACT,
            {"contact": EmailAddressModel(name="John Doe", email="johndoe@gmail.com")},
        )

    mocked.assert_called_once_with(
        action=Action.OUTLOOK_OUTLOOK_CREATE_CONTACT,
        params={"contact": {"name": "John Doe", "email": "johndoe@gmail.com"}},
        entity_id="default",
        connected_account_id=None,
        text=None,
        session_id=mock.ANY,
        allow_tracing=False,
    )


def test_custom_auth_on_localtool():
    toolset = ComposioToolSet()
    toolset.add_auth(
        app=Filetool.enum,
        parameters=[
            {
                "in_": "metadata",
                "name": "name",
                "value": "value",
            }
        ],
    )

    def _execute(cls, request, metadata):  # pylint: disable=unused-argument
        return mock.MagicMock(
            model_dump=lambda *_: {
                "assert": metadata["name"] == "value",
            },
        )

    with mock.patch.object(FindFile, "execute", new=_execute):
        response = toolset.execute_action(
            action=FindFile.enum,
            params={
                "pattern": "*.py",
            },
        )
        assert response["data"]["assert"]


def test_bad_custom_auth_on_localtool():
    toolset = ComposioToolSet()
    toolset.add_auth(
        app=Filetool.enum,
        parameters=[
            {
                "in_": "query",
                "name": "name",
                "value": "value",
            }
        ],
    )

    with pytest.raises(
        ComposioSDKError,
        match="Invalid custom auth found for FILETOOL",
    ):
        toolset.execute_action(
            action=FindFile.enum,
            params={
                "pattern": "*.py",
            },
        )


def test_custom_auth_runtime_tool():
    tool = "tool"
    expected_data = {
        "api-key": "api-key",
        "entity_id": "default",
        "subdomain": {"workspace": "composio"},
        "headers": {"Authorization": "Bearer gth_...."},
        "base_url": "https://api.app.dev",
        "body_params": {"address": "633"},
        "path_params": {"name": "user"},
        "query_params": {"page": "1"},
    }

    @custom_action(toolname=tool)
    def action_1(auth: t.Dict) -> int:
        """
        Custom action 1

        :return exit_code: int
        """
        del auth["_browsers"]
        del auth["_filemanagers"]
        del auth["_shells"]
        del auth["_toolset"]
        assert auth == expected_data
        return 0

    class Req(BaseModel):
        pass

    class Res(BaseModel):
        data: int = Field(...)

    @custom_action(toolname=tool)
    def action_2(
        request: Req,  # pylint: disable=unused-argument
        metadata: dict,
    ) -> Res:
        del metadata["_browsers"]
        del metadata["_filemanagers"]
        del metadata["_shells"]
        del metadata["_toolset"]
        assert metadata == expected_data
        return Res(data=0)

    toolset = ComposioToolSet()
    toolset.add_auth(
        app=tool,
        parameters=[
            {
                "in_": "header",
                "name": "Authorization",
                "value": "Bearer gth_....",
            },
            {
                "in_": "metadata",
                "name": "api-key",
                "value": "api-key",
            },
            {
                "in_": "path",
                "name": "name",
                "value": "user",
            },
            {
                "in_": "query",
                "name": "page",
                "value": "1",
            },
            {
                "in_": "subdomain",
                "name": "workspace",
                "value": "composio",
            },
        ],
        base_url="https://api.app.dev",
        body={
            "address": "633",
        },
    )

    result = toolset.execute_action(action=action_1, params={})
    assert result["successful"]

    result = toolset.execute_action(action=action_2, params={})
    assert result["successful"]


class TestSubclassInit:

    def test_runtime(self):

        class SomeToolsetExtention(ComposioToolSet):
            pass

        assert (
            SomeToolsetExtention._runtime  # pylint: disable=protected-access
            == "composio"
        )

        class SomeOtherToolsetExtention(ComposioToolSet, runtime="some_toolset"):
            pass

        assert (
            SomeOtherToolsetExtention._runtime  # pylint: disable=protected-access
            == "some_toolset"
        )

    def test_description_char_limit(self) -> None:

        char_limit = 512
        (schema,) = ComposioToolSet().get_action_schemas(
            actions=[
                Action.FILETOOL_GIT_CLONE,
            ]
        )
        assert len(t.cast(str, schema.description)) > char_limit

        class SomeToolsetExtention(ComposioToolSet, description_char_limit=char_limit):
            pass

        (schema,) = SomeToolsetExtention().get_action_schemas(
            actions=[
                Action.FILETOOL_GIT_CLONE,
            ]
        )
        assert len(t.cast(str, schema.description)) == char_limit

    def test_action_name_char_limit(self) -> None:

        char_limit = 12
        (schema,) = ComposioToolSet().get_action_schemas(
            actions=[
                Action.FILETOOL_GIT_CLONE,
            ]
        )
        assert len(t.cast(str, schema.name)) > char_limit

        class SomeToolsetExtention(ComposioToolSet, action_name_char_limit=char_limit):
            pass

        (schema,) = SomeToolsetExtention().get_action_schemas(
            actions=[
                Action.FILETOOL_GIT_CLONE,
            ]
        )
        assert len(t.cast(str, schema.name)) == char_limit


def test_invalid_handle_tool_calls() -> None:
    """Test edge case where the Agent tries to call a tool that wasn't requested from get_tools()."""
    toolset = LangchainToolSet()

    toolset.get_tools(actions=[Action.GMAIL_FETCH_EMAILS])
    with pytest.raises(ComposioSDKError) as exc:
        with mock.patch.object(toolset, "_execute_remote"):
            toolset.execute_action(
                Action.HACKERNEWS_GET_FRONTPAGE,
                {},
                # This is passed as True by all tools
                _check_requested_actions=True,
            )

    assert (
        "Action HACKERNEWS_GET_FRONTPAGE is being called, but was never requested by the toolset."
        in exc.value.message
    )

    # Ensure it does NOT fail if a subsequent get_tools added that action
    toolset.get_tools(actions=[Action.HACKERNEWS_GET_FRONTPAGE])
    with mock.patch.object(toolset, "_execute_remote"):
        toolset.execute_action(
            Action.HACKERNEWS_GET_FRONTPAGE,
            {},
            # This is passed as True by all tools
            _check_requested_actions=True,
        )

    # Ensure it DOES NOT fail if execute_action is called manually, not by a tool
    toolset = LangchainToolSet()
    toolset.get_tools(actions=[Action.GMAIL_FETCH_EMAILS])
    with mock.patch.object(toolset, "_execute_remote"):
        toolset.execute_action(Action.HACKERNEWS_GET_FRONTPAGE, {})
