"""Tests for ``composio.experimental.usage``."""

from unittest.mock import Mock

import pytest

from composio import exceptions
from composio.core.models.experimental import ExperimentalAPI, ExperimentalUsage


@pytest.fixture
def mock_client() -> Mock:
    client = Mock()
    client.project = Mock()
    client.project.usage = Mock()
    return client


@pytest.fixture
def usage(mock_client: Mock) -> ExperimentalUsage:
    return ExperimentalUsage(client=mock_client)


class TestExperimentalUsage:
    def test_mounted_on_experimental_api(self, mock_client):
        experimental = ExperimentalAPI(client=mock_client)

        assert isinstance(experimental.usage, ExperimentalUsage)
        assert experimental.usage._client is mock_client

    def test_summary_passes_params_through(self, usage, mock_client):
        mock_client.project.usage.retrieve_summary.return_value = "summary"

        result = usage.summary(
            from_=1.0,
            to=2.0,
            entity_types=["tool_execution"],
            filters={"toolkit_slug": "github"},
        )

        assert result == "summary"
        mock_client.project.usage.retrieve_summary.assert_called_once_with(
            from_=1.0,
            to=2.0,
            entity_types=["tool_execution"],
            filters={"toolkit_slug": "github"},
        )

    def test_summary_without_params(self, usage, mock_client):
        usage.summary()

        mock_client.project.usage.retrieve_summary.assert_called_once_with()

    def test_breakdown_passes_entity_type_and_params(self, usage, mock_client):
        mock_client.project.usage.retrieve.return_value = "breakdown"

        result = usage.breakdown(
            "tool_execution",
            group_by="toolkit_slug",
            order_by="total_quantity",
            order_direction="desc",
            limit=5,
        )

        assert result == "breakdown"
        mock_client.project.usage.retrieve.assert_called_once_with(
            "tool_execution",
            group_by="toolkit_slug",
            order_by="total_quantity",
            order_direction="desc",
            limit=5,
        )

    def test_requires_client(self):
        usage = ExperimentalUsage(client=None)

        with pytest.raises(exceptions.ValidationError):
            usage.summary()
        with pytest.raises(exceptions.ValidationError):
            usage.breakdown("tool_execution")
