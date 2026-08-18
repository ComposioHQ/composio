from __future__ import annotations

import hashlib
import os
import typing as t
from pathlib import Path
from urllib.parse import unquote, urlparse
import uuid
import datetime

import requests
import typing_extensions as te
from composio_client import BaseModel as _ComposioBaseModel
from pydantic import BaseModel, ConfigDict, Field

from composio.client import HttpClient
from composio.client.types import Tool
from composio.exceptions import (
    ErrorDownloadingFile,
    ErrorUploadingFile,
    FileUploadAbortedError,
    ResponseTooLargeError,
    SDKFileNotFoundError,
    UnsafePathComponentError,
)
from composio.utils import mimetypes
from composio.utils.json_schema import dereference_json_schema
from composio.utils.safe_path import secure_basename_join, secure_join
from composio.utils.url_safety import (
    assert_safe_fetch_target,
    parse_content_length,
    safe_request,
)
from composio.utils.sensitive_file_upload_paths import (
    assert_safe_local_file_upload_path,
)
from composio.utils.upload_dir_allowlist import (
    assert_path_inside_upload_dirs,
)
from composio.utils.logging import WithLogger

if t.TYPE_CHECKING:
    from .tools import ToolExecutionResponse
    from ._modifiers import BeforeFileUploadContextCallable  # noqa: F401

_DEFAULT_CHUNK_SIZE = 1024 * 1024
_FILE_UPLOAD = "/api/v3/files/upload/request"
_MAX_FILENAME_LENGTH = 100
"""
Maximum filename length to prevent issues with long URLs from public buckets.
Long filenames (containing hashes, UUIDs, or encoded metadata) are replaced
with timestamped filenames to match TypeScript SDK behavior.
"""

_MAX_RESPONSE_SIZE = 100 * 1024 * 1024  # 100 MB default limit
"""
Maximum response size in bytes when fetching files from URLs.
Prevents memory exhaustion attacks from malicious URLs pointing to large files.
"""

_CONNECT_TIMEOUT = 5  # seconds
_READ_TIMEOUT = 60  # seconds
"""
Separate connect and read timeouts for URL fetching.
Connect timeout is short to fail fast on unreachable hosts.
Read timeout is longer to allow for slower file transfers.
"""

_DELETE_VALUE: t.Final = object()
"""
Sentinel returned by the upload walker to signal that a value should be dropped
from its parent container. ``None`` and ``""`` are both legal payload values, so
the walker cannot use either to mean "remove this key/item".
"""

LOCAL_CACHE_DIRECTORY_NAME = ".composio"
"""
Local cache directory name for composio CLI
"""

ENV_LOCAL_CACHE_DIRECTORY = "COMPOSIO_CACHE_DIR"
"""
Environment to set the composio caching directory.
"""

LOCAL_OUTPUT_FILE_DIRECTORY_NAME = "files"
"""
Name of the cache sub-directory into which files downloaded during tool
execution are written. Previously ``outputs``; now ``files`` for parity with
the TypeScript SDK.
"""


def get_cache_directory() -> Path:
    """Resolve the local caching directory without touching the filesystem.

    ``COMPOSIO_CACHE_DIR`` is read on every call, so it can be set after
    ``composio`` has already been imported. ``Path.home()`` is only consulted
    when the variable is unset: it can raise ``RuntimeError`` when there is no
    resolvable home directory, which is exactly the situation
    ``COMPOSIO_CACHE_DIR`` exists to work around, so it must not be evaluated
    eagerly as a fallback argument.
    """
    configured = os.environ.get(ENV_LOCAL_CACHE_DIRECTORY)
    if configured:
        return Path(configured)

    try:
        home = Path.home()
    except RuntimeError as e:
        raise RuntimeError(
            "Could not determine a home directory to store the Composio cache "
            f"in. Provide a writable path using the {ENV_LOCAL_CACHE_DIRECTORY} "
            "environment variable."
        ) from e
    return home / LOCAL_CACHE_DIRECTORY_NAME


def get_output_file_directory() -> Path:
    """Default local directory into which files downloaded during tool
    execution are written. Override by passing ``file_download_dir=...`` to
    Composio, or by setting ``outdir`` on ``FileHelper`` directly.
    """
    return get_cache_directory() / LOCAL_OUTPUT_FILE_DIRECTORY_NAME


def ensure_cache_directory() -> Path:
    """Create the cache directory on first use and check that it is writable.

    This used to run at module import time, so a bare ``import composio``
    raised ``RuntimeError`` on any read-only filesystem -- AWS Lambda,
    distroless containers, ``ProtectHome=true`` systemd units -- even for
    programs that never touched a file. Deferring it to first use keeps the
    same check, and the same error message, for the callers that actually
    need the directory.
    """
    directory = get_cache_directory()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        if not os.access(directory, os.W_OK):
            raise OSError
    except OSError as e:
        raise RuntimeError(
            f"Cache directory {directory} is not writable please "
            f"provide a path that is writable using {ENV_LOCAL_CACHE_DIRECTORY} "
            "environment variable."
        ) from e
    return directory


def __getattr__(name: str) -> Path:
    """Keep the historical module-level path constants working, but lazily.

    ``LOCAL_CACHE_DIRECTORY`` and ``LOCAL_OUTPUT_FILE_DIRECTORY`` used to be
    computed at import time. They are now resolved on attribute access
    instead (PEP 562), so importing this module no longer touches the
    filesystem or depends on the environment, and both constants observe a
    ``COMPOSIO_CACHE_DIR`` that was set after import.
    """
    if name == "LOCAL_CACHE_DIRECTORY":
        return get_cache_directory()
    if name == "LOCAL_OUTPUT_FILE_DIRECTORY":
        return get_output_file_directory()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_md5(file: Path) -> str:
    """Calculate MD5 hash of a file for integrity verification.

    Note: MD5 is used here for file integrity checking and deduplication,
    not for cryptographic security. The Composio API requires MD5 hashes
    for file upload verification. For security-critical applications,
    consider using SHA-256 for additional integrity checks.

    Args:
        file: Path to file to hash

    Returns:
        Hexadecimal MD5 hash string
    """
    # `usedforsecurity=False` lets this run on FIPS-mode systems, where
    # `hashlib.md5()` without the flag raises `ValueError: [digital envelope
    # routines] unsupported`. We're hashing for integrity / deduplication,
    # not security — the API just needs the digest for upload verification.
    obj = hashlib.md5(usedforsecurity=False)
    with file.open("rb") as fp:
        while True:
            line = fp.read(_DEFAULT_CHUNK_SIZE)
            if not line:
                break
            obj.update(line)
    return obj.hexdigest()


def _upload_to_presigned_url(
    url: str, data: t.Union[bytes, t.IO[bytes]], mimetype: str
) -> None:
    """PUT ``data`` to a presigned S3 URL with the content type it was signed with.

    The presign request carries ``mimetype``, so the PUT must send the same
    value as ``Content-Type``: when the signature covers the content type, a
    mismatched or missing header is rejected with ``403 SignatureDoesNotMatch``.
    Routing every presigned PUT through one helper keeps the file and bytes
    upload paths from drifting apart again, mirroring ``uploadFileToS3`` in
    the TypeScript SDK, which funnels path, URL, and File inputs through a
    single uploader.

    Raises:
        ErrorUploadingFile: On transport failure or a non-200 response,
            including the HTTP status when one was received.
    """
    try:
        response = safe_request(
            "PUT",
            url,
            data=data,
            headers={"Content-Type": mimetype},
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
        )
    except requests.exceptions.RequestException as e:
        raise ErrorUploadingFile(
            "Failed to upload to S3: "
            f"{_sanitize_url_for_logging(url)}. Error: {type(e).__name__}"
        ) from e
    if response.status_code != 200:
        raise ErrorUploadingFile(
            f"Failed to upload to S3. Status: {response.status_code}. "
            "This may indicate an expired presigned URL or permission issue."
        )


def upload(url: str, file: Path, mimetype: t.Optional[str] = None) -> bool:
    """Upload file to presigned S3 URL.

    Args:
        url: Presigned S3 upload URL
        file: Path to file to upload
        mimetype: Content type to send with the upload. Defaults to the type
            guessed from ``file``. This must match the ``mimetype`` the
            presigned URL was requested with, otherwise S3 rejects the PUT
            with ``403 SignatureDoesNotMatch`` when the signature covers the
            content type.

    Returns:
        True if the upload succeeded.

    Raises:
        ErrorUploadingFile: If the upload fails; the message includes the
            HTTP status when one was received.
    """
    if mimetype is None:
        mimetype = mimetypes.guess(file=file)
    with file.open("rb") as data:
        _upload_to_presigned_url(url=url, data=data, mimetype=mimetype)
    return True


class _FileUploadResponse(_ComposioBaseModel):
    id: str
    key: str
    type: str
    new_presigned_url: str


def _request_presigned_upload(
    client: HttpClient,
    *,
    filename: str,
    md5: str,
    mimetype: str,
    tool: str,
    toolkit: str,
) -> _FileUploadResponse:
    """Request a presigned S3 upload URL from the backend.

    Single-sources the presign wire shape so the file and bytes upload paths
    request the same fields they later send.
    """
    return client.post(
        path=_FILE_UPLOAD,
        body={
            "md5": md5,
            "filename": filename,
            "mimetype": mimetype,
            "tool_slug": tool,
            "toolkit_slug": toolkit,
        },
        cast_to=_FileUploadResponse,
    )


def _is_url(value: str) -> bool:
    """Check if a string is a valid HTTP/HTTPS URL."""
    try:
        parsed = urlparse(value)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _get_extension_from_mimetype(mimetype: str) -> str:
    """Get file extension from mimetype."""
    mime_to_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
        "application/pdf": ".pdf",
        "application/json": ".json",
        "application/xml": ".xml",
        "text/plain": ".txt",
        "text/html": ".html",
        "text/css": ".css",
        "text/javascript": ".js",
        "application/zip": ".zip",
        "application/gzip": ".gz",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
    }
    return mime_to_ext.get(mimetype.lower(), "")


def _generate_timestamped_filename(extension: str) -> str:
    """Generate a unique filename with timestamp."""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    return f"file_{timestamp}_{unique_id}{extension}"


def _truncate_filename(filename: str, max_length: int = _MAX_FILENAME_LENGTH) -> str:
    """Truncate filename if it exceeds max length by generating a timestamped name.

    Long filenames are common with public bucket URLs containing hashes or UUIDs.
    These can cause issues, so we replace them with timestamped filenames while
    preserving the extension.

    Args:
        filename: The original filename
        max_length: Maximum allowed length for the filename

    Returns:
        The original filename if within limits, or a timestamped filename
        with the extension preserved if the original is too long
    """
    if len(filename) <= max_length:
        return filename

    # Extract extension
    if "." in filename:
        _, ext = filename.rsplit(".", 1)
        ext = f".{ext}"
    else:
        ext = ""

    # Generate a timestamped filename (matches TypeScript SDK behavior)
    return _generate_timestamped_filename(ext)


def _sanitize_url_for_logging(url: str) -> str:
    """Sanitize URL for safe logging (remove sensitive query params).

    Args:
        url: URL to sanitize

    Returns:
        URL with query parameters hidden
    """
    parsed = urlparse(url)
    if parsed.query:
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}?[REDACTED]"
    return url


def _fetch_file_from_url(
    url: str,
    max_size: int = _MAX_RESPONSE_SIZE,
) -> t.Tuple[str, bytes, str]:
    """Fetch file content from a URL with security protections.

    Security features:
    - Response size limiting (prevents memory exhaustion)
    - Redirects disabled (prevents redirect-based attacks)
    - Separate connect/read timeouts

    Args:
        url: URL to fetch file from
        max_size: Maximum response size in bytes (default: 100MB)

    Returns:
        Tuple of (filename, content_bytes, mimetype)

    Raises:
        ResponseTooLargeError: If response exceeds max_size
        ErrorUploadingFile: If fetch fails for other reasons
    """
    assert_safe_fetch_target(url)

    # Make request without following redirects
    try:
        response = requests.get(
            url,
            stream=True,  # Enable streaming for size limiting
            allow_redirects=False,  # Disable redirects for security
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
        )
    except requests.exceptions.Timeout:
        raise ErrorUploadingFile(
            f"Request timed out fetching URL: {_sanitize_url_for_logging(url)}"
        )
    except requests.exceptions.RequestException as e:
        raise ErrorUploadingFile(
            f"Failed to fetch file from URL: {_sanitize_url_for_logging(url)}. Error: {e}"
        )

    # Reject redirects - require direct URL to resource
    if response.status_code in (301, 302, 303, 307, 308):
        location = response.headers.get("Location", "unknown")
        response.close()
        raise ErrorUploadingFile(
            f"URL returned redirect to {_sanitize_url_for_logging(location)}. "
            f"Please provide a direct URL to the file."
        )

    # Check for successful response
    if not response.ok:
        response.close()
        raise ErrorUploadingFile(
            f"Failed to fetch file from URL: {_sanitize_url_for_logging(url)}. "
            f"Status: {response.status_code}"
        )

    # Check Content-Length header first (early abort for oversized files).
    # The header is a hint from the remote server: `parse_content_length`
    # returns None for anything untrustworthy, and the streaming guard below
    # is the authoritative limit.
    content_length = parse_content_length(response.headers.get("Content-Length"))
    if content_length is not None and content_length > max_size:
        response.close()
        raise ResponseTooLargeError(
            f"File size ({content_length} bytes) exceeds maximum allowed "
            f"size ({max_size} bytes)"
        )

    # Stream response with size tracking
    chunks: t.List[bytes] = []
    total_bytes = 0
    chunk_size = 8192  # 8 KB chunks

    try:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                total_bytes += len(chunk)
                if total_bytes > max_size:
                    response.close()
                    raise ResponseTooLargeError(
                        f"Response size exceeds maximum allowed size ({max_size} bytes)"
                    )
                chunks.append(chunk)
    finally:
        response.close()

    content = b"".join(chunks)

    # Extract mimetype
    mimetype = response.headers.get("content-type", "application/octet-stream")
    # Handle mimetypes with charset or other parameters (e.g., "text/html; charset=utf-8")
    mimetype = mimetype.split(";")[0].strip()

    # Extract filename from URL (decode percent-encoded characters)
    parsed_url = urlparse(url)
    pathname = unquote(parsed_url.path)
    filename = os.path.basename(pathname) if pathname else ""

    # If no filename from URL or no extension, generate one
    if not filename:
        extension = _get_extension_from_mimetype(mimetype)
        filename = _generate_timestamped_filename(extension)
    else:
        # If filename has no extension, try to add one from mimetype
        if "." not in filename:
            extension = _get_extension_from_mimetype(mimetype)
            filename = _generate_timestamped_filename(extension)

        # Truncate long filenames (common with public bucket URLs containing hashes)
        filename = _truncate_filename(filename)

    return filename, content, mimetype


def _upload_bytes_to_s3(
    client: HttpClient,
    filename: str,
    content: bytes,
    mimetype: str,
    tool: str,
    toolkit: str,
) -> str:
    """Upload bytes content to S3 and return the S3 key."""
    s3meta = _request_presigned_upload(
        client,
        filename=filename,
        md5=hashlib.md5(content, usedforsecurity=False).hexdigest(),
        mimetype=mimetype,
        tool=tool,
        toolkit=toolkit,
    )
    _upload_to_presigned_url(
        url=s3meta.new_presigned_url, data=content, mimetype=mimetype
    )
    return s3meta.key


class FileUploadable(BaseModel):
    model_config = ConfigDict(json_schema_extra={"file_uploadable": True})

    name: str
    mimetype: str
    s3key: str

    @classmethod
    def from_url(
        cls,
        client: HttpClient,
        url: str,
        tool: str,
        toolkit: str,
    ) -> te.Self:
        """Create a FileUploadable from a public URL.

        Fetches the file content from the URL and uploads it to S3.

        :param client: The HTTP client for API calls
        :param url: The public URL to fetch the file from
        :param tool: The tool slug
        :param toolkit: The toolkit slug
        :return: FileUploadable instance with S3 key
        """
        filename, content, mimetype = _fetch_file_from_url(url)

        s3key = _upload_bytes_to_s3(
            client=client,
            filename=filename,
            content=content,
            mimetype=mimetype,
            tool=tool,
            toolkit=toolkit,
        )

        return cls(name=filename, mimetype=mimetype, s3key=s3key)

    @classmethod
    def from_path(
        cls,
        client: HttpClient,
        file: t.Union[str, Path],
        tool: str,
        toolkit: str,
        *,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_allowlist: t.Optional[t.Sequence[Path]] = None,
        before_file_upload: t.Optional["BeforeFileUploadContextCallable"] = None,
    ) -> te.Self:
        """Create a FileUploadable from a local file path or public URL.

        If the file parameter is a URL (starts with http:// or https://),
        it will fetch the file content from the URL and upload it to S3.
        Otherwise, it treats it as a local file path.

        :param client: The HTTP client for API calls
        :param file: Local file path or public URL
        :param tool: The tool slug
        :param toolkit: The toolkit slug
        :param sensitive_file_upload_protection: When True, block paths on the built-in denylist.
        :param file_upload_path_deny_segments: Extra path segment names to merge with the built-in list.
        :param file_upload_allowlist: When provided (not None), local paths must
            resolve inside one of these directories on a component boundary.
            Pass ``None`` to skip the check (e.g. manual upload APIs). URLs are
            never checked against the allowlist. An empty sequence means
            "no paths are allowed" (fail-closed).
        :param before_file_upload: Optional context-form hook produced by
            :func:`composio.core.models._modifiers.merge_before_file_upload`.
            Receives ``{"path", "source", "tool", "toolkit"}`` where ``source``
            is ``"url"`` for ``http(s)://...`` inputs and ``"path"`` for local
            filesystem paths. Return a new string to substitute, or ``False``
            to abort.
        :return: FileUploadable instance with S3 key
        """
        file_str = str(file) if isinstance(file, Path) else file
        path_in = file_str
        source: t.Literal["url", "path"] = (
            "url" if isinstance(file_str, str) and _is_url(file_str) else "path"
        )

        if before_file_upload is not None:
            out = before_file_upload(
                {
                    "path": path_in,
                    "source": source,
                    "tool": tool,
                    "toolkit": toolkit,
                }
            )
            if out is False:
                raise FileUploadAbortedError(
                    "File upload was aborted because before_file_upload returned False."
                )
            if isinstance(out, str):
                path_in = out

        # Re-decide routing on the post-hook value: a URL-source hook may return
        # a local path (and vice versa). Re-checking with `_is_url` keeps the
        # URL fetch path and the local-file path properly separated, so a hook
        # cannot, for example, smuggle `/etc/passwd` past the URL branch's
        # missing allowlist/denylist by rewriting the URL into a path.
        if isinstance(path_in, str) and _is_url(path_in):
            return cls.from_url(client=client, url=path_in, tool=tool, toolkit=toolkit)

        # Allowlist check runs BEFORE the denylist / existence checks when enabled,
        # so the "configure file_upload_dirs" hint fires first for the common case
        # (user has auto-upload on but hasn't configured dirs). Caller passes
        # ``None`` to bypass the allowlist (manual upload APIs).
        if file_upload_allowlist is not None:
            assert_path_inside_upload_dirs(path_in, file_upload_allowlist)

        assert_safe_local_file_upload_path(
            path_in,
            enabled=sensitive_file_upload_protection,
            additional_deny_segments=file_upload_path_deny_segments,
        )

        # Handle as local file path
        file = Path(path_in)
        if not file.exists():
            raise SDKFileNotFoundError(
                f"File not found: {file}. Please provide a valid file path."
            )

        if not file.is_file():
            raise SDKFileNotFoundError(
                f"Not a file: {file}. Please provide a valid file path."
            )

        if not os.access(file, os.R_OK):
            raise SDKFileNotFoundError(
                f"File not readable: {file}. Please check the file permissions."
            )

        mimetype = mimetypes.guess(file=file)
        s3meta = _request_presigned_upload(
            client,
            filename=file.name,
            md5=get_md5(file=file),
            mimetype=mimetype,
            tool=tool,
            toolkit=toolkit,
        )
        upload(url=s3meta.new_presigned_url, file=file, mimetype=mimetype)
        return cls(name=file.name, mimetype=mimetype, s3key=s3meta.key)


class FileDownloadable(BaseModel):
    model_config = ConfigDict(json_schema_extra={"file_downloadable": True})

    name: str = Field(..., description="Name of the file")
    mimetype: str = Field(..., description="Mime type of the file.")
    s3url: str = Field(..., description="URL of the file.")

    def download(
        self,
        outdir: Path,
        chunk_size: int = _DEFAULT_CHUNK_SIZE,
        *,
        root: Path,
    ) -> Path:
        """Fetch the file into ``outdir``.

        :param outdir: Directory to write into. May be derived from untrusted
            input, provided it was produced by :func:`secure_join`.
        :param root: Trusted containment anchor, configured locally and never
            derived from an API response. Required rather than defaulted:
            checking containment against a directory that untrusted input has
            already relocated is not a check at all, and ``outdir`` may be
            exactly such a directory. Callers must name the anchor explicitly.
        """
        # SEC-316: `self.name` also comes from the (potentially compromised or
        # MITM'd) API response. Collapsed to a bare filename and checked against
        # `root` — not `outdir` — so a name like `output_evil/foo`
        # (sibling-prefix attack) is rejected too.
        try:
            outfile = secure_basename_join(outdir, self.name, root=root)
        except UnsafePathComponentError as e:
            raise ErrorDownloadingFile(str(e)) from e
        assert_safe_fetch_target(self.s3url)
        outdir.mkdir(exist_ok=True, parents=True)
        try:
            response = requests.get(
                url=self.s3url,
                stream=True,
                allow_redirects=False,
                timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
            )
        except requests.exceptions.RequestException as e:
            raise ErrorDownloadingFile(
                "Error downloading file: "
                f"{_sanitize_url_for_logging(self.s3url)}. Error: {type(e).__name__}"
            ) from e
        if response.status_code != 200:
            response.close()
            raise ErrorDownloadingFile(
                f"Error downloading file: {_sanitize_url_for_logging(self.s3url)}"
            )

        try:
            with outfile.open("wb") as fd:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    fd.write(chunk)
        except requests.exceptions.RequestException as e:
            raise ErrorDownloadingFile(
                "Error downloading file: "
                f"{_sanitize_url_for_logging(self.s3url)}. Error: {type(e).__name__}"
            ) from e
        finally:
            response.close()
        return outfile


# Internal alias — ``FileHelper`` receives the already-adapted context-form
# callable produced by :func:`merge_before_file_upload`.
from composio.core.models._modifiers import (  # noqa: E402
    BeforeFileUploadContextCallable as BeforeFileUpload,
)


class FileHelper(WithLogger):
    def __init__(
        self,
        client: HttpClient,
        outdir: t.Optional[str] = None,
        *,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_allowlist: t.Optional[t.Sequence[Path]] = None,
    ) -> None:
        """
        :param outdir: Where files downloaded during tool execution are written.
            Defaults to ``~/.composio/files``.
        :param file_upload_allowlist: Directories from which local files may be
            auto-uploaded. ``None`` disables the allowlist check (used when
            auto-upload is off, or for manual upload APIs). An empty list means
            "no paths allowed" (fail-closed).
        """
        super().__init__()
        self._client = client
        # Falsy, not just `is None`: an empty string falls through to the
        # same default directory below, and must be treated as such here too
        # or `ensure_cache_directory()` silently stops firing for it.
        self._outdir_is_default = not outdir
        self._outdir = Path(outdir) if outdir else get_output_file_directory()
        self._sensitive_file_upload_protection = sensitive_file_upload_protection
        self._file_upload_path_deny_segments = file_upload_path_deny_segments
        self._file_upload_allowlist: t.Optional[t.Sequence[Path]] = (
            list(file_upload_allowlist) if file_upload_allowlist is not None else None
        )

    def _has_file_property(
        self, schema: t.Dict, property_name: str = "file_uploadable"
    ) -> bool:
        """Check if a schema (or any of its variants) contains a file property.

        Recursively checks anyOf, oneOf, allOf, nested properties, and array items.
        """
        if not isinstance(schema, dict):
            return False

        # Direct property check
        if schema.get(property_name, False):
            return True

        # Check anyOf variants
        if "anyOf" in schema:
            for variant in schema["anyOf"]:
                if self._has_file_property(variant, property_name):
                    return True

        # Check oneOf variants
        if "oneOf" in schema:
            for variant in schema["oneOf"]:
                if self._has_file_property(variant, property_name):
                    return True

        # Check allOf variants
        if "allOf" in schema:
            for variant in schema["allOf"]:
                if self._has_file_property(variant, property_name):
                    return True

        # Check nested properties
        if "properties" in schema:
            for prop in schema["properties"].values():
                if self._has_file_property(prop, property_name):
                    return True

        # Check array items
        if "items" in schema:
            items = schema["items"]
            if isinstance(items, list):
                for item in items:
                    if self._has_file_property(item, property_name):
                        return True
            elif isinstance(items, dict):
                if self._has_file_property(items, property_name):
                    return True

        return False

    def _file_uploadable(self, schema: t.Dict) -> bool:
        """Check if a schema has file_uploadable property."""
        return self._has_file_property(schema, "file_uploadable")

    def _process_file_uploadable(self, schema: t.Dict) -> t.Dict:
        return {
            "type": "string",
            "format": "path",
            "description": schema.get("description", "Path to file."),
            "title": schema.get("title"),
            "file_uploadable": True,
        }

    def _transform_schema_for_file_upload(self, schema: t.Dict) -> t.Dict:
        """Recursively transform a schema, converting file_uploadable fields to path format.

        Handles anyOf, oneOf, allOf, nested properties, and array items.
        """
        if not isinstance(schema, dict):
            return schema

        # Direct file_uploadable - transform it
        if schema.get("file_uploadable", False):
            return self._process_file_uploadable(schema)

        # Create a copy to avoid mutating the original
        new_schema = dict(schema)

        # Transform anyOf variants
        if "anyOf" in schema:
            new_schema["anyOf"] = [
                self._transform_schema_for_file_upload(variant)
                for variant in schema["anyOf"]
            ]

        # Transform oneOf variants
        if "oneOf" in schema:
            new_schema["oneOf"] = [
                self._transform_schema_for_file_upload(variant)
                for variant in schema["oneOf"]
            ]

        # Transform allOf variants
        if "allOf" in schema:
            new_schema["allOf"] = [
                self._transform_schema_for_file_upload(variant)
                for variant in schema["allOf"]
            ]

        # Transform nested properties
        if "properties" in schema:
            new_schema["properties"] = {
                key: self._transform_schema_for_file_upload(prop)
                for key, prop in schema["properties"].items()
            }

        # Transform array items
        if "items" in schema:
            items = schema["items"]
            if isinstance(items, list):
                new_schema["items"] = [
                    self._transform_schema_for_file_upload(item) for item in items
                ]
            elif isinstance(items, dict):
                new_schema["items"] = self._transform_schema_for_file_upload(items)

        return new_schema

    def enhance_schema_descriptions(self, schema: t.Dict) -> t.Dict:
        """Add type hints and required notes to parameter descriptions.

        This method enhances parameter descriptions by adding:
        - Type hints ("Please provide a value of type...")
        - Required notes ("This parameter is required.")

        This is separate from file processing and should always run
        regardless of `dangerously_allow_auto_upload_download_files`.

        Schemas with no `properties` key (e.g. `{}` for tools that declare
        no input parameters — common with MCP-backed toolkits) are returned
        unchanged, matching the sibling `process_file_uploadable_schema`.
        """
        if "properties" not in schema:
            return schema
        required = schema.get("required") or []
        for _param, _schema in schema["properties"].items():
            if _schema.get("type") in ["string", "integer", "number", "boolean"]:
                ext = f"Please provide a value of type {_schema['type']}."
                description = _schema.get("description", "").rstrip(".")
                _schema["description"] = f"{description}. {ext}" if description else ext

            if _param in required:
                description = _schema.get("description")
                _schema["description"] = (
                    (f"{description.rstrip('.')}. This parameter is required.")
                    if description
                    else "This parameter is required."
                )
        return schema

    def process_file_uploadable_schema(self, schema: t.Dict) -> t.Dict:
        """Process file_uploadable fields in schema.

        This method converts file_uploadable fields to path format.
        Should only be called when the caller opted in via
        `dangerously_allow_auto_upload_download_files=True`.
        Recursively handles anyOf, oneOf, allOf, nested properties, and array items.

        ``$ref``/``$defs`` indirection is inlined first so file_uploadable flags
        reachable only through a reference are visible to the transform below
        (https://github.com/ComposioHQ/composio/issues/3506). Tool schemas come
        from the API, which may emit a ``$ref`` without a ``$defs`` block
        (https://github.com/ComposioHQ/composio/issues/3307); ``"sentinel"``
        degrades that gracefully instead of raising.
        """
        resolved = dereference_json_schema(schema, on_unresolved="sentinel")
        if "properties" not in resolved:
            return schema

        # Preserve the original object's identity (callers such as
        # ``process_schema_recursively`` mutate in place) while adopting the
        # dereferenced, ``$defs``-stripped shape.
        schema.clear()
        schema.update(resolved)
        schema["properties"] = {
            key: self._transform_schema_for_file_upload(prop)
            for key, prop in schema["properties"].items()
        }
        return schema

    def process_schema_recursively(self, schema: t.Dict) -> t.Dict:
        """Process schema for both file handling and description enhancements.

        This method is kept for backward compatibility. It calls both
        process_file_uploadable_schema and enhance_schema_descriptions.
        """
        self.process_file_uploadable_schema(schema)
        self.enhance_schema_descriptions(schema)
        return schema

    def _schema_variants(self, schema: t.Dict) -> t.List[t.Dict]:
        """Return composed schema variants in the SDK's historical order."""
        variants: t.List[t.Dict] = []
        for key in ("anyOf", "oneOf", "allOf"):
            schema_variants = schema.get(key)
            if not isinstance(schema_variants, list):
                continue
            variants.extend(v for v in schema_variants if isinstance(v, dict))
        return variants

    def _json_schema_type_matches_value(self, schema: t.Dict, value: t.Any) -> bool:
        """Best-effort runtime shape match for selecting composed schemas."""
        schema_type = schema.get("type")
        if isinstance(schema_type, list):
            return any(
                self._json_schema_type_matches_value({**schema, "type": tpe}, value)
                for tpe in schema_type
            )

        if schema_type is None:
            if "properties" in schema:
                return isinstance(value, dict)
            if "items" in schema:
                return isinstance(value, list)
            return False

        if schema_type == "array":
            return isinstance(value, list)
        if schema_type == "object":
            return isinstance(value, dict)
        if schema_type == "string":
            return isinstance(value, str)
        if schema_type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if schema_type == "number":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        if schema_type == "boolean":
            return isinstance(value, bool)
        if schema_type == "null":
            return value is None

        return False

    def _find_schema_variant_with_file_property(
        self,
        schema: t.Dict,
        property_name: str,
        value: t.Any = None,
    ) -> t.Optional[t.Dict]:
        """Find the composed schema variant that should process a file value.

        ``anyOf``, ``oneOf`` and ``allOf`` are intentionally treated the same
        here, matching the SDK's existing convention. When a runtime value is
        available, prefer the file-bearing variant with the matching JSON Schema
        shape; otherwise keep the historical first-match behavior.
        """
        candidates = [
            variant
            for variant in self._schema_variants(schema)
            if self._has_file_property(variant, property_name)
        ]
        if not candidates:
            return None

        if value is not None:
            for candidate in candidates:
                if self._json_schema_type_matches_value(candidate, value):
                    return candidate

        return candidates[0]

    def _find_uploadable_schema_variant(
        self, schema: t.Dict, value: t.Any = None
    ) -> t.Optional[t.Dict]:
        """Find a schema variant that contains file_uploadable properties."""
        return self._find_schema_variant_with_file_property(
            schema=schema,
            property_name="file_uploadable",
            value=value,
        )

    def _upload_file_value(
        self,
        value: t.Any,
        tool: Tool,
        before_file_upload: t.Optional[BeforeFileUpload],
    ) -> t.Any:
        if value is None or value == "":
            return _DELETE_VALUE

        return FileUploadable.from_path(
            client=self._client,
            file=value,
            tool=tool.slug,
            toolkit=tool.toolkit.slug,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            file_upload_allowlist=self._file_upload_allowlist,
            before_file_upload=before_file_upload,
        ).model_dump()

    def _substitute_file_upload_value(
        self,
        value: t.Any,
        schema: t.Optional[t.Dict],
        tool: Tool,
        *,
        before_file_upload: t.Optional[BeforeFileUpload] = None,
    ) -> t.Any:
        """Return ``value`` with file-uploadable leaves staged for execution."""
        if not isinstance(schema, dict):
            return value

        if schema.get("file_uploadable", False):
            return self._upload_file_value(
                value=value,
                tool=tool,
                before_file_upload=before_file_upload,
            )

        uploadable_variant = self._find_uploadable_schema_variant(
            schema=schema,
            value=value,
        )
        if uploadable_variant is not None:
            return self._substitute_file_upload_value(
                value=value,
                schema=uploadable_variant,
                tool=tool,
                before_file_upload=before_file_upload,
            )

        if isinstance(value, dict) and "properties" in schema:
            processed: t.Dict[str, t.Any] = {}
            properties = schema["properties"]
            for key, item in value.items():
                item_schema = properties.get(key)
                processed_item = self._substitute_file_upload_value(
                    value=item,
                    schema=item_schema,
                    tool=tool,
                    before_file_upload=before_file_upload,
                )
                if processed_item is not _DELETE_VALUE:
                    processed[key] = processed_item
            return processed

        if isinstance(value, list) and "items" in schema:
            items_schema = schema["items"]
            if isinstance(items_schema, list):
                items_schema = items_schema[0] if items_schema else None

            processed_items: t.List[t.Any] = []
            for item in value:
                processed_item = self._substitute_file_upload_value(
                    value=item,
                    schema=items_schema,
                    tool=tool,
                    before_file_upload=before_file_upload,
                )
                if processed_item is not _DELETE_VALUE:
                    processed_items.append(processed_item)
            return processed_items

        return value

    def _substitute_file_uploads_recursively(
        self,
        tool: Tool,
        schema: t.Dict,
        request: t.Dict,
        *,
        before_file_upload: t.Optional[BeforeFileUpload] = None,
    ) -> t.Dict:
        processed = self._substitute_file_upload_value(
            value=request,
            schema=schema,
            tool=tool,
            before_file_upload=before_file_upload,
        )
        if processed is request:
            return request
        if isinstance(processed, dict):
            request.clear()
            request.update(processed)
            return request
        assert isinstance(processed, dict), (
            "expected dict from _substitute_file_upload_value at the root; "
            f"got {type(processed).__name__}"
        )
        return processed

    def substitute_file_uploads(
        self,
        tool: Tool,
        request: t.Dict,
        *,
        before_file_upload: t.Optional[BeforeFileUpload] = None,
    ) -> t.Dict:
        """Stage file-uploadable leaves in ``request`` and return it.

        Mutation contract: the top-level ``request`` dict is mutated in place
        and its identity is preserved (the return value is the same object).
        Nested dicts inside ``request`` may be replaced with fresh dicts
        rather than mutated, so callers should not retain references to
        nested values across this call.
        """
        return self._substitute_file_uploads_recursively(
            tool=tool,
            # Inline $ref/$defs once at the boundary so the walker sees
            # file_uploadable flags hidden behind a reference. Non-mutating:
            # ``tool.input_parameters`` is left untouched.
            schema=dereference_json_schema(
                tool.input_parameters, on_unresolved="sentinel"
            ),
            request=request,
            before_file_upload=before_file_upload,
        )

    def _is_file_downloadable(self, schema: t.Dict) -> bool:
        """Check if a schema has file_downloadable property."""
        return self._has_file_property(schema, "file_downloadable")

    def _find_downloadable_schema_variant(
        self, schema: t.Dict, value: t.Any = None
    ) -> t.Optional[t.Dict]:
        """Find a schema variant that contains file_downloadable properties."""
        return self._find_schema_variant_with_file_property(
            schema=schema,
            property_name="file_downloadable",
            value=value,
        )

    def _download_file_value(self, value: t.Any, tool: Tool) -> t.Any:
        if isinstance(value, dict) and "s3url" in value:
            if self._outdir_is_default:
                # First point at which the cache directory is genuinely
                # needed. Raises the same RuntimeError that used to be raised
                # at import time, pointing at COMPOSIO_CACHE_DIR.
                ensure_cache_directory()
            # `tool.toolkit.slug` and `tool.slug` come from the API response and
            # are untrusted, so joining them directly would let the response pick
            # the download directory. `secure_join` validates each component and
            # anchors containment on `self._outdir`, which is configured locally
            # and never derived from the response.
            return str(
                FileDownloadable(**value).download(
                    outdir=secure_join(self._outdir, tool.toolkit.slug, tool.slug),
                    root=self._outdir,
                )
            )
        return value

    def _substitute_file_download_value(
        self,
        value: t.Any,
        schema: t.Optional[t.Dict],
        tool: Tool,
    ) -> t.Any:
        """Return ``value`` with file-downloadable leaves saved locally."""
        if not isinstance(schema, dict):
            return value

        if schema.get("file_downloadable", False):
            return self._download_file_value(value=value, tool=tool)

        downloadable_variant = self._find_downloadable_schema_variant(
            schema=schema,
            value=value,
        )
        if downloadable_variant is not None:
            return self._substitute_file_download_value(
                value=value,
                schema=downloadable_variant,
                tool=tool,
            )

        if isinstance(value, dict) and "properties" in schema:
            properties = schema["properties"]
            return {
                key: self._substitute_file_download_value(
                    value=item,
                    schema=properties.get(key),
                    tool=tool,
                )
                for key, item in value.items()
            }

        if isinstance(value, list) and "items" in schema:
            items_schema = schema["items"]
            if isinstance(items_schema, list):
                items_schema = items_schema[0] if items_schema else None
            return [
                self._substitute_file_download_value(
                    value=item,
                    schema=items_schema,
                    tool=tool,
                )
                for item in value
            ]

        return value

    def _substitute_file_downloads_recursively(
        self,
        tool: Tool,
        schema: t.Dict,
        request: t.Dict,
    ) -> t.Dict:
        processed = self._substitute_file_download_value(
            value=request,
            schema=schema,
            tool=tool,
        )
        if processed is request:
            return request
        if isinstance(processed, dict):
            request.clear()
            request.update(processed)
            return request
        assert isinstance(processed, dict), (
            "expected dict from _substitute_file_download_value at the root; "
            f"got {type(processed).__name__}"
        )
        return processed

    def substitute_file_downloads(
        self,
        tool: Tool,
        response: ToolExecutionResponse,
    ) -> ToolExecutionResponse:
        """Materialize file-downloadable leaves in ``response`` and return it.

        Mutation contract: the top-level ``response`` dict is mutated in
        place and its identity is preserved (the return value is the same
        object). Nested dicts inside ``response`` may be replaced with
        fresh dicts rather than mutated, so callers should not retain
        references to nested values across this call.
        """
        return t.cast(
            "ToolExecutionResponse",
            self._substitute_file_downloads_recursively(
                tool=tool,
                # Inline $ref/$defs once at the boundary so the walker sees
                # file_downloadable flags hidden behind a reference (e.g.
                # GMAIL_GET_ATTACHMENT). Non-mutating: ``tool.output_parameters``
                # is left untouched.
                schema=dereference_json_schema(
                    tool.output_parameters, on_unresolved="sentinel"
                ),
                request=t.cast(dict, response),
            ),
        )
