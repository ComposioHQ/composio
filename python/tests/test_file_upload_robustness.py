"""Regression tests for file upload and URL fetch robustness.

Covers https://github.com/ComposioHQ/composio/issues/4153: a malformed
``Content-Length`` response header must not crash the URL fetch helpers with
a raw ``ValueError``, and the local-file presigned PUT must send the
``Content-Type`` it was signed with. The shared helpers under test keep the
fetch and upload paths from drifting apart again.
"""

import typing as t
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests

from composio.core.models._files import (
    FileUploadable,
    _fetch_file_from_url,
    upload,
)
from composio.core.models.base import allow_tracking
from composio.exceptions import ErrorUploadingFile, ResponseTooLargeError
from composio.utils import mimetypes
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


def _s3_client(presigned_url: str = "https://s3.example.com/upload") -> MagicMock:
    """A mock HTTP client whose presign POST answers a fresh upload URL."""
    client = MagicMock()
    s3meta = MagicMock()
    s3meta.key = "s3-key-123"
    s3meta.new_presigned_url = presigned_url
    client.post.return_value = s3meta
    return client


class TestPresignedUploadContentType:
    """The PUT must send the content type the presigned URL was signed with."""

    @patch("composio.core.models._files.safe_request")
    def test_upload_sends_explicit_mimetype(
        self, mock_safe_request: MagicMock, tmp_path: Path
    ):
        mock_safe_request.return_value = MagicMock(status_code=200)
        source = tmp_path / "report.pdf"
        source.write_bytes(b"%PDF-1.4")

        assert upload(
            url="https://s3.example.com/upload",
            file=source,
            mimetype="application/pdf",
        )

        assert mock_safe_request.call_args.args == (
            "PUT",
            "https://s3.example.com/upload",
        )
        assert mock_safe_request.call_args.kwargs["headers"] == {
            "Content-Type": "application/pdf"
        }
        assert mock_safe_request.call_args.kwargs["timeout"] == (5, 60)

    @patch("composio.core.models._files.safe_request")
    def test_upload_guesses_mimetype_when_omitted(
        self, mock_safe_request: MagicMock, tmp_path: Path
    ):
        """Back-compat: two-argument callers still send a Content-Type."""
        mock_safe_request.return_value = MagicMock(status_code=200)
        source = tmp_path / "notes.txt"
        source.write_text("hello")

        assert upload(url="https://s3.example.com/upload", file=source)

        assert mock_safe_request.call_args.kwargs["headers"] == {
            "Content-Type": mimetypes.guess(file=source)
        }

    @patch("composio.core.models._files.safe_request")
    def test_from_path_put_matches_presigned_mimetype(
        self, mock_safe_request: MagicMock, tmp_path: Path
    ):
        """The PUT content type must match the mimetype used to mint the URL.

        S3 answers ``403 SignatureDoesNotMatch`` when a presigned URL is
        signed over a content type the subsequent PUT does not send, which
        made the local-file path fail where the bytes path succeeded.
        """
        mock_safe_request.return_value = MagicMock(status_code=200)
        client = _s3_client()
        source = tmp_path / "photo.jpg"
        source.write_bytes(b"jpeg bytes")

        result = FileUploadable.from_path(
            client=client,
            file=source,
            tool="TEST_TOOL",
            toolkit="test_toolkit",
        )

        presigned_mimetype = client.post.call_args.kwargs["body"]["mimetype"]
        assert presigned_mimetype == mimetypes.guess(file=source)
        assert mock_safe_request.call_args.kwargs["headers"] == {
            "Content-Type": presigned_mimetype
        }
        assert result.mimetype == presigned_mimetype
        assert result.s3key == "s3-key-123"

    @patch("composio.core.models._files.safe_request")
    def test_upload_surfaces_http_status(
        self, mock_safe_request: MagicMock, tmp_path: Path
    ):
        """A rejected PUT raises with the status instead of returning False."""
        mock_safe_request.return_value = MagicMock(status_code=403)
        source = tmp_path / "report.pdf"
        source.write_bytes(b"%PDF-1.4")

        with pytest.raises(ErrorUploadingFile, match="403"):
            upload(url="https://s3.example.com/upload", file=source)

    @patch("composio.core.models._files.safe_request")
    def test_upload_wraps_transport_errors_without_leaking_the_url(
        self, mock_safe_request: MagicMock, tmp_path: Path
    ):
        mock_safe_request.side_effect = requests.exceptions.Timeout(
            "HTTPSConnectionPool(host='s3.example.com', port=443): "
            "Max retries exceeded with url: /upload?token=abc"
        )
        source = tmp_path / "report.pdf"
        source.write_bytes(b"%PDF-1.4")

        with pytest.raises(ErrorUploadingFile) as exc_info:
            upload(url="https://s3.example.com/upload?token=abc", file=source)

        assert "Failed to upload to S3" in str(exc_info.value)
        assert "token=abc" not in str(exc_info.value)


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
    @patch("composio.core.models._files.safe_get")
    def test_malformed_header_does_not_raise(self, mock_get: MagicMock, header: str):
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

    @patch("composio.core.models._files.safe_get")
    def test_negative_header_still_enforced_while_streaming(self, mock_get: MagicMock):
        """A negative header means unknown size, not a trusted "small" value."""
        mock_get.return_value = _stream_response(
            {"Content-Length": "-1"},
            [b"x" * 1024 * 1024 for _ in range(20)],
        )

        with pytest.raises(ResponseTooLargeError):
            _fetch_file_from_url(
                "https://example.com/large.zip", max_size=10 * 1024 * 1024
            )
