"""
Tool router session files mount - list, upload, download, delete files
in the session's virtual filesystem.
"""

from __future__ import annotations

import typing as t
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from composio_client import omit
from composio_client.types.tool_router.session.file_create_download_url_response import (
    FileCreateDownloadURLResponse,
)
from composio_client.types.tool_router.session.file_delete_response import (
    FileDeleteResponse,
)
from composio_client.types.tool_router.session.file_list_response import (
    FileListResponse,
)

from composio.client import HttpClient
from composio.exceptions import RemoteFileDownloadError, ValidationError
from composio.utils.mimetypes import get_extension_from_mime_type
from composio.utils.uuid import generate_short_id

DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID = "files"
COMPOSIO_DIR = ".composio"
TEMP_FILES_DIRECTORY_NAME = "files"

_MAX_RESPONSE_SIZE = 100 * 1024 * 1024  # 100 MB
_CONNECT_TIMEOUT = 5
_READ_TIMEOUT = 60


def _is_url(value: str) -> bool:
    """Check if a string is a valid HTTP/HTTPS URL."""
    try:
        parsed = urlparse(value)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _fetch_from_url(url: str) -> t.Tuple[bytes, str]:
    """Fetch file content from URL. Returns (content, mimetype)."""
    try:
        response = requests.get(
            url,
            stream=True,
            allow_redirects=False,
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
        )
    except requests.exceptions.RequestException as e:
        raise ValidationError(f"Failed to fetch file from URL: {e}") from e

    if response.status_code in (301, 302, 303, 307, 308):
        response.close()
        raise ValidationError(
            "URL returned redirect. Please provide a direct URL to the file."
        )

    if not response.ok:
        response.close()
        raise ValidationError(
            f"Failed to fetch file from URL: {response.status_code} {response.reason}"
        )

    content_length = response.headers.get("Content-Length")
    if content_length and int(content_length) > _MAX_RESPONSE_SIZE:
        response.close()
        raise ValidationError(
            f"File size ({int(content_length)} bytes) exceeds maximum allowed "
            f"size ({_MAX_RESPONSE_SIZE} bytes)"
        )

    chunks: t.List[bytes] = []
    total_bytes = 0
    for chunk in response.iter_content(chunk_size=8192):
        if chunk:
            total_bytes += len(chunk)
            if total_bytes > _MAX_RESPONSE_SIZE:
                response.close()
                raise ValidationError("Response size exceeds maximum allowed size")
            chunks.append(chunk)
    response.close()

    mimetype = response.headers.get("content-type", "application/octet-stream")
    mimetype = mimetype.split(";")[0].strip()
    return b"".join(chunks), mimetype


class RemoteFile:
    """Represents a file stored in a tool router session's file mount.

    Provides methods to fetch, save, and work with the file content.
    """

    def __init__(
        self,
        *,
        expires_at: str,
        mount_relative_path: str,
        sandbox_mount_prefix: str,
        download_url: str,
    ) -> None:
        self.expires_at = expires_at
        self.mount_relative_path = mount_relative_path
        self.sandbox_mount_prefix = sandbox_mount_prefix
        self.download_url = download_url

    @property
    def filename(self) -> str:
        """Filename extracted from the mount path (e.g. 'report.pdf' from 'output/report.pdf')."""
        return Path(self.mount_relative_path).name

    def buffer(self) -> bytes:
        """Fetch the file content as bytes."""
        response = requests.get(self.download_url)

        if not response.ok:
            raise RemoteFileDownloadError(
                f"Failed to download file: {response.status_code} {response.reason}",
                status_code=response.status_code,
                status_text=response.reason,
                download_url=self.download_url,
                mount_relative_path=self.mount_relative_path,
                filename=self.filename,
            )
        return response.content

    def text(self) -> str:
        """Fetch the file content as UTF-8 text."""
        return self.buffer().decode("utf-8")

    def save(self, path: t.Optional[t.Union[str, Path]] = None) -> str:
        """Download and save the file to the local filesystem.

        Returns the absolute path where the file was saved.
        If path is omitted, saves to ~/.composio/files/ using the filename.
        """
        content = self.buffer()
        home = Path.home()
        save_path: Path

        if path is not None:
            save_path = Path(path)
        else:
            save_path = home / COMPOSIO_DIR / TEMP_FILES_DIRECTORY_NAME / self.filename

        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(content)
        return str(save_path.resolve())

    @classmethod
    def from_api_response(cls, data: FileCreateDownloadURLResponse) -> "RemoteFile":
        """Create RemoteFile from API response."""
        return cls(
            expires_at=data.expires_at,
            mount_relative_path=data.mount_relative_path,
            sandbox_mount_prefix=data.sandbox_mount_prefix,
            download_url=data.download_url,
        )


class ToolRouterSessionFilesMount:
    """File mount for a tool router session - list, upload, download, delete."""

    def __init__(self, client: HttpClient, session_id: str) -> None:
        self._client = client
        self._session_id = session_id

    def list(
        self,
        *,
        path: t.Optional[str] = None,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
    ) -> FileListResponse:
        """List files and directories at the specified path on the session's file mount.

        Args:
            path: Directory path to list. Use '/' or omit for root.
            mount_id: ID of the file mount. Defaults to 'files'.
            cursor: Pagination cursor from previous response's next_cursor.
            limit: Max files per page (1-500).

        Returns:
            FileListResponse with items and next_cursor.
        """
        raw_path = path or ""
        if raw_path in ("", "/"):
            mount_relative_prefix_arg: t.Any = omit
        else:
            prefix_str = raw_path[1:] if raw_path.startswith("/") else raw_path
            mount_relative_prefix_arg = prefix_str if prefix_str else omit

        return self._client.tool_router.session.files.list(
            mount_id,
            session_id=self._session_id,
            mount_relative_prefix=mount_relative_prefix_arg,
            cursor=cursor if cursor else omit,
            limit=int(limit) if limit is not None else omit,
        )

    def _normalize_upload_input(
        self,
        input: t.Union[str, Path, bytes, bytearray],
        *,
        remote_path: t.Optional[str] = None,
        mimetype: t.Optional[str] = None,
    ) -> t.Tuple[bytes, str, str]:
        """Normalize upload input to (content, remote_path, mimetype)."""
        if isinstance(input, (str, Path)):
            path_str = str(input)
            if _is_url(path_str):
                content, mime = _fetch_from_url(path_str)
                parsed = urlparse(path_str)
                pathname = unquote(parsed.path)
                segments = [s for s in pathname.split("/") if s]
                filename = segments[-1] if segments else ""
                if not filename or "." not in filename:
                    ext = get_extension_from_mime_type(mime)
                    filename = f"{generate_short_id()}.{ext}"
                rpath = remote_path or filename
                return content, rpath, mime
            # Local file
            p = Path(path_str)
            if not p.exists():
                raise ValidationError(f"File not found: {p}")
            if not p.is_file():
                raise ValidationError(f"Not a file: {p}")
            content = p.read_bytes()
            mime = mimetype or "application/octet-stream"
            rpath = remote_path or p.name
            return content, rpath, mime

        if isinstance(input, (bytes, bytearray)):
            buffer = bytes(input)
            if not mimetype and not remote_path:
                raise ValidationError(
                    "When passing a buffer, either mimetype or remote_path (filename) "
                    "is required. Example: files.upload(buffer, remote_path='data.json', "
                    "mimetype='application/json')"
                )
            mime = mimetype or "application/octet-stream"
            ext = get_extension_from_mime_type(mime)
            rpath = remote_path or f"upload-{generate_short_id()}.{ext}"
            return buffer, rpath, mime

        raise ValidationError(
            f"Unsupported input type: {type(input)}. "
            "Use str (path/URL), Path, bytes, or bytearray."
        )

    def upload(
        self,
        input: t.Union[str, Path, bytes, bytearray],
        *,
        remote_path: t.Optional[str] = None,
        mimetype: t.Optional[str] = None,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> RemoteFile:
        """Upload a file to the session's file mount.

        Accepts a file path (local or URL), or raw bytes."""
        content, rpath, mime = self._normalize_upload_input(
            input, remote_path=remote_path, mimetype=mimetype
        )

        create_resp = self._client.tool_router.session.files.create_upload_url(
            mount_id,
            session_id=self._session_id,
            mount_relative_path=rpath,
            mimetype=mime,
        )

        upload_resp = requests.put(
            create_resp.upload_url,
            data=content,
            headers={"Content-Type": mime},
        )

        if not upload_resp.ok:
            raise ValidationError(
                f"Failed to upload file: {upload_resp.status_code} {upload_resp.reason}"
            )

        download_resp = self._client.tool_router.session.files.create_download_url(
            mount_id,
            session_id=self._session_id,
            mount_relative_path=create_resp.mount_relative_path,
        )

        return RemoteFile.from_api_response(download_resp)

    def download(
        self,
        file_path: str,
        *,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> RemoteFile:
        """Download a file from the session's file mount.

        Returns a RemoteFile with download_url, buffer(), text(), save() methods."""
        resp = self._client.tool_router.session.files.create_download_url(
            mount_id,
            session_id=self._session_id,
            mount_relative_path=file_path,
        )
        return RemoteFile.from_api_response(resp)

    def delete(
        self,
        remote_path: str,
        *,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> FileDeleteResponse:
        """Delete a file or directory at the specified path on the session's file mount."""
        return self._client.tool_router.session.files.delete(
            mount_id,
            session_id=self._session_id,
            mount_relative_path=remote_path,
        )
