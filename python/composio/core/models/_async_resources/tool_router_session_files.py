from __future__ import annotations

import typing as t
from pathlib import Path

import requests
from composio_client import omit
from composio_client.types.tool_router.session.file_delete_response import (
    FileDeleteResponse,
)
from composio_client.types.tool_router.session.file_list_response import (
    FileListResponse,
)

from composio.client._async import AsyncHttpClient
from composio.core.models.tool_router_session_files import (
    _CONNECT_TIMEOUT,
    _READ_TIMEOUT,
    DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ToolRouterSessionFilesMount,
)
from composio.exceptions import (
    ValidationError,
)
from composio.utils.url_safety import safe_request

from .files import AsyncRemoteFile
from .workers import run_file_io


class AsyncToolRouterSessionFilesMount:
    """Async counterpart to ToolRouterSessionFilesMount."""

    def __init__(self, client: AsyncHttpClient, session_id: str) -> None:
        self._client = client
        self._session_id = session_id

    async def list(
        self,
        *,
        path: t.Optional[str] = None,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
        cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
    ) -> FileListResponse:
        """List files and directories at the specified path on the session's file mount."""
        raw_path = path or ""
        if raw_path in ("", "/"):
            mount_relative_prefix_arg: t.Any = omit
        else:
            prefix_str = raw_path[1:] if raw_path.startswith("/") else raw_path
            mount_relative_prefix_arg = prefix_str if prefix_str else omit
        return await self._client.tool_router.session.files.list(
            mount_id,
            session_id=self._session_id,
            mount_relative_prefix=mount_relative_prefix_arg,
            cursor=cursor if cursor else omit,
            limit=int(limit) if limit is not None else omit,
        )

    async def upload(
        self,
        input: t.Union[str, Path, bytes, bytearray],
        *,
        remote_path: t.Optional[str] = None,
        mimetype: t.Optional[str] = None,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> AsyncRemoteFile:
        """Upload a file to the session's file mount."""
        content, rpath, mime = await run_file_io(
            ToolRouterSessionFilesMount._normalize_upload_input,
            input,
            remote_path=remote_path,
            mimetype=mimetype,
        )
        create_resp = await self._client.tool_router.session.files.create_upload_url(
            mount_id,
            session_id=self._session_id,
            mount_relative_path=rpath,
            mimetype=mime,
        )
        try:
            upload_resp = await run_file_io(
                safe_request,
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
        download_resp = (
            await self._client.tool_router.session.files.create_download_url(
                mount_id,
                session_id=self._session_id,
                mount_relative_path=create_resp.mount_relative_path,
            )
        )
        return AsyncRemoteFile.from_api_response(download_resp)

    async def download(
        self,
        file_path: str,
        *,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> AsyncRemoteFile:
        """Download a file from the session's file mount."""
        resp = await self._client.tool_router.session.files.create_download_url(
            mount_id, session_id=self._session_id, mount_relative_path=file_path
        )
        return AsyncRemoteFile.from_api_response(resp)

    async def delete(
        self,
        remote_path: str,
        *,
        mount_id: str = DEFAULT_TOOL_ROUTER_SESSION_FILES_MOUNT_ID,
    ) -> FileDeleteResponse:
        """Delete a file or directory at the specified path on the session's file mount."""
        return await self._client.tool_router.session.files.delete(
            mount_id, session_id=self._session_id, mount_relative_path=remote_path
        )
