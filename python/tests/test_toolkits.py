"""Tests for ``composio.toolkits.get_many`` and ``composio.toolkits.changelog``."""

from unittest.mock import Mock

import pytest
from composio_client import omit

from composio.core.models.toolkits import Toolkits
from tests.conftest import mock_http_client


@pytest.fixture
def mock_client() -> Mock:
    client = mock_http_client()
    client.toolkits = Mock()
    client.connected_accounts = Mock()
    return client


@pytest.fixture
def toolkits(mock_client: Mock) -> Toolkits:
    return Toolkits(client=mock_client)


class TestToolkitsGetMany:
    def test_get_many_by_slugs(self, toolkits, mock_client):
        mock_client.toolkits.retrieve_multi.return_value = Mock(items=["gh", "sl"])

        result = toolkits.get_many(("github", "slack"))

        assert result == ["gh", "sl"]
        mock_client.toolkits.retrieve_multi.assert_called_once_with(
            toolkits=["github", "slack"],
            category=omit,
            managed_by=omit,
            sort_by=omit,
            limit=omit,
            cursor=omit,
        )

    def test_get_many_forwards_filters(self, toolkits, mock_client):
        toolkits.get_many(
            ["github"],
            category="developer-tools",
            managed_by="composio",
            sort_by="usage",
            limit=10,
            cursor="c1",
        )

        mock_client.toolkits.retrieve_multi.assert_called_once_with(
            toolkits=["github"],
            category="developer-tools",
            managed_by="composio",
            sort_by="usage",
            limit=10,
            cursor="c1",
        )


class TestToolkitsChangelog:
    def test_changelog(self, toolkits, mock_client):
        mock_client.toolkits.retrieve_changelog.return_value = "changelog"

        assert toolkits.changelog() == "changelog"
        mock_client.toolkits.retrieve_changelog.assert_called_once_with()


class TestToolkitsScopes:
    def test_recommend_scopes_passes_params_through(self, toolkits, mock_client):
        mock_client.toolkits.recommend_scopes.return_value = "recommendation"

        result = toolkits.recommend_scopes(
            "gmail",
            tools=["GMAIL_SEND_EMAIL"],
            auth_scheme="OAUTH2",
            grant_context={"account_type": "Google Workspace"},
            available_scopes=["openid"],
        )

        assert result == "recommendation"
        mock_client.toolkits.recommend_scopes.assert_called_once_with(
            "gmail",
            tools=["GMAIL_SEND_EMAIL"],
            auth_scheme="OAUTH2",
            grant_context={"account_type": "Google Workspace"},
            available_scopes=["openid"],
        )

    def test_list_grant_contexts_passes_params_through(self, toolkits, mock_client):
        mock_client.toolkits.retrieve_scopes_grant_context.return_value = "contexts"

        result = toolkits.list_grant_contexts(
            "gmail", auth_scheme="OAUTH2", toolkit_version="20250909_00"
        )

        assert result == "contexts"
        mock_client.toolkits.retrieve_scopes_grant_context.assert_called_once_with(
            "gmail", auth_scheme="OAUTH2", toolkit_version="20250909_00"
        )

    def test_list_grant_contexts_without_params(self, toolkits, mock_client):
        toolkits.list_grant_contexts("gmail")

        mock_client.toolkits.retrieve_scopes_grant_context.assert_called_once_with(
            "gmail"
        )
