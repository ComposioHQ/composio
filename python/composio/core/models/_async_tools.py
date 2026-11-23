from __future__ import annotations

import asyncio
import functools
import typing as t
from pathlib import Path

from composio_client import APIStatusError, omit
from composio_client.types.file_create_presigned_url_response import (
    FileCreatePresignedURLResponse,
)

from composio.client._async import AsyncHttpClient
from composio.client.types import (
    Tool,
    tool_execute_params,
    tool_proxy_params,
    tool_proxy_response,
)
from composio.core.models._async_resources.workers import run_file_io as run_blocking
from composio.core.models._files import FileHelper
from composio.core.models.base import AsyncResource
from composio.core.models.custom_tool_types import (
    InlineCustomToolsWirePayload,
)
from composio.core.models.tools import (
    TOOL_ROUTER_SESSION_TOOLS_PAGE_LIMIT,
    ToolExecutionResponse,
    _normalize_tool,
    _serialize_arguments,
    _toolkit_slug,
    _prepare_tool_schemas,
    require_execute_result,
    tool_execution_response_from_session,
)
from composio.core.provider import TTool, TToolCollection
from composio.core.provider._async import (
    AsyncToolCallback,
    require_async_tool_execution,
)
from composio.core.provider.agentic import (
    AgenticProvider,
    AgenticProviderExecuteFn,
    bind_execution_target,
)
from composio.core.provider.base import AsyncExecuteToolFn, BaseProvider
from composio.core.provider.none_agentic import NonAgenticProvider
from composio.core.types import ToolkitVersionParam
from composio.exceptions import (
    InvalidParams,
    ToolNotFoundError,
    ToolVersionRequiredError,
    sanitize_error_text,
)
from composio.utils.pydantic import none_to_omit
from composio.utils.toolkit_version import get_toolkit_version
from composio.utils.upload_dir_allowlist import resolve_effective_upload_allowlist

from ._modifiers import (
    Modifiers,
    ToolExecuteParams,
    apply_modifier_by_type,
    merge_before_file_upload,
)


class _FilePresigner:
    """A transfer worker requests its presigned URL on the async client's owning loop."""

    def __init__(self, client: AsyncHttpClient) -> None:
        self._client = client
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def files(self) -> _FilePresigner:
        return self

    def create_presigned_url(
        self,
        *,
        md5: str,
        filename: str,
        mimetype: str,
        tool_slug: str,
        toolkit_slug: str,
    ) -> FileCreatePresignedURLResponse:
        if self._loop is None or not self._loop.is_running():
            raise RuntimeError("File upload requires an active async client")
        request = self._client.files.create_presigned_url(
            md5=md5,
            filename=filename,
            mimetype=mimetype,
            tool_slug=tool_slug,
            toolkit_slug=toolkit_slug,
        )
        return asyncio.run_coroutine_threadsafe(request, self._loop).result()


class AsyncTools(AsyncResource, t.Generic[TTool, TToolCollection]):
    """Discover provider tools and execute API calls with native async I/O."""

    def __init__(
        self,
        client: AsyncHttpClient,
        provider: BaseProvider[TTool, TToolCollection],
        file_download_dir: t.Optional[str] = None,
        toolkit_versions: t.Optional[ToolkitVersionParam] = None,
        dangerously_allow_auto_upload_download_files: bool = False,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_dirs: t.Union[t.Sequence[str], t.Literal[False], None] = None,
        *,
        _bind_provider: bool = True,
    ):
        """Initialize the tools resource."""
        self._auto_upload_download_files = bool(
            dangerously_allow_auto_upload_download_files
        )
        resolved_allowlist: t.Optional[t.List[Path]] = (
            resolve_effective_upload_allowlist(file_upload_dirs)
            if self._auto_upload_download_files
            else None
        )
        super().__init__(client)
        self._presigner = _FilePresigner(client)
        self._tool_schemas: t.Dict[str, Tool] = {}
        self._file_helper = FileHelper(
            client=self._presigner,
            outdir=file_download_dir,
            sensitive_file_upload_protection=sensitive_file_upload_protection,
            file_upload_path_deny_segments=file_upload_path_deny_segments,
            file_upload_allowlist=resolved_allowlist,
        )
        self._toolkit_versions = toolkit_versions
        self.provider = provider
        if _bind_provider:
            self.provider.aexecute_tool = t.cast(
                AsyncExecuteToolFn,
                functools.partial(self.execute, dangerously_skip_version_check=True),
            )

    async def get_raw_composio_tool_by_slug(self, slug: str) -> Tool:
        """Returns schema for the given tool slug."""
        try:
            response = await self._client.tools.retrieve(
                tool_slug=slug, toolkit_versions=none_to_omit(self._toolkit_versions)
            )
        except APIStatusError as error:
            if error.status_code in (400, 404):
                message = f"Tool with slug {slug} not found"
                if error.details is not None:
                    message = (
                        f"{message}: {sanitize_error_text(error.details['message'])}"
                    )
                raise ToolNotFoundError(message) from error
            raise
        return _normalize_tool(response)

    async def get_raw_composio_tools(
        self,
        tools: t.Optional[list[str]] = None,
        search: t.Optional[str] = None,
        toolkits: t.Optional[list[str]] = None,
        scopes: t.Optional[t.List[str]] = None,
        limit: t.Optional[int] = None,
    ) -> list[Tool]:
        """Get a list of tool schemas based on the provided filters."""
        if tools is None and search is None and (toolkits is None):
            raise InvalidParams(
                "Either `tools`, `search`, or `toolkits` must be provided"
            )
        tools_list = []
        if tools is not None:
            if len(tools):
                tools_list.extend(
                    (
                        await self._client.tools.list(
                            tool_slugs=",".join(tools),
                            toolkit_versions=none_to_omit(self._toolkit_versions),
                        )
                    ).items
                )
        if toolkits is not None or search is not None:
            tools_list.extend(
                (
                    await self._client.tools.list(
                        toolkit_slug=none_to_omit(
                            ",".join(toolkits) if toolkits else None
                        ),
                        query=none_to_omit(search),
                        scopes=scopes,
                        limit=limit,
                        toolkit_versions=none_to_omit(self._toolkit_versions),
                    )
                ).items
            )
        return [_normalize_tool(tool) for tool in tools_list]

    async def get_raw_tool_router_meta_tools(
        self, session_id: str, modifiers: t.Optional["Modifiers"] = None
    ) -> list[Tool]:
        """Fetches the tools exposed by a tool router session."""
        tools_list: t.List[Tool] = []
        cursor: t.Optional[str] = None
        while True:
            tools_response = await self._client.tool_router.session.tools(
                session_id=session_id,
                cursor=none_to_omit(cursor),
                limit=TOOL_ROUTER_SESSION_TOOLS_PAGE_LIMIT,
            )
            tools_list.extend((_normalize_tool(item) for item in tools_response.items))
            cursor = getattr(tools_response, "next_cursor", None)
            if not cursor:
                break
        return _prepare_tool_schemas(tools_list, self._tool_schemas, modifiers)

    async def _get(
        self,
        user_id: str,
        tools: t.Optional[list[str]] = None,
        search: t.Optional[str] = None,
        toolkits: t.Optional[list[str]] = None,
        scopes: t.Optional[t.List[str]] = None,
        modifiers: t.Optional[Modifiers] = None,
        limit: t.Optional[int] = None,
    ) -> TToolCollection:
        """Get a list of tools based on the provided filters."""
        require_async_tool_execution(self.provider)
        raw_tools = await self.get_raw_composio_tools(
            tools=tools, search=search, toolkits=toolkits, scopes=scopes, limit=limit
        )
        tools_list = _prepare_tool_schemas(raw_tools, self._tool_schemas, modifiers)

        for tool in tools_list:
            tool.input_parameters = self._file_helper.enhance_schema_descriptions(
                schema=tool.input_parameters
            )
        if self._auto_upload_download_files:
            for tool in tools_list:
                tool.input_parameters = (
                    self._file_helper.process_file_uploadable_schema(
                        schema=tool.input_parameters
                    )
                )
        if issubclass(type(self.provider), NonAgenticProvider):
            return t.cast(
                TToolCollection,
                t.cast(
                    NonAgenticProvider[TTool, TToolCollection], self.provider
                ).wrap_tools(tools=tools_list),
            )
        return t.cast(
            TToolCollection,
            t.cast(AgenticProvider[TTool, TToolCollection], self.provider).wrap_tools(
                tools=tools_list,
                execute_tool=self._wrap_execute_tool(
                    user_id=user_id, modifiers=modifiers
                ),
            ),
        )

    async def get(
        self,
        user_id: str,
        *,
        slug: t.Optional[str] = None,
        tools: t.Optional[list[str]] = None,
        search: t.Optional[str] = None,
        toolkits: t.Optional[list[str]] = None,
        scopes: t.Optional[t.List[str]] = None,
        modifiers: t.Optional[Modifiers] = None,
        limit: t.Optional[int] = None,
    ) -> TToolCollection:
        """Get a tool or list of tools based on the provided arguments."""
        if slug is not None:
            return await self._get(user_id=user_id, tools=[slug], modifiers=modifiers)
        return await self._get(
            user_id=user_id,
            tools=tools,
            search=search,
            toolkits=toolkits,
            scopes=scopes,
            modifiers=modifiers,
            limit=limit,
        )

    def _wrap_execute_tool(
        self, modifiers: t.Optional[Modifiers] = None, user_id: t.Optional[str] = None
    ) -> AgenticProviderExecuteFn:
        """Wrap the execute tool function"""
        execute_tool = AsyncToolCallback(
            functools.partial(
                self.execute,
                modifiers=modifiers,
                user_id=user_id,
                dangerously_skip_version_check=True,
            )
        )
        if user_id is None:
            return t.cast(AgenticProviderExecuteFn, execute_tool)
        return t.cast(
            AgenticProviderExecuteFn, bind_execution_target(execute_tool, user_id)
        )

    def _wrap_execute_tool_for_tool_router(
        self,
        session_id: str,
        modifiers: t.Optional[Modifiers] = None,
        inline_custom_tools_payload: t.Optional[InlineCustomToolsWirePayload] = None,
    ) -> t.Callable[[str, dict], t.Awaitable[dict]]:
        """Create an execute function for tool router session tools."""

        async def execute_tool_fn(slug: str, arguments: t.Dict) -> t.Dict:
            """Execute a tool in the tool router session."""
            tool = self._tool_schemas.get(slug)
            if tool is None:
                tool = await self.get_raw_composio_tool_by_slug(slug)
                self._tool_schemas[slug] = tool
            if self._auto_upload_download_files:
                meta_tk = _toolkit_slug(tool, "composio")
                bfu = merge_before_file_upload(modifiers, tool=slug, toolkit=meta_tk)
                arguments = await self._upload_files(
                    tool=tool, request=arguments, before_file_upload=bfu
                )
            else:
                arguments = self._file_helper.drop_empty_file_uploads(
                    tool=tool, request=arguments
                )
            toolkit_slug = _toolkit_slug(tool, "composio")
            processed_arguments = arguments
            if modifiers is not None:
                params: ToolExecuteParams = {"arguments": arguments}
                type_before: t.Literal["before_execute"] = "before_execute"
                modified_params = apply_modifier_by_type(
                    modifiers=modifiers,
                    toolkit=toolkit_slug,
                    tool=slug,
                    type=type_before,
                    request=params,
                )
                processed_arguments = modified_params.get("arguments", arguments)
            processed_arguments = _serialize_arguments(processed_arguments)
            response = require_execute_result(
                await self._client.without_retries.tool_router.session.execute(
                    session_id=session_id,
                    tool_slug=slug,
                    arguments=processed_arguments,
                    enable_auto_workbench_offload=True,
                    experimental=inline_custom_tools_payload
                    if inline_custom_tools_payload is not None
                    else omit,
                ),
                slug,
            )
            result = tool_execution_response_from_session(response)
            if modifiers is not None:
                type_after: t.Literal["after_execute"] = "after_execute"
                result = apply_modifier_by_type(
                    modifiers=modifiers,
                    toolkit=toolkit_slug,
                    tool=slug,
                    type=type_after,
                    response=result,
                )
            return t.cast(t.Dict, result)

        return execute_tool_fn

    async def _execute_tool(
        self,
        slug: str,
        arguments: t.Dict,
        tool: Tool,
        connected_account_id: t.Optional[str] = None,
        custom_auth_params: t.Optional[tool_execute_params.CustomAuthParams] = None,
        custom_connection_data: t.Optional[
            tool_execute_params.CustomConnectionData
        ] = None,
        user_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        version: t.Optional[str] = None,
        dangerously_skip_version_check: t.Optional[bool] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool"""
        arguments = _serialize_arguments(arguments)
        if version is None:
            toolkit_slug = _toolkit_slug(tool, "unknown")
            version = get_toolkit_version(toolkit_slug, self._toolkit_versions)
        if version == "latest" and (not dangerously_skip_version_check):
            raise ToolVersionRequiredError()
        return t.cast(
            ToolExecutionResponse,
            (
                await self._client.without_retries.tools.execute(
                    tool_slug=slug,
                    arguments=arguments,
                    connected_account_id=none_to_omit(connected_account_id),
                    custom_auth_params=none_to_omit(custom_auth_params),
                    custom_connection_data=none_to_omit(custom_connection_data),
                    user_id=none_to_omit(user_id),
                    text=none_to_omit(text),
                    version=none_to_omit(version),
                )
            ).model_dump(exclude={"log_id", "session_info"}),
        )

    async def execute(
        self,
        slug: str,
        arguments: t.Dict,
        *,
        connected_account_id: t.Optional[str] = None,
        custom_auth_params: t.Optional[tool_execute_params.CustomAuthParams] = None,
        custom_connection_data: t.Optional[
            tool_execute_params.CustomConnectionData
        ] = None,
        user_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        version: t.Optional[str] = None,
        dangerously_skip_version_check: t.Optional[bool] = None,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool with the provided parameters."""
        tool = self._tool_schemas.get(slug)
        if tool is None:
            tool = await self.get_raw_composio_tool_by_slug(slug)
            self._tool_schemas[slug] = tool
        if self._auto_upload_download_files:
            tk = _toolkit_slug(tool, "unknown")
            bfu = merge_before_file_upload(modifiers, tool=slug, toolkit=tk)
            arguments = await self._upload_files(
                tool=tool, request=arguments, before_file_upload=bfu
            )
        else:
            arguments = self._file_helper.drop_empty_file_uploads(
                tool=tool, request=arguments
            )
        if modifiers is not None:
            type_before_exec: t.Literal["before_execute"] = "before_execute"
            request_params: ToolExecuteParams = {"arguments": arguments}
            if connected_account_id is not None:
                request_params["connected_account_id"] = connected_account_id
            if custom_auth_params is not None:
                request_params["custom_auth_params"] = custom_auth_params
            if custom_connection_data is not None:
                request_params["custom_connection_data"] = custom_connection_data
            if version is not None:
                request_params["version"] = version
            if text is not None:
                request_params["text"] = text
            if user_id is not None:
                request_params["user_id"] = user_id
            if dangerously_skip_version_check is not None:
                request_params["dangerously_skip_version_check"] = (
                    dangerously_skip_version_check
                )
            processed_params = apply_modifier_by_type(
                modifiers=modifiers,
                toolkit=_toolkit_slug(tool, "unknown"),
                tool=slug,
                type=type_before_exec,
                request=request_params,
            )
            connected_account_id = processed_params.get(
                "connected_account_id", connected_account_id
            )
            custom_auth_params = processed_params.get(
                "custom_auth_params", custom_auth_params
            )
            custom_connection_data = processed_params.get(
                "custom_connection_data", custom_connection_data
            )
            text = processed_params.get("text", text)
            version = processed_params.get("version", version)
            user_id = processed_params.get("user_id", user_id)
            arguments = processed_params["arguments"]
            dangerously_skip_version_check = processed_params.get(
                "dangerously_skip_version_check", dangerously_skip_version_check
            )
        response = await self._execute_tool(
            slug=slug,
            arguments=arguments,
            tool=tool,
            connected_account_id=connected_account_id,
            custom_auth_params=custom_auth_params,
            custom_connection_data=custom_connection_data,
            user_id=user_id,
            text=text,
            version=version,
            dangerously_skip_version_check=dangerously_skip_version_check,
        )
        if self._auto_upload_download_files:
            response = await run_blocking(
                self._file_helper.substitute_file_downloads,
                tool=tool,
                response=response,
            )
        if modifiers is not None:
            response = apply_modifier_by_type(
                modifiers=modifiers,
                toolkit=_toolkit_slug(tool, "unknown"),
                tool=slug,
                type="after_execute",
                response=response,
            )
        return response

    async def proxy(
        self,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
        body: t.Optional[object] = None,
        connected_account_id: t.Optional[str] = None,
        parameters: t.Optional[t.List[tool_proxy_params.Parameter]] = None,
        custom_connection_data: t.Optional[
            tool_proxy_params.CustomConnectionData
        ] = None,
        user_id: t.Optional[str] = None,
    ) -> tool_proxy_response.ToolProxyResponse:
        """Proxy a tool call to the Composio API."""
        return await self._client.without_retries.tools.proxy(
            endpoint=endpoint,
            method=method,
            body=body if body is not None else omit,
            connected_account_id=connected_account_id
            if connected_account_id is not None
            else omit,
            parameters=parameters if parameters is not None else omit,
            custom_connection_data=custom_connection_data
            if custom_connection_data is not None
            else omit,
            user_id=user_id if user_id is not None else omit,
        )

    async def _upload_files(self, **kwargs: t.Any) -> dict:
        self._presigner._loop = asyncio.get_running_loop()
        return await run_blocking(self._file_helper.substitute_file_uploads, **kwargs)
