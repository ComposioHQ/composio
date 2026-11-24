"""Local and third-party file access using the SDK's guarded transfer routines."""

from pathlib import Path

from composio_client.types.tool_router.session.file_create_download_url_response import (
    FileCreateDownloadURLResponse,
)

from composio.core.models.tool_router_session_files import RemoteFile

from .workers import run_file_io


class AsyncRemoteFile:
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

    def _transfer(self) -> RemoteFile:
        return RemoteFile(
            expires_at=self.expires_at,
            mount_relative_path=self.mount_relative_path,
            sandbox_mount_prefix=self.sandbox_mount_prefix,
            download_url=self.download_url,
        )

    @property
    def filename(self) -> str:
        return self._transfer().filename

    async def buffer(self) -> bytes:
        return await run_file_io(self._transfer().buffer)

    async def text(self) -> str:
        return await run_file_io(self._transfer().text)

    async def save(self, path: str | Path | None = None) -> str:
        return await run_file_io(self._transfer().save, path)

    @classmethod
    def from_api_response(
        cls, data: FileCreateDownloadURLResponse
    ) -> "AsyncRemoteFile":
        return cls(
            expires_at=data.expires_at,
            mount_relative_path=data.mount_relative_path,
            sandbox_mount_prefix=data.sandbox_mount_prefix,
            download_url=data.download_url,
        )
