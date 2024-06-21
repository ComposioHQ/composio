"""
Test client base.
"""

from unittest import mock

import pytest

from composio.client.base import Collection
from composio.client.endpoints import Endpoint
from composio.client.exceptions import HTTPError


class _Collection(Collection[dict]):
    endpoint = Endpoint("/v1")
    model = dict


def test_raise_if_required() -> None:
    """Test `_raise_if_required` method."""

    collection = _Collection(
        client=mock.MagicMock(
            http=mock.MagicMock(
                get=lambda **x: mock.MagicMock(
                    status_code=404,
                    content=b"Not Found",
                )
            )
        )
    )

    with pytest.raises(HTTPError, match="Not Found"):
        collection.get({})


def test_invalid_data_object() -> None:
    """Test invalid data object."""

    collection = _Collection(
        client=mock.MagicMock(
            http=mock.MagicMock(
                get=lambda **x: mock.MagicMock(
                    status_code=200,
                    content=b"{}",
                )
            )
        )
    )

    with pytest.raises(HTTPError, match="Received invalid data object"):
        collection.get({})
