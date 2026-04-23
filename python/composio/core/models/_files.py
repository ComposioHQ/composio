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
)
from composio.utils import mimetypes
from composio.utils.sensitive_file_upload_paths import (
    assert_safe_local_file_upload_path,
)
from composio.utils.logging import WithLogger

if t.TYPE_CHECKING:
    from .tools import ToolExecutionResponse

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

LOCAL_CACHE_DIRECTORY_NAME = ".composio"
"""
Local cache directory name for composio CLI
"""

ENV_LOCAL_CACHE_DIRECTORY = "COMPOSIO_CACHE_DIR"
"""
Environment to set the composio caching directory.
"""

LOCAL_CACHE_DIRECTORY = Path(
    os.environ.get(
        ENV_LOCAL_CACHE_DIRECTORY,
        Path.home() / LOCAL_CACHE_DIRECTORY_NAME,  # Fallback to user directory
    )
)
"""
Path to local caching directory.
"""

try:
    LOCAL_CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    if not os.access(LOCAL_CACHE_DIRECTORY, os.W_OK):
        raise OSError
except OSError as e:
    raise RuntimeError(
        f"Cache directory {LOCAL_CACHE_DIRECTORY} is not writable please "
        f"provide a path that is writable using {ENV_LOCAL_CACHE_DIRECTORY} "
        "environment variable."
    ) from e


LOCAL_OUTPUT_FILE_DIRECTORY = LOCAL_CACHE_DIRECTORY / "outputs"
"""
Local output file directory name for composio tools
"""


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
    obj = hashlib.md5()
    with file.open("rb") as fp:
        while True:
            line = fp.read(_DEFAULT_CHUNK_SIZE)
            if not line:
                break
            obj.update(line)
    return obj.hexdigest()


def upload(url: str, file: Path) -> bool:
    """Upload file to presigned S3 URL.

    Args:
        url: Presigned S3 upload URL
        file: Path to file to upload

    Returns:
        True if upload succeeded (HTTP 200), False otherwise
    """
    with file.open("rb") as data:
        response = requests.put(url=url, data=data)
        return response.status_code == 200


class _FileUploadResponse(_ComposioBaseModel):
    id: str
    key: str
    type: str
    new_presigned_url: str


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

    # Check Content-Length header first (early abort for oversized files)
    content_length = response.headers.get("Content-Length")
    if content_length and int(content_length) > max_size:
        response.close()
        raise ResponseTooLargeError(
            f"File size ({int(content_length)} bytes) exceeds maximum allowed "
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
    md5_hash = hashlib.md5(content).hexdigest()

    s3meta = client.post(
        path=_FILE_UPLOAD,
        body={
            "md5": md5_hash,
            "filename": filename,
            "mimetype": mimetype,
            "tool_slug": tool,
            "toolkit_slug": toolkit,
        },
        cast_to=_FileUploadResponse,
    )

    # Upload the content directly to S3
    upload_response = requests.put(
        url=s3meta.new_presigned_url,
        data=content,
        headers={"Content-Type": mimetype},
    )

    if upload_response.status_code != 200:
        raise ErrorUploadingFile(
            f"Failed to upload to S3. Status: {upload_response.status_code}. "
            f"This may indicate an expired presigned URL or permission issue."
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
        before_file_upload: t.Optional[
            t.Callable[[str, str, str], t.Union[str, bool]]
        ] = None,
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
        :param before_file_upload: Optional ``(path, tool, toolkit) -> str | bool``; return a new path string, or False to abort.
        :return: FileUploadable instance with S3 key
        """
        file_str = str(file) if isinstance(file, Path) else file

        # Check if it's a URL
        if isinstance(file_str, str) and _is_url(file_str):
            path_in = file_str
            if before_file_upload is not None:
                out = before_file_upload(path_in, tool, toolkit)
                if out is False:
                    raise FileUploadAbortedError(
                        "File upload was aborted because before_file_upload returned False."
                    )
                if isinstance(out, str):
                    path_in = out
            return cls.from_url(client=client, url=path_in, tool=tool, toolkit=toolkit)

        path_in = file_str
        if before_file_upload is not None:
            out = before_file_upload(path_in, tool, toolkit)
            if out is False:
                raise FileUploadAbortedError(
                    "File upload was aborted because before_file_upload returned False."
                )
            if isinstance(out, str):
                path_in = out

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
        s3meta = client.post(
            path=_FILE_UPLOAD,
            body={
                "md5": get_md5(file=file),
                "filename": file.name,
                "mimetype": mimetype,
                "tool_slug": tool,
                "toolkit_slug": toolkit,
            },
            cast_to=_FileUploadResponse,
        )
        if not upload(url=s3meta.new_presigned_url, file=file):
            raise ErrorUploadingFile(f"Error uploading file: {file}")
        return cls(name=file.name, mimetype=mimetype, s3key=s3meta.key)


class FileDownloadable(BaseModel):
    model_config = ConfigDict(json_schema_extra={"file_downloadable": True})

    name: str = Field(..., description="Name of the file")
    mimetype: str = Field(..., description="Mime type of the file.")
    s3url: str = Field(..., description="URL of the file.")

    def download(self, outdir: Path, chunk_size: int = _DEFAULT_CHUNK_SIZE) -> Path:
        outfile = outdir / self.name
        outdir.mkdir(exist_ok=True, parents=True)
        response = requests.get(url=self.s3url, stream=True)
        if response.status_code != 200:
            raise ErrorDownloadingFile(f"Error downloading file: {self.s3url}")

        with outfile.open("wb") as fd:
            for chunk in response.iter_content(chunk_size=chunk_size):
                fd.write(chunk)
        return outfile


BeforeFileUpload = t.Callable[[str, str, str], t.Union[str, bool]]


class FileHelper(WithLogger):
    def __init__(
        self,
        client: HttpClient,
        outdir: t.Optional[str] = None,
        *,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._outdir = Path(outdir or LOCAL_OUTPUT_FILE_DIRECTORY)
        self._sensitive_file_upload_protection = sensitive_file_upload_protection
        self._file_upload_path_deny_segments = file_upload_path_deny_segments

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
        regardless of the auto_upload_download_files setting.
        """
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
        Should only be called when auto_upload_download_files is True.
        Recursively handles anyOf, oneOf, allOf, nested properties, and array items.
        """
        if "properties" not in schema:
            return schema

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

    def _find_uploadable_schema_variant(self, schema: t.Dict) -> t.Optional[t.Dict]:
        """Find a schema variant that contains file_uploadable properties."""
        # Check anyOf variants
        if "anyOf" in schema:
            for variant in schema["anyOf"]:
                if self._has_file_property(variant, "file_uploadable"):
                    return variant

        # Check oneOf variants
        if "oneOf" in schema:
            for variant in schema["oneOf"]:
                if self._has_file_property(variant, "file_uploadable"):
                    return variant

        # Check allOf - merge all variants
        if "allOf" in schema:
            for variant in schema["allOf"]:
                if self._has_file_property(variant, "file_uploadable"):
                    return variant

        return None

    def _substitute_file_uploads_recursively(
        self,
        tool: Tool,
        schema: t.Dict,
        request: t.Dict,
        *,
        before_file_upload: t.Optional[BeforeFileUpload] = None,
    ) -> t.Dict:
        if "properties" not in schema:
            return request

        params = schema["properties"]
        for _param in list(request.keys()):
            if _param not in params:
                continue

            param_schema = params[_param]

            # Direct file_uploadable check
            if param_schema.get("file_uploadable", False):
                # skip if the file is not provided
                if request[_param] is None or request[_param] == "":
                    del request[_param]
                    continue

                request[_param] = FileUploadable.from_path(
                    client=self._client,
                    file=request[_param],
                    tool=tool.slug,
                    toolkit=tool.toolkit.slug,
                    sensitive_file_upload_protection=self._sensitive_file_upload_protection,
                    file_upload_path_deny_segments=self._file_upload_path_deny_segments,
                    before_file_upload=before_file_upload,
                ).model_dump()
                continue

            # Check anyOf/oneOf/allOf for file_uploadable
            uploadable_variant = self._find_uploadable_schema_variant(param_schema)
            if uploadable_variant is not None:
                # If the variant itself is file_uploadable
                if uploadable_variant.get("file_uploadable", False):
                    if request[_param] is None or request[_param] == "":
                        del request[_param]
                        continue

                    request[_param] = FileUploadable.from_path(
                        client=self._client,
                        file=request[_param],
                        tool=tool.slug,
                        toolkit=tool.toolkit.slug,
                        sensitive_file_upload_protection=self._sensitive_file_upload_protection,
                        file_upload_path_deny_segments=self._file_upload_path_deny_segments,
                        before_file_upload=before_file_upload,
                    ).model_dump()
                    continue

                # If the variant has nested properties with file_uploadable
                if (
                    isinstance(request[_param], dict)
                    and uploadable_variant.get("type") == "object"
                ):
                    request[_param] = self._substitute_file_uploads_recursively(
                        schema=uploadable_variant,
                        request=request[_param],
                        tool=tool,
                        before_file_upload=before_file_upload,
                    )
                    continue

            # Handle nested objects
            if (
                isinstance(request[_param], dict)
                and param_schema.get("type") == "object"
            ):
                request[_param] = self._substitute_file_uploads_recursively(
                    schema=param_schema,
                    request=request[_param],
                    tool=tool,
                    before_file_upload=before_file_upload,
                )
                continue

            # Handle arrays with file_uploadable items
            if (
                isinstance(request[_param], list)
                and param_schema.get("type") == "array"
                and "items" in param_schema
            ):
                items_schema = param_schema["items"]
                if isinstance(items_schema, dict):
                    processed_items: t.List[t.Any] = []
                    for item in request[_param]:
                        if self._has_file_property(items_schema, "file_uploadable"):
                            if items_schema.get("file_uploadable", False):
                                if item is not None and item != "":
                                    processed_items.append(
                                        FileUploadable.from_path(
                                            client=self._client,
                                            file=item,
                                            tool=tool.slug,
                                            toolkit=tool.toolkit.slug,
                                            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
                                            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
                                            before_file_upload=before_file_upload,
                                        ).model_dump()
                                    )
                            elif isinstance(item, dict):
                                processed_items.append(
                                    self._substitute_file_uploads_recursively(
                                        schema=items_schema,
                                        request=item,
                                        tool=tool,
                                        before_file_upload=before_file_upload,
                                    )
                                )
                            else:
                                processed_items.append(item)
                        else:
                            processed_items.append(item)
                    request[_param] = processed_items

        return request

    def substitute_file_uploads(
        self,
        tool: Tool,
        request: t.Dict,
        *,
        before_file_upload: t.Optional[BeforeFileUpload] = None,
    ) -> t.Dict:
        return self._substitute_file_uploads_recursively(
            tool=tool,
            schema=tool.input_parameters,
            request=request,
            before_file_upload=before_file_upload,
        )

    def _is_file_downloadable(self, schema: t.Dict) -> bool:
        """Check if a schema has file_downloadable property."""
        return self._has_file_property(schema, "file_downloadable")

    def _find_downloadable_schema_variant(self, schema: t.Dict) -> t.Optional[t.Dict]:
        """Find a schema variant that contains file_downloadable properties."""
        # Check anyOf variants
        if "anyOf" in schema:
            for variant in schema["anyOf"]:
                if self._has_file_property(variant, "file_downloadable"):
                    return variant

        # Check oneOf variants
        if "oneOf" in schema:
            for variant in schema["oneOf"]:
                if self._has_file_property(variant, "file_downloadable"):
                    return variant

        # Check allOf variants
        if "allOf" in schema:
            for variant in schema["allOf"]:
                if self._has_file_property(variant, "file_downloadable"):
                    return variant

        return None

    def _substitute_file_downloads_recursively(
        self,
        tool: Tool,
        schema: t.Dict,
        request: t.Dict,
    ) -> t.Dict:
        if "properties" not in schema:
            return request

        params = schema["properties"]
        for _param in list(request.keys()):
            if _param not in params:
                continue

            param_schema = params[_param]
            param_value = request[_param]

            # Skip None values
            if param_value is None:
                continue

            # Direct file_downloadable check
            if param_schema.get("file_downloadable", False):
                if isinstance(param_value, dict) and "s3url" in param_value:
                    request[_param] = str(
                        FileDownloadable(**param_value).download(
                            self._outdir / tool.toolkit.slug / tool.slug
                        )
                    )
                continue

            # Check anyOf/oneOf/allOf for file_downloadable
            downloadable_variant = self._find_downloadable_schema_variant(param_schema)
            if downloadable_variant is not None:
                # If the variant itself is file_downloadable
                if downloadable_variant.get("file_downloadable", False):
                    if isinstance(param_value, dict) and "s3url" in param_value:
                        request[_param] = str(
                            FileDownloadable(**param_value).download(
                                self._outdir / tool.toolkit.slug / tool.slug
                            )
                        )
                    continue

                # If the variant has nested properties with file_downloadable
                if (
                    isinstance(param_value, dict)
                    and downloadable_variant.get("type") == "object"
                ):
                    request[_param] = self._substitute_file_downloads_recursively(
                        schema=downloadable_variant,
                        request=param_value,
                        tool=tool,
                    )
                    continue

            # Handle nested objects
            if isinstance(param_value, dict) and param_schema.get("type") == "object":
                request[_param] = self._substitute_file_downloads_recursively(
                    schema=param_schema,
                    request=param_value,
                    tool=tool,
                )
                continue

            # Handle arrays with file_downloadable items
            if (
                isinstance(param_value, list)
                and param_schema.get("type") == "array"
                and "items" in param_schema
            ):
                items_schema = param_schema["items"]
                if isinstance(items_schema, dict):
                    processed_items: t.List[t.Any] = []
                    for item in param_value:
                        if item is None:
                            processed_items.append(item)
                            continue

                        if self._has_file_property(items_schema, "file_downloadable"):
                            if items_schema.get("file_downloadable", False):
                                if isinstance(item, dict) and "s3url" in item:
                                    processed_items.append(
                                        str(
                                            FileDownloadable(**item).download(
                                                self._outdir
                                                / tool.toolkit.slug
                                                / tool.slug
                                            )
                                        )
                                    )
                                else:
                                    processed_items.append(item)
                            elif isinstance(item, dict):
                                # Check for anyOf/oneOf/allOf in items schema
                                item_variant = self._find_downloadable_schema_variant(
                                    items_schema
                                )
                                if item_variant is not None:
                                    processed_items.append(
                                        self._substitute_file_downloads_recursively(
                                            schema=item_variant,
                                            request=item,
                                            tool=tool,
                                        )
                                    )
                                else:
                                    processed_items.append(
                                        self._substitute_file_downloads_recursively(
                                            schema=items_schema,
                                            request=item,
                                            tool=tool,
                                        )
                                    )
                            else:
                                processed_items.append(item)
                        else:
                            processed_items.append(item)
                    request[_param] = processed_items

        return request

    def substitute_file_downloads(
        self,
        tool: Tool,
        response: ToolExecutionResponse,
    ) -> ToolExecutionResponse:
        return t.cast(
            "ToolExecutionResponse",
            self._substitute_file_downloads_recursively(
                tool=tool,
                schema=tool.output_parameters,
                request=t.cast(dict, response),
            ),
        )
