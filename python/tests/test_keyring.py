"""Tests for ``composio.keyring``."""

from unittest.mock import Mock

import pytest

from composio.core.models.keyring import Keyring
from tests.conftest import mock_http_client


@pytest.fixture
def mock_client() -> Mock:
    client = mock_http_client()
    client.keyring = Mock()
    return client


def test_list_transfer_keys_delegates_to_client(mock_client):
    mock_client.keyring.list_transfer_keys.return_value = "transfer-keys"

    result = Keyring(client=mock_client).list_transfer_keys()

    assert result == "transfer-keys"
    mock_client.keyring.list_transfer_keys.assert_called_once_with()
