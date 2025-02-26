from __future__ import annotations

import hashlib
import os
import typing as t
from pathlib import Path

import requests
import typing_extensions as te
from pydantic import BaseModel, ConfigDict, Field

from composio.exceptions import (
    ErrorDownloadingFile,
    ErrorUploadingFile,
    SDKFileNotFoundError,
)
from composio.utils import mimetypes


# pylint: disable=missing-timeout

if te.TYPE_CHECKING:
    from composio.client import Composio


_DEFAULT_CHUNK_SIZE = 1024 * 1024


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


class FileUploadable(BaseModel):
    model_config = ConfigDict(json_schema_extra={"file_uploadable": True})

    name: str
    mimetype: str
    s3key: str

    @classmethod
    def from_path(
        cls,
        file: t.Union[str, Path],
        client: Composio,
        action: str,
        app: str,
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
        s3meta = client.actions.create_file_upload(
            app=app,
            action=action,
            filename=file.name,
            mimetype=mimetype,
            md5=get_md5(file=file),
        )
        if not s3meta.exists and not upload(url=s3meta.url, file=file):
            raise ErrorUploadingFile(f"Error uploading file: {file}")

        return cls(
            name=file.name,
            mimetype=mimetype,
            s3key=s3meta.key,
        )


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
