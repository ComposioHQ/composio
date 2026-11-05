"""Tests for ``composio.experimental.custom_toolkits``."""

import warnings
from unittest.mock import Mock

import pytest
from composio_client import omit

from composio import exceptions
from composio.client.types import custom_upsert_params
from composio.core.models import experimental as experimental_module
from composio.core.models.experimental import (
    ExperimentalAPI,
    ExperimentalCustomToolkits,
)

TOOLKIT_CONFIG: custom_upsert_params.ToolkitConfig = {
    "name": "My Toolkit",
    "mcp_url": "https://mcp.example.com/mcp",
    "auth_schemes": [
        {
            "mode": "API_KEY",
            "headers": {"Authorization": "Bearer {{generic_api_key}}"},
        }
    ],
}


@pytest.fixture
def mock_client() -> Mock:
    client = Mock()
    client.custom = Mock()
    return client


@pytest.fixture
def custom_toolkits(mock_client: Mock) -> ExperimentalCustomToolkits:
    return ExperimentalCustomToolkits(client=mock_client)


class TestExperimentalCustomToolkits:
    def test_mounted_on_experimental_api(self, mock_client):
        experimental = ExperimentalAPI(client=mock_client)

        assert isinstance(experimental.custom_toolkits, ExperimentalCustomToolkits)
        assert experimental.custom_toolkits._client is mock_client

    def test_create_passes_params_through(self, custom_toolkits, mock_client):
        mock_client.custom.create_toolkit.return_value = "created"

        result = custom_toolkits.create(**TOOLKIT_CONFIG, user_id="user_123")

        assert result == "created"
        mock_client.custom.create_toolkit.assert_called_once_with(
            **TOOLKIT_CONFIG, user_id="user_123"
        )

    def test_update_passes_slug_and_params_through(self, custom_toolkits, mock_client):
        mock_client.custom.update_toolkits.return_value = "updated"

        result = custom_toolkits.update(
            "CUSTOM_MY_TOOLKIT_K7F2Q", name="Renamed", user_id="user_123"
        )

        assert result == "updated"
        mock_client.custom.update_toolkits.assert_called_once_with(
            "CUSTOM_MY_TOOLKIT_K7F2Q", name="Renamed", user_id="user_123"
        )

    def test_upsert_warns_once_per_process(
        self, custom_toolkits, mock_client, monkeypatch
    ):
        monkeypatch.setattr(experimental_module, "_upsert_warning_emitted", False)

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            custom_toolkits.upsert(slug="MY_TOOLKIT", toolkit_config=TOOLKIT_CONFIG)
            custom_toolkits.upsert(slug="MY_TOOLKIT", toolkit_config=TOOLKIT_CONFIG)

        deprecations = [
            w
            for w in caught
            if issubclass(w.category, exceptions.ComposioDeprecationWarning)
        ]
        assert len(deprecations) == 1
        assert "create()" in str(deprecations[0].message)

    def test_upsert_passes_params_through(self, custom_toolkits, mock_client):
        mock_client.custom.upsert.return_value = "upserted"

        result = custom_toolkits.upsert(
            slug="MY_TOOLKIT", toolkit_config=TOOLKIT_CONFIG
        )

        assert result == "upserted"
        mock_client.custom.upsert.assert_called_once_with(
            slug="MY_TOOLKIT", toolkit_config=TOOLKIT_CONFIG
        )

    def test_sync_with_connected_account(self, custom_toolkits, mock_client):
        mock_client.custom.sync.return_value = "synced"

        result = custom_toolkits.sync("CUSTOM_MY_TOOLKIT", connected_account_id="ca_1")

        assert result == "synced"
        mock_client.custom.sync.assert_called_once_with(
            slug="CUSTOM_MY_TOOLKIT", connected_account_id="ca_1"
        )

    def test_sync_without_connected_account(self, custom_toolkits, mock_client):
        custom_toolkits.sync("CUSTOM_MY_TOOLKIT")

        mock_client.custom.sync.assert_called_once_with(
            slug="CUSTOM_MY_TOOLKIT", connected_account_id=omit
        )

    def test_delete(self, custom_toolkits, mock_client):
        mock_client.custom.delete_toolkit.return_value = "deleted"

        result = custom_toolkits.delete("CUSTOM_MY_TOOLKIT")

        assert result == "deleted"
        mock_client.custom.delete_toolkit.assert_called_once_with("CUSTOM_MY_TOOLKIT")

    def test_requires_client(self):
        custom_toolkits = ExperimentalCustomToolkits(client=None)

        with pytest.raises(exceptions.ValidationError):
            custom_toolkits.create(**TOOLKIT_CONFIG, user_id="all")
        with pytest.raises(exceptions.ValidationError):
            custom_toolkits.update("CUSTOM_MY_TOOLKIT", name="Renamed")
        with pytest.raises(exceptions.ValidationError):
            custom_toolkits.sync("CUSTOM_MY_TOOLKIT")
        with pytest.raises(exceptions.ValidationError):
            custom_toolkits.delete("CUSTOM_MY_TOOLKIT")
