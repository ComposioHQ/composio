"""Robustness tests for the file upload/download helpers.

Covers two failure modes in ``composio/core/models/_files.py``:

* a malformed ``Content-Length`` response header crashing ``_fetch_file_from_url``
  with a raw ``ValueError`` instead of a domain error, and
* ``upload()`` PUT-ing to a presigned S3 URL without a ``Content-Type`` header,
  which fails with ``403 SignatureDoesNotMatch`` when the presigned URL was
  signed over the content type.
"""

from unittest.mock import MagicMock, patch

import pytest

from composio.core.models._files import (
    FileUploadable,
    _fetch_file_from_url,
    _parse_content_length,
    upload,
)
from composio.core.models.base import allow_tracking
from composio.exceptions import ResponseTooLargeError
from composio.utils import mimetypes


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


class TestContentLengthParsing:
    """``Content-Length`` is remote-controlled input and must not crash a fetch."""

    def test_parse_content_length_accepts_valid_sizes(self):
        assert _parse_content_length("0") == 0
        assert _parse_content_length("1024") == 1024
        assert _parse_content_length("  2048  ") == 2048

    def test_parse_content_length_rejects_untrustworthy_values(self):
        """Anything non-integral or negative is reported as "unknown size"."""
        assert _parse_content_length(None) is None
        assert _parse_content_length("") is None
        assert _parse_content_length("   ") is None
        assert _parse_content_length("abc") is None
        assert _parse_content_length("12.5") is None
        assert _parse_content_length("1,024") is None
        assert _parse_content_length("1e3") is None
        assert _parse_content_length("0x10") is None
        assert _parse_content_length("100 200") is None
        assert _parse_content_length("-1") is None

    @pytest.mark.parametrize(
        "header",
        ["abc", "12.5", "1,024", "", "   ", "-1", "1e3", "0x10", "100 200"],
    )
    @patch("composio.core.models._files.requests.get")
    def test_malformed_content_length_does_not_raise(self, mock_get, header):
        """A malformed header must not surface a raw ValueError to the caller."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.headers = {
            "content-type": "image/jpeg",
            "Content-Length": header,
        }
        mock_response.iter_content.return_value = [b"x" * 10]
        mock_response.close = MagicMock()
        mock_get.return_value = mock_response

        _, content, mimetype = _fetch_file_from_url(
            "https://example.com/image.jpg", max_size=10 * 1024 * 1024
        )

        assert content == b"x" * 10
        assert mimetype == "image/jpeg"

    @patch("composio.core.models._files.requests.get")
    def test_malformed_content_length_still_enforced_while_streaming(self, mock_get):
        """An unparseable header falls back to the streaming size guard."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.headers = {"Content-Length": "not-a-number"}
        mock_response.iter_content.return_value = [
            b"x" * 1024 * 1024 for _ in range(20)
        ]
        mock_response.close = MagicMock()
        mock_get.return_value = mock_response

        with pytest.raises(ResponseTooLargeError):
            _fetch_file_from_url(
                "https://example.com/large.zip", max_size=10 * 1024 * 1024
            )

    @patch("composio.core.models._files.requests.get")
    def test_negative_content_length_does_not_bypass_limit(self, mock_get):
        """A negative header is ignored rather than trusted as "small"."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.headers = {"Content-Length": "-1"}
        mock_response.iter_content.return_value = [
            b"x" * 1024 * 1024 for _ in range(20)
        ]
        mock_response.close = MagicMock()
        mock_get.return_value = mock_response

        with pytest.raises(ResponseTooLargeError):
            _fetch_file_from_url(
                "https://example.com/large.zip", max_size=10 * 1024 * 1024
            )

    @patch("composio.core.models._files.requests.get")
    def test_valid_oversized_content_length_still_rejected(self, mock_get):
        """Regression guard: the early abort for real oversized files stays."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.headers = {"Content-Length": "200000000"}
        mock_response.close = MagicMock()
        mock_get.return_value = mock_response

        with pytest.raises(ResponseTooLargeError, match="200000000 bytes"):
            _fetch_file_from_url(
                "https://example.com/large.zip", max_size=100 * 1024 * 1024
            )
        mock_response.close.assert_called_once()


class TestUploadContentType:
    """``upload()`` must PUT the content type the presigned URL was signed with.

    The upload paths route through ``safe_request`` (the SSRF-safe wrapper),
    not ``requests.put``, so these tests patch
    ``composio.core.models._files.safe_request``. Its signature is
    ``safe_request(method, url, *, max_redirects=5, **kwargs)`` -- method and
    URL are positional, everything else is a keyword argument.
    """

    @patch("composio.core.models._files.safe_request")
    def test_upload_sends_explicit_mimetype(self, mock_request, tmp_path):
        mock_request.return_value = MagicMock(status_code=200)
        file = tmp_path / "test.jpg"
        file.write_bytes(b"file content")

        assert upload(
            url="https://s3.example.com/upload", file=file, mimetype="image/jpeg"
        )

        args, kwargs = mock_request.call_args
        assert args == ("PUT", "https://s3.example.com/upload")
        assert kwargs["headers"] == {"Content-Type": "image/jpeg"}
        assert kwargs["timeout"] == (5, 60)

    @patch("composio.core.models._files.safe_request")
    def test_upload_guesses_mimetype_when_omitted(self, mock_request, tmp_path):
        """Back-compat: existing two-argument callers still send a Content-Type."""
        mock_request.return_value = MagicMock(status_code=200)
        file = tmp_path / "test.txt"
        file.write_text("hello")

        assert upload(url="https://s3.example.com/upload", file=file)

        args, kwargs = mock_request.call_args
        assert args == ("PUT", "https://s3.example.com/upload")
        assert kwargs["headers"] == {"Content-Type": mimetypes.guess(file=file)}

    @patch("composio.core.models._files.safe_request")
    def test_from_path_put_matches_presigned_mimetype(self, mock_request, tmp_path):
        """The PUT content type must match the mimetype used to mint the URL.

        S3 answers ``403 SignatureDoesNotMatch`` when a presigned URL is signed
        over a content type the subsequent PUT does not send, which made the
        local-file path fail where ``_upload_bytes_to_s3`` succeeded.
        """
        mock_client = MagicMock()
        mock_s3_response = MagicMock()
        mock_s3_response.key = "s3-key-123"
        mock_s3_response.new_presigned_url = "https://s3.example.com/upload"
        mock_client.post.return_value = mock_s3_response
        mock_request.return_value = MagicMock(status_code=200)

        file = tmp_path / "test.jpg"
        file.write_bytes(b"file content")

        result = FileUploadable.from_path(
            client=mock_client,
            file=str(file),
            tool="TEST_TOOL",
            toolkit="test_toolkit",
        )

        presigned_mimetype = mock_client.post.call_args.kwargs["body"]["mimetype"]
        args, put_kwargs = mock_request.call_args
        assert args == ("PUT", "https://s3.example.com/upload")
        assert put_kwargs["headers"] == {"Content-Type": presigned_mimetype}
        assert result.mimetype == presigned_mimetype
        assert result.s3key == "s3-key-123"
