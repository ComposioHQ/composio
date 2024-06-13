"""Test url module."""

import os
from unittest import mock

import pytest

from composio.utils.url import ENV_COMPOSIO_BASE_URL, get_web_url


def test_get_web_url() -> None:
    """Test `get_web_url` method."""

    with mock.patch.dict(
        os.environ,
        {
            ENV_COMPOSIO_BASE_URL: "http://url",
        },
    ), pytest.raises(
        ValueError,
        match=(
            "Incorrect format for base_url: http://url. Format should be on of follwing {https://backend.composio.dev/api, https://staging-backend.composio.dev/api, http://localhost:9900/api}"
        ),
    ):
        get_web_url("/url")
