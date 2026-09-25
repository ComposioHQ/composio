"""Tests for the ``composio.logs`` namespace."""

from unittest.mock import Mock

import pytest

from composio.client.types import (
    log_create_tool_execution_response,
    log_retrieve_tool_execution_response,
)
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
    def test_search_preserves_premium_usage_charge(self, logs, mock_client):
        mock_client.logs.create_tool_execution.return_value = log_create_tool_execution_response.LogCreateToolExecutionResponse.model_validate(
            {
                "logs": [
                    {
                        "id": "log_1",
                        "timestamp": "2026-01-01T00:00:00Z",
                        "type": "tool.execution",
                        "status": "success",
                        "level": "info",
                        "metadata": {"premium_usage_charge": "0.012"},
                        "metrics": {},
                        "parent": None,
                    }
                ],
                "next_cursor": None,
            }
        )

        result = logs.search()

        assert result.logs[0].metadata["premium_usage_charge"] == "0.012"

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

    def test_get_preserves_premium_usage_charge(self, logs, mock_client):
        mock_client.logs.retrieve_tool_execution.return_value = log_retrieve_tool_execution_response.LogRetrieveToolExecutionResponse.model_validate(
            {
                "id": "log_1",
                "timestamp": "2026-01-01T00:00:00Z",
                "type": "tool.execution",
                "status": "success",
                "level": "info",
                "metadata": {"premium_usage_charge": "0.012"},
                "metrics": {},
                "parent": None,
                "context": {},
                "source": {},
                "data": {},
            }
        )

        result = logs.get("log_1")

        assert result.metadata["premium_usage_charge"] == "0.012"
