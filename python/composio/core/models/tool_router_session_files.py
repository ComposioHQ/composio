"""
Tool router session files mount - list, upload, download, delete files
in the session's virtual filesystem.
"""

from __future__ import annotations

import typing as t
from pathlib import Path, PureWindowsPath
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
from composio.exceptions import (
    RemoteFileDownloadError,
    UnsafePathComponentError,
    ValidationError,
)
from composio.utils.mimetypes import get_extension_from_mime_type
from composio.utils.safe_path import secure_basename_join
from composio.utils.url_safety import (
    assert_safe_fetch_target,
    parse_content_length,
    safe_request,
)
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


class _UrlFetchError(Exception):
    """Internal failure raised by :func:`_fetch_url_bytes`.

    Carries the facts rather than a message, so the two callers can keep their
    own public error type and wording while sharing one network body. Neither
    the type nor the instance escapes this module.
    """

    def __init__(
        self,
        *,
        cause: t.Optional[BaseException] = None,
        status_code: t.Optional[int] = None,
        status_text: t.Optional[str] = None,
        redirected: bool = False,
        size_detail: t.Optional[str] = None,
    ) -> None:
        super().__init__(size_detail or "Failed to fetch URL")
        self.cause = cause
        self.status_code = status_code
        self.status_text = status_text
        self.redirected = redirected
        self.size_detail = size_detail


def _fetch_url_bytes(url: str) -> t.Tuple[bytes, str]:
    """Fetch a URL into memory under the SDK's fetch protections.

    The protections are the point of sharing this: the target is validated
    before connecting, redirects are refused rather than followed, and the body
    is streamed with the size accounted against ``_MAX_RESPONSE_SIZE`` so a
    dishonest ``Content-Length`` cannot exhaust memory. Every caller needs all
    four, whether the URL came from the user or from an API response.

    Returns (content, mimetype). Raises :class:`_UrlFetchError`.
    """
    assert_safe_fetch_target(url)
    try:
        response = requests.get(
            url,
            stream=True,
            allow_redirects=False,
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
        )
    except requests.exceptions.RequestException as e:
        raise _UrlFetchError(cause=e) from e

    if response.status_code in (301, 302, 303, 307, 308):
        response.close()
        raise _UrlFetchError(redirected=True)

    if not response.ok:
        response.close()
        raise _UrlFetchError(
            status_code=response.status_code, status_text=response.reason
        )

    content_length = parse_content_length(response.headers.get("Content-Length"))
    if content_length is not None and content_length > _MAX_RESPONSE_SIZE:
        response.close()
        raise _UrlFetchError(
            size_detail=(
                f"File size ({content_length} bytes) exceeds maximum allowed "
                f"size ({_MAX_RESPONSE_SIZE} bytes)"
            )
        )

    chunks: t.List[bytes] = []
    total_bytes = 0
    for chunk in response.iter_content(chunk_size=8192):
        if chunk:
            total_bytes += len(chunk)
            if total_bytes > _MAX_RESPONSE_SIZE:
                response.close()
                raise _UrlFetchError(
                    size_detail="Response size exceeds maximum allowed size"
                )
            chunks.append(chunk)
    response.close()

    mimetype = response.headers.get("content-type", "application/octet-stream")
    mimetype = mimetype.split(";")[0].strip()
    return b"".join(chunks), mimetype


def _fetch_from_url(url: str) -> t.Tuple[bytes, str]:
    """Fetch file content from a user-supplied URL. Returns (content, mimetype)."""
    try:
        return _fetch_url_bytes(url)
    except _UrlFetchError as e:
        if e.cause is not None:
            raise ValidationError(f"Failed to fetch file from URL: {e.cause}") from e
        if e.redirected:
            raise ValidationError(
                "URL returned redirect. Please provide a direct URL to the file."
            ) from e
        if e.status_code is not None:
            raise ValidationError(
                f"Failed to fetch file from URL: {e.status_code} {e.status_text}"
            ) from e
        raise ValidationError(str(e)) from e


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
        """Filename extracted from the mount path (e.g. 'report.pdf' from 'output/report.pdf').

        Deliberately non-raising: this is a display value, and ``buffer()``
        reads it while constructing ``RemoteFileDownloadError``. A validator
        here would replace a genuine download error with a validation error
        raised from inside the error constructor. ``save()`` validates instead,
        at the point the value actually becomes a path.

        ``PureWindowsPath`` so a mount path crafted for a Windows target
        (``..\\..\\evil``) is stripped on POSIX too.
        """
        return PureWindowsPath(self.mount_relative_path).name

    def buffer(self) -> bytes:
        """Fetch the file content as bytes.

        ``self.download_url`` is set by :meth:`from_api_response`, so it is
        untrusted input like every other response field. It goes through
        :func:`_fetch_url_bytes` — the same body that serves user-supplied
        URLs — rather than a bare ``requests.get``: which side of the trust
        boundary the URL arrived from does not change what the fetch needs to
        defend against.
        """
        try:
            content, _ = _fetch_url_bytes(self.download_url)
        except _UrlFetchError as e:
            if e.redirected:
                message = (
                    "Failed to download file: the download URL returned a redirect"
                )
            elif e.status_code is not None:
                message = f"Failed to download file: {e.status_code} {e.status_text}"
            elif e.cause is not None:
                message = f"Failed to download file: {type(e.cause).__name__}"
            else:
                message = f"Failed to download file: {e}"
            raise RemoteFileDownloadError(
                message,
                status_code=e.status_code,
                status_text=e.status_text,
                download_url=self.download_url,
                mount_relative_path=self.mount_relative_path,
                filename=self.filename,
            ) from (e.cause or e)
        return content

    def text(self) -> str:
        """Fetch the file content as UTF-8 text."""
        return self.buffer().decode("utf-8")

    def save(self, path: t.Optional[t.Union[str, Path]] = None) -> str:
        """Download and save the file to the local filesystem.

        Returns the absolute path where the file was saved.
        If path is omitted, saves to ~/.composio/files/ using the filename.
        """
        content = self.buffer()
        save_path: Path

        if path is not None:
            save_path = Path(path)
        else:
            # SEC-316 defense-in-depth. `safe_basename` collapses the
            # server-controlled mount path and rejects what has no usable
            # basename — `""` and `"."` previously made `save_path` equal
            # `default_dir`, passed the containment check (a path contains
            # itself), and failed as a raw `IsADirectoryError` after the
            # directory had been created. The containment check stays as a
            # second line of defence, anchored on the constant `default_dir`,
            # which is what makes it meaningful; see `composio.utils.safe_path`.
            default_dir = Path.home() / COMPOSIO_DIR / TEMP_FILES_DIRECTORY_NAME
            try:
                save_path = secure_basename_join(
                    default_dir, self.mount_relative_path, label="mount path"
                )
            except UnsafePathComponentError as e:
                raise ValidationError(str(e)) from e

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

        # `upload_url` comes from the API response, so it is validated before
        # the file's bytes are sent to it, and re-validated on every redirect
        # hop. See `composio.utils.url_safety`.
        try:
            upload_resp = safe_request(
                "PUT",
                create_resp.upload_url,
                data=content,
                headers={"Content-Type": mime},
                timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
            )
        except requests.exceptions.RequestException as e:
            raise ValidationError(f"Failed to upload file: {type(e).__name__}") from e

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
