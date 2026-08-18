"""Regression tests for file upload and URL fetch robustness.

Covers https://github.com/ComposioHQ/composio/issues/4153: a malformed
``Content-Length`` response header must not crash the URL fetch helpers with
a raw ``ValueError``, and the local-file presigned PUT must send the
``Content-Type`` it was signed with. The shared helpers under test keep the
fetch and upload paths from drifting apart again.
"""

import typing as t
from unittest.mock import MagicMock, patch

import pytest

from composio.core.models._files import _fetch_file_from_url
from composio.core.models.base import allow_tracking
from composio.exceptions import ResponseTooLargeError
from composio.utils.url_safety import parse_content_length


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _stream_response(
    headers: t.Dict[str, str],
    chunks: t.Optional[t.List[bytes]] = None,
) -> MagicMock:
    """A streaming `requests` response double, as `_fetch_file_from_url` reads it."""
    response = MagicMock()
    response.ok = True
    response.status_code = 200
    response.headers = headers
    response.iter_content.return_value = chunks if chunks is not None else [b"payload"]
    response.close = MagicMock()
    return response


class TestParseContentLength:
    """``Content-Length`` is remote-controlled input and must not crash a fetch."""

    @pytest.mark.parametrize(
        "value, expected",
        [
            ("0", 0),
            ("1024", 1024),
            ("  2048  ", 2048),
        ],
    )
    def test_accepts_valid_sizes(self, value: str, expected: int):
        assert parse_content_length(value) == expected

    @pytest.mark.parametrize(
        "value",
        [None, "", "   ", "abc", "12.5", "1,024", "1e3", "0x10", "100 200", "-1"],
    )
    def test_untrustworthy_values_mean_unknown_size(self, value: t.Optional[str]):
        assert parse_content_length(value) is None


class TestMalformedContentLength:
    """A malformed header degrades to unknown size under the streaming cap."""

    @pytest.mark.parametrize(
        "header", ["abc", "12.5", "1,024", "1e3", "0x10", "100 200", ""]
    )
    @patch("composio.core.models._files.assert_safe_fetch_target")
    @patch("composio.core.models._files.requests.get")
    def test_malformed_header_does_not_raise(
        self, mock_get: MagicMock, _mock_assert: MagicMock, header: str
    ):
        """A malformed header must not surface a raw ValueError to the caller."""
        mock_get.return_value = _stream_response(
            {"content-type": "image/jpeg", "Content-Length": header}
        )

        filename, content, mimetype = _fetch_file_from_url(
            "https://example.com/image.jpg"
        )

        assert filename == "image.jpg"
        assert content == b"payload"
        assert mimetype == "image/jpeg"

    @patch("composio.core.models._files.assert_safe_fetch_target")
    @patch("composio.core.models._files.requests.get")
    def test_negative_header_still_enforced_while_streaming(
        self, mock_get: MagicMock, _mock_assert: MagicMock
    ):
        """A negative header means unknown size, not a trusted "small" value."""
        mock_get.return_value = _stream_response(
            {"Content-Length": "-1"},
            [b"x" * 1024 * 1024 for _ in range(20)],
        )

        with pytest.raises(ResponseTooLargeError):
            _fetch_file_from_url(
                "https://example.com/large.zip", max_size=10 * 1024 * 1024
            )
