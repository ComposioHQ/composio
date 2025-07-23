from __future__ import annotations

import hashlib
import json
import os
import typing as t
from pathlib import Path

import requests
import typing_extensions as te
from composio_client import BaseModel as _ComposioBaseModel
from pydantic import BaseModel, ConfigDict, Field

from composio.client import HttpClient
from composio.client.types import Tool
from composio.exceptions import (
    ErrorDownloadingFile,
    ErrorUploadingFile,
    SDKFileNotFoundError,
)
from composio.utils import mimetypes
from composio.utils.logging import WithLogger

if t.TYPE_CHECKING:
    from .tools import ToolExecutionResponse

_DEFAULT_CHUNK_SIZE = 1024 * 1024
_FILE_UPLOAD = "/api/v3/files/upload/request"

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


def get_md5(file: Path):
    obj = hashlib.md5()
    with file.open("rb") as fp:
        while True:
            line = fp.read(_DEFAULT_CHUNK_SIZE)
            if not line:
                break
            obj.update(line)
    return obj.hexdigest()


def upload(url: str, file: Path) -> bool:
    with file.open("rb") as data:
        return requests.put(url=url, data=data).status_code in (200, 403)


class _FileUploadResponse(_ComposioBaseModel):
    id: str
    key: str
    type: str
    new_presigned_url: str


class FileUploadable(BaseModel):
    model_config = ConfigDict(json_schema_extra={"file_uploadable": True})

    name: str
    mimetype: str
    s3key: str

    @classmethod
    def from_path(
        cls,
        client: HttpClient,
        file: t.Union[str, Path],
        tool: str,
        toolkit: str,
    ) -> te.Self:
        file = Path(file)
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


class FileHelper(WithLogger):
    def __init__(self, client: HttpClient, outdir: t.Optional[str] = None):
        super().__init__()
        self._client = client
        self._outdir = Path(outdir or LOCAL_OUTPUT_FILE_DIRECTORY)

    def _file_uploadable(self, schema: t.Dict):
        if "allOf" in schema:
            return any(
                (
                    _schema.get("file_uploadable", False)
                    if isinstance(_schema, dict)
                    else False
                )
                for _schema in schema["allOf"]
            )
        return schema.get("file_uploadable", False)

    def _process_file_uploadable(self, schema: t.Dict):
        return {
            "type": "string",
            "format": "path",
            "description": schema.get("description", "Path to file."),
            "title": schema.get("title"),
        }

    def process_schema_recursively(self, schema: t.Dict) -> t.Dict:
        required = schema.get("required") or []
        for _param, _schema in schema["properties"].items():
            if self._file_uploadable(schema=_schema):
                schema["properties"][_param] = self._process_file_uploadable(
                    schema=_schema
                )

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

    def _substitute_file_uploads_recursively(
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

            if self._file_uploadable(schema=params[_param]):
                # skip if the file is not provided
                if request[_param] is None or request[_param] == "":
                    del request[_param]
                    continue

                request[_param] = FileUploadable.from_path(
                    client=self._client,
                    file=request[_param],
                    tool=tool.slug,
                    toolkit=tool.toolkit.slug,
                ).model_dump()
                continue

            if isinstance(request[_param], dict) and params[_param]["type"] == "object":
                request[_param] = self._substitute_file_uploads_recursively(
                    schema=params[_param],
                    request=request[_param],
                    tool=tool,
                )
                continue

        return request

    def substitute_file_uploads(self, tool: Tool, request: t.Dict) -> t.Dict:
        return self._substitute_file_uploads_recursively(
            tool=tool,
            schema=tool.input_parameters,
            request=request,
        )

    def _is_file_downloadable(self, schema: t.Dict) -> bool:
        if "allOf" in schema:
            return any(
                (
                    _schema.get("file_downloadable", False)
                    if isinstance(_schema, dict)
                    else False
                )
                for _schema in schema["allOf"]
            )
        return schema.get("file_downloadable", False)

    def _find_file_downloadable_from_any_of(
        self, schemas: list[dict]
    ) -> t.Optional[t.Dict]:
        for schema in schemas:
            if "type" not in schema or schema["type"] != "object":
                continue

            if self._is_file_downloadable(schema=schema):
                return schema

            # Hack to avoid recursive check, maybe use recursion
            if '"file_downloadable":true' in json.dumps(schema):
                return schema

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
        for _param in request:
            if _param not in params:
                continue

            if self._is_file_downloadable(schema=params[_param]):
                request[_param] = str(
                    FileDownloadable(**request[_param]).download(
                        self._outdir / tool.toolkit.slug / tool.slug
                    )
                )
                continue

            if "anyOf" in params[_param]:
                obj = self._find_file_downloadable_from_any_of(params[_param]["anyOf"])
                if obj is None:
                    continue
                params[_param] = obj

            if isinstance(request[_param], dict) and params[_param]["type"] == "object":
                request[_param] = self._substitute_file_downloads_recursively(
                    schema=params[_param],
                    request=request[_param],
                    tool=tool,
                )
                continue

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
