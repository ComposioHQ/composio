"""Tests for the ``composio.logs`` namespace."""

from unittest.mock import Mock

import pytest

from composio.core.models.logs import Logs
from tests.conftest import mock_http_client


@pytest.fixture
def mock_client() -> Mock:
    client = mock_http_client()
    client.logs = Mock()
    return client


@pytest.fixture
def logs(mock_client: Mock) -> Logs:
    return Logs(client=mock_client)


class TestLogs:
    def test_search_passes_params_through(self, logs, mock_client):
        mock_client.logs.create_tool_execution.return_value = "page"

        result = logs.search(
            limit=20,
            cursor="c1",
            filters=[{"field": "toolkit_slug", "value": "github"}],
            time_range={"from": 1, "to": 2},
        )

        assert result == "page"
        mock_client.logs.create_tool_execution.assert_called_once_with(
            limit=20,
            cursor="c1",
            filters=[{"field": "toolkit_slug", "value": "github"}],
            time_range={"from": 1, "to": 2},
        )

    def test_search_without_params(self, logs, mock_client):
        logs.search()

        mock_client.logs.create_tool_execution.assert_called_once_with()

    def test_get(self, logs, mock_client):
        mock_client.logs.retrieve_tool_execution.return_value = "log"

        assert logs.get("log_123") == "log"
        mock_client.logs.retrieve_tool_execution.assert_called_once_with("log_123")
