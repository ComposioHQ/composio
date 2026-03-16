"""Tests for ToolRouterSessionFilesMount and RemoteFile."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from composio.core.models.tool_router_session_files import (
    RemoteFile,
    ToolRouterSessionFilesMount,
)
from composio.exceptions import RemoteFileDownloadError, ValidationError


@pytest.fixture
def mock_client():
    """Create a mock HTTP client with files API."""
    client = MagicMock()
    client.api_key = "test-api-key"

    # Mock files.list
    mock_list_response = MagicMock()
    mock_list_response.items = []
    mock_list_response.next_cursor = None
    client.tool_router.session.files.list.return_value = mock_list_response

    # Mock files.create_upload_url
    mock_upload_url_response = MagicMock()
    mock_upload_url_response.upload_url = "https://s3.example.com/upload"
    mock_upload_url_response.mount_relative_path = "test.txt"
    mock_upload_url_response.expires_at = "2026-01-01T00:00:00Z"
    mock_upload_url_response.sandbox_mount_prefix = "/mnt/files"
    client.tool_router.session.files.create_upload_url.return_value = (
        mock_upload_url_response
    )

    # Mock files.create_download_url
    mock_download_response = MagicMock()
    mock_download_response.download_url = "https://s3.example.com/download"
    mock_download_response.expires_at = "2026-01-01T00:00:00Z"
    mock_download_response.mount_relative_path = "output/test.txt"
    mock_download_response.sandbox_mount_prefix = "/mnt/files"
    client.tool_router.session.files.create_download_url.return_value = (
        mock_download_response
    )

    # Mock files.delete
    mock_delete_response = MagicMock()
    mock_delete_response.mount_relative_path = "deleted.txt"
    mock_delete_response.sandbox_mount_prefix = "/mnt/files"
    client.tool_router.session.files.delete.return_value = mock_delete_response

    return client


@pytest.fixture
def files_mount(mock_client):
    """Create ToolRouterSessionFilesMount with mocked client."""
    return ToolRouterSessionFilesMount(mock_client, "session_123")


class TestToolRouterSessionFilesMount:
    """Test ToolRouterSessionFilesMount."""

    def test_list_root(self, files_mount, mock_client):
        """Test listing root directory."""
        result = files_mount.list()

        mock_client.tool_router.session.files.list.assert_called_once()
        call_args = mock_client.tool_router.session.files.list.call_args
        assert call_args[0][0] == "files"  # mount_id positional
        assert call_args[1]["session_id"] == "session_123"
        assert result.items == []
        assert result.next_cursor is None

    def test_list_with_path_and_pagination(self, files_mount, mock_client):
        """Test list with path and pagination params."""
        files_mount.list(path="/documents", cursor="c123", limit=10)

        call_kwargs = mock_client.tool_router.session.files.list.call_args[1]
        assert call_kwargs.get("mount_relative_prefix") == "documents"
        assert call_kwargs.get("cursor") == "c123"
        assert call_kwargs.get("limit") == 10.0

    def test_upload_from_bytes_requires_mimetype_or_remote_path(self, files_mount):
        """Test that buffer upload requires mimetype or remote_path."""
        with pytest.raises(ValidationError, match="mimetype or remote_path"):
            files_mount.upload(b"content")

    def test_upload_from_bytes_with_remote_path(self, files_mount, mock_client):
        """Test upload from bytes with remote_path."""
        with patch("requests.put") as mock_put:
            mock_put.return_value.status_code = 200
            mock_put.return_value.ok = True

            result = files_mount.upload(
                b"hello world",
                remote_path="data.txt",
                mimetype="text/plain",
            )

            assert isinstance(result, RemoteFile)
            assert result.mount_relative_path == "output/test.txt"
            mock_client.tool_router.session.files.create_upload_url.assert_called_once()
            mock_client.tool_router.session.files.create_download_url.assert_called_once()

    def test_upload_from_local_file(self, files_mount, mock_client, tmp_path):
        """Test upload from local file path."""
        test_file = tmp_path / "report.pdf"
        test_file.write_bytes(b"pdf content")

        with patch("requests.put") as mock_put:
            mock_put.return_value.status_code = 200
            mock_put.return_value.ok = True

            result = files_mount.upload(str(test_file))

            assert isinstance(result, RemoteFile)
            call_kwargs = (
                mock_client.tool_router.session.files.create_upload_url.call_args[1]
            )
            assert call_kwargs["mount_relative_path"] == "report.pdf"

    def test_download(self, files_mount, mock_client):
        """Test download returns RemoteFile."""
        result = files_mount.download("/output/report.pdf")

        assert isinstance(result, RemoteFile)
        assert result.download_url == "https://s3.example.com/download"
        assert result.mount_relative_path == "output/test.txt"
        mock_client.tool_router.session.files.create_download_url.assert_called_once_with(
            "files",
            session_id="session_123",
            mount_relative_path="/output/report.pdf",
        )

    def test_delete(self, files_mount, mock_client):
        """Test delete calls API."""
        result = files_mount.delete("/temp/cache.json")

        assert result.mount_relative_path == "deleted.txt"
        mock_client.tool_router.session.files.delete.assert_called_once_with(
            "files",
            session_id="session_123",
            mount_relative_path="/temp/cache.json",
        )


class TestRemoteFile:
    """Test RemoteFile."""

    def test_filename_property(self):
        """Test filename extracted from mount path."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="output/report.pdf",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        assert rf.filename == "report.pdf"

    def test_buffer_success(self):
        """Test buffer() fetches content."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="test.txt",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        with patch("requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.ok = True
            mock_get.return_value.content = b"file content"

            result = rf.buffer()
            assert result == b"file content"

    def test_buffer_failure_raises_remote_file_download_error(self):
        """Test buffer() raises RemoteFileDownloadError on HTTP error."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="test.txt",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        with patch("requests.get") as mock_get:
            mock_get.return_value.status_code = 404
            mock_get.return_value.ok = False
            mock_get.return_value.reason = "Not Found"

            with pytest.raises(RemoteFileDownloadError) as exc_info:
                rf.buffer()

            assert exc_info.value.status_code == 404
            assert exc_info.value.filename == "test.txt"

    def test_text(self):
        """Test text() decodes UTF-8."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="test.txt",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        with patch.object(rf, "buffer", return_value=b"hello world"):
            assert rf.text() == "hello world"

    def test_save_to_path(self, tmp_path):
        """Test save() writes to specified path."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="test.txt",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        with patch.object(rf, "buffer", return_value=b"saved content"):
            out_path = rf.save(str(tmp_path / "output.txt"))

        assert Path(out_path).read_bytes() == b"saved content"
        assert out_path.endswith("output.txt")

    def test_save_default_location(self, tmp_path):
        """Test save() without path uses default directory."""
        rf = RemoteFile(
            expires_at="2026-01-01",
            mount_relative_path="report.pdf",
            sandbox_mount_prefix="/mnt/files",
            download_url="https://example.com/file",
        )
        with patch.object(rf, "buffer", return_value=b"pdf content"):
            with patch("pathlib.Path.home", return_value=tmp_path):
                out_path = rf.save()

        expected = tmp_path / ".composio" / "files" / "report.pdf"
        assert Path(out_path) == expected
        assert expected.read_bytes() == b"pdf content"
