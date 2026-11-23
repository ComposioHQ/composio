from __future__ import annotations

import asyncio
import contextvars
from concurrent.futures import ThreadPoolExecutor
import typing as t
from dataclasses import dataclass

import typing_extensions as te
from composio_client import BadRequestError, ConflictError, Omit, omit
from composio_client._types import SequenceNotStr
from composio_client.types.tool_router import (
    session_create_response,
    session_link_params,
    session_patch_params,
)
from composio_client.types.tool_router.session_attach_response import (
    SessionAttachResponse,
)
from composio_client.types.tool_router.session_retrieve_response import (
    SessionRetrieveResponse,
)

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.client.types import (
    session_config_history_params,
    session_config_history_response,
)
from composio.core.models._async_resources import (
    AsyncConnectionRequest,
    AsyncToolRouterSessionFilesMount,
)
from composio.core.models._async_tools import AsyncTools
from composio.core.models._modifiers import Modifiers, apply_modifier_by_type
from composio.core.models.base import (
    AsyncResource,
)
from composio.core.models.custom_tool import (
    ExperimentalToolkit,
    LocalToolkit,
    build_custom_tools_map_from_response,
    get_preloaded_custom_tool_slugs,
)
from composio.core.models.custom_tool_execution import (
    assert_unambiguous_custom_tool_slug,
    execute_custom_tool,
    find_custom_tool,
)
from composio.core.models.custom_tool_types import (
    CustomTool,
    CustomToolsMap,
    CustomToolsMapEntry,
    InlineCustomToolsWirePayload,
    LocalTool,
    ToolRouterSessionProxyExecuteResponse,
)
from composio.core.models.experimental import ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT
from composio.core.models.session_context import (
    _proxy_parameters,
    _proxy_result,
)
from composio.core.models.session_webhooks import SessionWebhooks
from composio.core.models.tool_router import (
    SessionPreset,
    ToolkitConnectionsDetails,
    ToolRouterConfigTags,
    ToolRouterExperimentalConfig,
    ToolRouterManageConnectionsConfig,
    ToolRouterMCPServerConfig,
    ToolRouterMCPServerType,
    ToolRouterMultiAccountConfig,
    ToolRouterPreloadConfig,
    ToolRouterSandboxConfig,
    ToolRouterToolkitsDisableConfig,
    ToolRouterToolkitsEnableConfig,
    ToolRouterToolkitsRequireApprovalConfig,
    ToolRouterToolsConfig,
    ToolRouterWorkbenchConfig,
    _preloads_all_custom_tools,
    _prepare_inline_custom_tools,
    _prepare_session_create,
    _resolve_local_option,
    _session_preload_config,
    _SessionMcpConfig,
)
from composio.core.models.tool_router_session import (
    COMPOSIO_MULTI_EXECUTE_TOOL,
    MAX_PARALLEL_WORKERS,
    ToolRouterHook,
    ToolRouterInputResponse,
    ToolRouterInstantConfig,
    ToolRouterProxyExecuteConfig,
    ToolRouterSessionConfig,
    ToolRouterSessionMetaToolSlug,
    ToolRouterSessionPreloadConfig,
    ToolRouterSessionSearchResponse,
    ToolRouterUpdateExperimentalConfig,
    ToolRouterUpdateManageConnectionsConfig,
    ToolRouterUpdateMultiAccountConfig,
    _LocalSessionTools,
    _toolkit_connections,
    _merge_multi_execute_results,
)
from composio.core.models.tool_router_session_delete import (
    ToolRouterSessionDeleteResponse,
    _delete_response,
)
from composio.core.models.tools import (
    ToolExecuteParams,
    ToolExecutionResponse,
    ToolRouterSessionExecuteResponse,
    _serialize_arguments,
    require_execute_result,
)
from composio.core.provider import TTool, TToolCollection
from composio.core.provider._async import (
    AsyncToolCallback,
    require_async_tool_execution,
)
from composio.core.provider.base import BaseProvider


# Synchronous framework adapters may already occupy asyncio's default executor
# while awaiting this loop. A local callback needs its own pool in that case.
_callback_workers = ThreadPoolExecutor(
    max_workers=MAX_PARALLEL_WORKERS, thread_name_prefix="composio-local-tool"
)


@dataclass
class AsyncToolRouterSessionExperimental:
    files: AsyncToolRouterSessionFilesMount
    assistive_prompt: str | None = None


class AsyncToolRouter(
    AsyncResource, _SessionMcpConfig[AsyncHttpClient], t.Generic[TTool, TToolCollection]
):
    def __init__(
        self,
        client: AsyncHttpClient,
        provider: t.Optional["BaseProvider[TTool, TToolCollection]"] = None,
        dangerously_allow_auto_upload_download_files: bool = False,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_dirs: t.Union[t.Sequence[str], t.Literal[False], None] = None,
    ):
        """Initialize ToolRouter instance."""
        super().__init__(client)
        self._provider = provider
        self._sensitive_file_upload_protection = sensitive_file_upload_protection
        self._file_upload_path_deny_segments = file_upload_path_deny_segments
        self._file_upload_dirs = file_upload_dirs
        self._auto_upload_download_files = bool(
            dangerously_allow_auto_upload_download_files
        )
        self.webhooks = SessionWebhooks()
        "Read the events Composio sends to the project's session webhook\n        URL, for session hooks with a ``webhook`` handler."

    @t.overload
    async def create(
        self,
        *,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnableConfig,
                ToolRouterToolkitsDisableConfig,
                ToolRouterToolkitsRequireApprovalConfig,
            ]
        ] = None,
        tools: t.Optional[t.Dict[str, ToolRouterToolsConfig]] = None,
        tags: t.Optional[ToolRouterConfigTags] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, t.Union[str, t.List[str]]]] = None,
        sandbox: t.Optional[ToolRouterSandboxConfig] = None,
        workbench: t.Optional[ToolRouterWorkbenchConfig] = None,
        multi_account: t.Optional[ToolRouterMultiAccountConfig] = None,
        proxy_execute: t.Optional[t.Union[bool, ToolRouterProxyExecuteConfig]] = None,
        hooks: t.Optional[t.List[ToolRouterHook]] = None,
        preload: t.Optional[ToolRouterPreloadConfig] = None,
        session_preset: t.Optional[SessionPreset] = None,
        experimental: t.Optional[ToolRouterExperimentalConfig] = None,
        instant: t.Optional[t.Union[t.Literal[False], ToolRouterInstantConfig]] = None,
        mcp: t.Literal[True],
    ) -> AsyncToolRouterSessionWithMcp[TTool, TToolCollection]: ...

    @t.overload
    async def create(
        self,
        *,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnableConfig,
                ToolRouterToolkitsDisableConfig,
                ToolRouterToolkitsRequireApprovalConfig,
            ]
        ] = None,
        tools: t.Optional[t.Dict[str, ToolRouterToolsConfig]] = None,
        tags: t.Optional[ToolRouterConfigTags] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, t.Union[str, t.List[str]]]] = None,
        sandbox: t.Optional[ToolRouterSandboxConfig] = None,
        workbench: t.Optional[ToolRouterWorkbenchConfig] = None,
        multi_account: t.Optional[ToolRouterMultiAccountConfig] = None,
        proxy_execute: t.Optional[t.Union[bool, ToolRouterProxyExecuteConfig]] = None,
        hooks: t.Optional[t.List[ToolRouterHook]] = None,
        preload: t.Optional[ToolRouterPreloadConfig] = None,
        session_preset: t.Optional[SessionPreset] = None,
        experimental: t.Optional[ToolRouterExperimentalConfig] = None,
        instant: t.Optional[t.Union[t.Literal[False], ToolRouterInstantConfig]] = None,
        mcp: t.Literal[False] = False,
    ) -> AsyncToolRouterSession[TTool, TToolCollection]: ...

    async def create(
        self,
        *,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnableConfig,
                ToolRouterToolkitsDisableConfig,
                ToolRouterToolkitsRequireApprovalConfig,
            ]
        ] = None,
        tools: t.Optional[t.Dict[str, ToolRouterToolsConfig]] = None,
        tags: t.Optional[ToolRouterConfigTags] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, t.Union[str, t.List[str]]]] = None,
        sandbox: t.Optional[ToolRouterSandboxConfig] = None,
        workbench: t.Optional[ToolRouterWorkbenchConfig] = None,
        multi_account: t.Optional[ToolRouterMultiAccountConfig] = None,
        proxy_execute: t.Optional[t.Union[bool, ToolRouterProxyExecuteConfig]] = None,
        hooks: t.Optional[t.List[ToolRouterHook]] = None,
        preload: t.Optional[ToolRouterPreloadConfig] = None,
        session_preset: t.Optional[SessionPreset] = None,
        experimental: t.Optional[ToolRouterExperimentalConfig] = None,
        instant: t.Optional[t.Union[t.Literal[False], ToolRouterInstantConfig]] = None,
        mcp: bool = False,
    ) -> AsyncToolRouterSession[TTool, TToolCollection]:
        """Create a new tool router session for a user."""
        (
            create_params,
            custom_tools,
            custom_toolkits,
            default_custom_preload,
            inline_custom_tools_payload,
        ) = _prepare_session_create(
            user_id=user_id,
            toolkits=toolkits,
            tools=tools,
            tags=tags,
            manage_connections=manage_connections,
            auth_configs=auth_configs,
            connected_accounts=connected_accounts,
            sandbox=sandbox,
            workbench=workbench,
            multi_account=multi_account,
            proxy_execute=proxy_execute,
            hooks=hooks,
            preload=preload,
            session_preset=session_preset,
            experimental=experimental,
            instant=instant,
        )
        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. Please initialize ToolRouter with a provider."
            )
        session = await self._client.tool_router.session.create(**create_params)
        custom_tools_map: t.Optional[CustomToolsMap] = None
        if custom_tools or custom_toolkits:
            custom_tools_map = build_custom_tools_map_from_response(
                tools=custom_tools or [],
                toolkits=custom_toolkits,
                experimental=session.experimental,
            )
        preloaded_custom_tool_slugs = get_preloaded_custom_tool_slugs(
            custom_tools_map, default_preload=default_custom_preload
        )
        files_mount = AsyncToolRouterSessionFilesMount(self._client, session.session_id)
        experimental_response = AsyncToolRouterSessionExperimental(
            files=files_mount,
            assistive_prompt=session.experimental.assistive_prompt
            if session.experimental
            else None,
        )
        session_cls: t.Type[AsyncToolRouterSession[TTool, TToolCollection]] = (
            AsyncToolRouterSessionWithMcp if mcp else AsyncToolRouterSession
        )
        return session_cls(
            client=self._client,
            provider=self._provider,
            dangerously_allow_auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            file_upload_dirs=self._file_upload_dirs,
            session_id=session.session_id,
            config=t.cast(ToolRouterSessionConfig, session.config),
            config_version=session.config_version,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
                mcp_requested=mcp,
            ),
            experimental=experimental_response,
            custom_tools_map=custom_tools_map,
            user_id=user_id,
            preload=_session_preload_config(session.config.preload),
            preloaded_custom_tool_slugs=preloaded_custom_tool_slugs,
            inline_custom_tools_payload=inline_custom_tools_payload,
        )

    @t.overload
    async def use(
        self,
        session_id: str,
        *,
        local_tools: t.Optional[t.List[LocalTool]] = None,
        local_toolkits: t.Optional[t.List[LocalToolkit]] = None,
        custom_tools: t.Optional[t.List[CustomTool]] = None,
        custom_toolkits: t.Optional[t.List[ExperimentalToolkit]] = None,
        mcp: t.Literal[True],
    ) -> AsyncToolRouterSessionWithMcp[TTool, TToolCollection]: ...

    @t.overload
    async def use(
        self,
        session_id: str,
        *,
        local_tools: t.Optional[t.List[LocalTool]] = None,
        local_toolkits: t.Optional[t.List[LocalToolkit]] = None,
        custom_tools: t.Optional[t.List[CustomTool]] = None,
        custom_toolkits: t.Optional[t.List[ExperimentalToolkit]] = None,
        mcp: t.Literal[False] = False,
    ) -> AsyncToolRouterSession[TTool, TToolCollection]: ...

    async def use(
        self,
        session_id: str,
        *,
        local_tools: t.Optional[t.List[LocalTool]] = None,
        local_toolkits: t.Optional[t.List[LocalToolkit]] = None,
        custom_tools: t.Optional[t.List[CustomTool]] = None,
        custom_toolkits: t.Optional[t.List[ExperimentalToolkit]] = None,
        mcp: bool = False,
    ) -> AsyncToolRouterSession[TTool, TToolCollection]:
        """Use an existing tool router session."""
        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. Please initialize ToolRouter with a provider."
            )
        custom_tools = _resolve_local_option(
            "local_tools", local_tools, "custom_tools", custom_tools
        )
        custom_toolkits = _resolve_local_option(
            "local_toolkits", local_toolkits, "custom_toolkits", custom_toolkits
        )
        has_customs = bool(custom_tools or custom_toolkits)
        attach_inline_custom_tools_payload = _prepare_inline_custom_tools(
            custom_tools=custom_tools, custom_toolkits=custom_toolkits
        )
        inline_custom_tools_payload = attach_inline_custom_tools_payload
        session: t.Union[SessionAttachResponse, SessionRetrieveResponse]
        if has_customs:
            session = await self._client.tool_router.session.attach(
                session_id,
                experimental=attach_inline_custom_tools_payload
                if attach_inline_custom_tools_payload is not None
                else omit,
            )
        else:
            session = await self._client.tool_router.session.retrieve(session_id)
        default_custom_preload = _preloads_all_custom_tools(session.config.preload)
        if has_customs and default_custom_preload:
            inline_custom_tools_payload = _prepare_inline_custom_tools(
                custom_tools=custom_tools,
                custom_toolkits=custom_toolkits,
                default_preload=True,
            )
        custom_tools_map: t.Optional[CustomToolsMap] = None
        user_id: t.Optional[str] = None
        if has_customs:
            custom_tools_map = build_custom_tools_map_from_response(
                tools=custom_tools or [],
                toolkits=custom_toolkits,
                experimental=session.experimental,
            )
            user_id = session.config.user_id
        preloaded_custom_tool_slugs = get_preloaded_custom_tool_slugs(
            custom_tools_map, default_preload=default_custom_preload
        )
        files_mount = AsyncToolRouterSessionFilesMount(self._client, session.session_id)
        experimental_response = AsyncToolRouterSessionExperimental(
            files=files_mount, assistive_prompt=None
        )
        session_cls: t.Type[AsyncToolRouterSession[TTool, TToolCollection]] = (
            AsyncToolRouterSessionWithMcp if mcp else AsyncToolRouterSession
        )
        return session_cls(
            client=self._client,
            provider=self._provider,
            dangerously_allow_auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            file_upload_dirs=self._file_upload_dirs,
            session_id=session.session_id,
            config=t.cast(ToolRouterSessionConfig, session.config),
            config_version=session.config_version,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
                mcp_requested=mcp,
            ),
            experimental=experimental_response,
            custom_tools_map=custom_tools_map,
            user_id=user_id,
            preload=_session_preload_config(session.config.preload),
            preloaded_custom_tool_slugs=preloaded_custom_tool_slugs,
            inline_custom_tools_payload=inline_custom_tools_payload,
        )

    async def delete(self, session_id: str) -> ToolRouterSessionDeleteResponse:
        """Delete a tool router session by ID."""
        return _delete_response(
            await self._client.tool_router.session.delete(session_id)
        )


class AsyncToolRouterSession(_LocalSessionTools, t.Generic[TTool, TToolCollection]):
    """An async session bound to one user, its provider tools and optional MCP endpoint."""

    def __init__(
        self,
        *,
        client: AsyncHttpClient,
        provider: t.Optional[BaseProvider[t.Any, t.Any]],
        dangerously_allow_auto_upload_download_files: bool,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_dirs: t.Union[t.Sequence[str], t.Literal[False], None] = None,
        session_id: str,
        mcp: t.Any,
        experimental: "AsyncToolRouterSessionExperimental",
        config: t.Optional[ToolRouterSessionConfig] = None,
        config_version: t.Optional[int] = None,
        custom_tools_map: t.Optional[CustomToolsMap] = None,
        user_id: t.Optional[str] = None,
        preload: t.Optional[ToolRouterSessionPreloadConfig] = None,
        preloaded_custom_tool_slugs: t.Optional[t.List[str]] = None,
        inline_custom_tools_payload: t.Optional[InlineCustomToolsWirePayload] = None,
    ) -> None:
        self._client = client
        self._provider = provider
        self._auto_upload_download_files = dangerously_allow_auto_upload_download_files
        self._sensitive_file_upload_protection = sensitive_file_upload_protection
        self._file_upload_path_deny_segments = file_upload_path_deny_segments
        self._file_upload_dirs = file_upload_dirs
        self.session_id = session_id
        self.preload = preload or ToolRouterSessionPreloadConfig(tools=[])
        self.config = config or t.cast(
            ToolRouterSessionConfig,
            session_create_response.Config.model_construct(
                user_id=user_id or "",
                execute=session_create_response.ConfigExecute(),
                search=session_create_response.ConfigSearch(),
                preload=session_create_response.ConfigPreload(tools=self.preload.tools),
                instant=False,
            ),
        )
        setattr(self, "mcp", mcp)
        self.experimental = experimental
        self.config_version = (
            config_version if isinstance(config_version, int) else None
        )
        self._custom_tools_map = custom_tools_map
        self._user_id = user_id
        self._preloaded_custom_tool_slugs = preloaded_custom_tool_slugs or []
        self._inline_custom_tools_payload = inline_custom_tools_payload

    def _tool_router_backend_execute(
        self, tools_model: t.Any, modifiers: t.Optional["Modifiers"] = None
    ) -> t.Callable[..., t.Any]:
        """Backend execute wrapper with this session's file-upload settings."""
        return tools_model._wrap_execute_tool_for_tool_router(
            session_id=self.session_id,
            modifiers=modifiers,
            inline_custom_tools_payload=self._inline_custom_tools_payload,
        )

    async def tools(self, modifiers: t.Optional["Modifiers"] = None) -> TToolCollection:
        """Get provider-wrapped tools for execution with your AI framework."""
        from composio.core.provider import (
            AgenticProvider,
            NonAgenticProvider,
            bind_execution_target,
        )

        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. Please initialize ToolRouter with a provider."
            )
        require_async_tool_execution(self._provider)
        tools_model = AsyncTools(
            client=self._client,
            provider=self._provider,
            dangerously_allow_auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            file_upload_dirs=self._file_upload_dirs,
            _bind_provider=False,
        )
        router_tools = await tools_model.get_raw_tool_router_meta_tools(
            session_id=self.session_id, modifiers=modifiers
        )
        router_tools = self._add_preloaded_custom_tools(router_tools, modifiers)
        for tool in router_tools:
            tool.input_parameters = (
                tools_model._file_helper.enhance_schema_descriptions(
                    schema=tool.input_parameters
                )
            )
        if issubclass(type(self._provider), NonAgenticProvider):
            return t.cast(
                TToolCollection,
                t.cast(
                    NonAgenticProvider[TTool, TToolCollection], self._provider
                ).wrap_tools(tools=router_tools),
            )
        if self._has_custom_tools():
            execute_fn = self._create_routing_execute_fn(tools_model, modifiers)
        else:
            execute_fn = self._tool_router_backend_execute(
                tools_model, modifiers=modifiers
            )
        return t.cast(
            TToolCollection,
            t.cast(AgenticProvider[TTool, TToolCollection], self._provider).wrap_tools(
                tools=router_tools,
                execute_tool=bind_execution_target(AsyncToolCallback(execute_fn), self),
            ),
        )

    def _create_routing_execute_fn(
        self, tools_model: t.Any, modifiers: t.Optional["Modifiers"]
    ) -> t.Callable[..., t.Any]:
        """Create an execute function that routes local/remote tools."""
        backend_execute = self._tool_router_backend_execute(
            tools_model, modifiers=modifiers
        )

        async def routing_execute(slug: str, arguments: t.Dict) -> t.Dict:
            if slug == COMPOSIO_MULTI_EXECUTE_TOOL:
                processed_arguments = arguments
                if modifiers is not None:
                    type_before: t.Literal["before_execute"] = "before_execute"
                    params: ToolExecuteParams = {"arguments": arguments}
                    modified = apply_modifier_by_type(
                        modifiers=modifiers,
                        toolkit="composio",
                        tool=slug,
                        type=type_before,
                        request=params,
                    )
                    processed_arguments = modified.get("arguments", arguments)
                result = await self._route_multi_execute(
                    processed_arguments, tools_model
                )
                if modifiers is not None:
                    type_after: t.Literal["after_execute"] = "after_execute"
                    result = t.cast(
                        t.Dict[str, t.Any],
                        apply_modifier_by_type(
                            modifiers=modifiers,
                            toolkit="composio",
                            tool=slug,
                            type=type_after,
                            response=t.cast(ToolExecutionResponse, result),
                        ),
                    )
                return result
            entry = find_custom_tool(self._custom_tools_map, slug)
            if entry:
                return t.cast(
                    t.Dict[str, t.Any], await self._run_local(entry, arguments)
                )
            assert_unambiguous_custom_tool_slug(self._custom_tools_map, slug)
            return await backend_execute(slug, arguments)

        return routing_execute

    async def _route_multi_execute(
        self, input_args: t.Dict[str, t.Any], tools_model: t.Any
    ) -> t.Dict[str, t.Any]:
        """Route a COMPOSIO_MULTI_EXECUTE_TOOL call."""
        tool_items = input_args.get("tools")
        if not isinstance(tool_items, list) or len(tool_items) == 0:
            return await self._tool_router_backend_execute(tools_model)(
                COMPOSIO_MULTI_EXECUTE_TOOL, input_args
            )
        parsed = [self._parse_tool_item(item) for item in tool_items]
        local_items: t.List[t.Tuple[int, CustomToolsMapEntry]] = []
        remote_indices: t.List[int] = []
        for i, p in enumerate(parsed):
            entry = find_custom_tool(self._custom_tools_map, p["tool_slug"])
            if entry:
                local_items.append((i, entry))
            else:
                assert_unambiguous_custom_tool_slug(
                    self._custom_tools_map, p["tool_slug"]
                )
                remote_indices.append(i)
        if not local_items:
            return await self._tool_router_backend_execute(tools_model)(
                COMPOSIO_MULTI_EXECUTE_TOOL, input_args
            )
        limit = asyncio.Semaphore(MAX_PARALLEL_WORKERS)

        async def local(
            idx: int, entry: CustomToolsMapEntry
        ) -> tuple[int, ToolExecutionResponse]:
            async with limit:
                return idx, await self._run_local(entry, parsed[idx]["arguments"])

        async def remote() -> tuple[dict[str, t.Any] | None, str | None]:
            if not remote_indices:
                return None, None
            async with limit:
                try:
                    execute = self._tool_router_backend_execute(tools_model)
                    payload = {
                        **input_args,
                        "tools": [tool_items[i] for i in remote_indices],
                    }
                    return await execute(COMPOSIO_MULTI_EXECUTE_TOOL, payload), None
                except exceptions.ToolInputRequiredError:
                    raise
                except Exception as error:
                    return None, str(error) or "Remote tool execution failed"

        # Let work already dispatched settle before surfacing an approval or failure.
        # Otherwise an immediate retry could overlap the first batch's local callbacks.
        local_tasks = [
            asyncio.create_task(local(idx, entry)) for idx, entry in local_items
        ]
        remote_task = asyncio.create_task(remote())
        await asyncio.gather(*local_tasks, remote_task, return_exceptions=True)
        local_results = [task.result() for task in local_tasks]
        remote_result, remote_error_message = remote_task.result()
        return _merge_multi_execute_results(
            parsed, local_results, remote_indices, remote_result, remote_error_message
        )

    async def authorize(
        self,
        toolkit: str,
        *,
        callback_url: t.Optional[str] = None,
        alias: t.Optional[str] = None,
        experimental: t.Optional[session_link_params.Experimental] = None,
    ) -> AsyncConnectionRequest:
        """Authorize a toolkit for the user and get a connection request."""
        try:
            response = await self._client.tool_router.session.link(
                session_id=self.session_id,
                toolkit=toolkit,
                callback_url=callback_url if callback_url else omit,
                alias=alias if alias is not None else omit,
                experimental=experimental if experimental is not None else omit,
            )
        except BadRequestError as error:
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise
        return AsyncConnectionRequest(
            id=response.connected_account_id,
            redirect_url=response.redirect_url,
            status="INITIATED",
            client=self._client,
        )

    async def toolkits(
        self,
        *,
        toolkits: t.Optional[t.List[str]] = None,
        next_cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
        is_connected: t.Optional[bool] = None,
        search: t.Optional[str] = None,
    ) -> ToolkitConnectionsDetails:
        """Get toolkit connection states for the session."""

        toolkits_params: t.Dict[str, t.Any] = {}
        if next_cursor is not None:
            toolkits_params["cursor"] = next_cursor
        if limit is not None:
            toolkits_params["limit"] = limit
        if toolkits is not None:
            toolkits_params["toolkits"] = toolkits
        if is_connected is not None:
            toolkits_params["is_connected"] = is_connected
        if search is not None:
            toolkits_params["search"] = search
        result = await self._client.tool_router.session.toolkits(
            session_id=self.session_id, **toolkits_params
        )
        return _toolkit_connections(result)

    async def search(
        self, *, query: str, model: t.Optional[str] = None
    ) -> ToolRouterSessionSearchResponse:
        """Search for tools by semantic use case."""
        return await self._client.tool_router.session.search(
            session_id=self.session_id,
            queries=[{"use_case": query}],
            model=model if model else omit,
            experimental=self._inline_custom_tools_payload
            if self._inline_custom_tools_payload is not None
            else omit,
        )

    async def execute(
        self,
        tool_slug: str,
        *,
        arguments: t.Optional[t.Dict[str, t.Any]] = None,
        account: t.Optional[str] = None,
        input_responses: t.Optional[t.Dict[str, ToolRouterInputResponse]] = None,
        request_state: t.Optional[str] = None,
    ) -> ToolRouterSessionExecuteResponse:
        """Execute a tool within the session."""
        entry = find_custom_tool(self._custom_tools_map, tool_slug)
        if entry and self._user_id:
            result = await self._run_local(entry, arguments or {})
            return ToolRouterSessionExecuteResponse(
                data=result["data"],
                error=result["error"],
                log_id="",
                result_type="completed" if result["successful"] else "failed",
            )
        assert_unambiguous_custom_tool_slug(self._custom_tools_map, tool_slug)
        return require_execute_result(
            await self._client.without_retries.tool_router.session.execute(
                session_id=self.session_id,
                tool_slug=tool_slug,
                arguments=arguments if arguments is not None else omit,
                account=account if account is not None else omit,
                input_responses=input_responses
                if input_responses is not None
                else omit,
                request_state=request_state if request_state is not None else omit,
                experimental=self._inline_custom_tools_payload
                if self._inline_custom_tools_payload is not None
                else omit,
            ),
            tool_slug,
        )

    async def execute_meta(
        self,
        slug: ToolRouterSessionMetaToolSlug,
        *,
        arguments: t.Optional[t.Dict[str, t.Any]] = None,
        input_responses: t.Optional[t.Dict[str, ToolRouterInputResponse]] = None,
        request_state: t.Optional[str] = None,
    ) -> ToolRouterSessionExecuteResponse:
        """Execute a Composio meta tool (``COMPOSIO_*``) within the session."""
        return require_execute_result(
            await self._client.without_retries.tool_router.session.execute_meta(
                session_id=self.session_id,
                slug=slug,
                arguments=arguments if arguments is not None else omit,
                input_responses=input_responses
                if input_responses is not None
                else omit,
                request_state=request_state if request_state is not None else omit,
                experimental=self._inline_custom_tools_payload
                if self._inline_custom_tools_payload is not None
                else omit,
            ),
            slug,
        )

    async def proxy_execute(
        self,
        *,
        toolkit: str,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        body: t.Any = None,
        parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
    ) -> ToolRouterSessionProxyExecuteResponse:
        """Proxy an API call through Composio's auth layer."""
        return await _async_proxy_execute(
            self._client,
            self.session_id,
            toolkit=toolkit,
            endpoint=endpoint,
            method=method,
            body=body,
            parameters=parameters,
        )

    async def update(
        self,
        *,
        toolkits: t.Union[t.Optional[session_patch_params.Toolkits], "Omit"] = omit,
        instant: t.Union[t.Literal[False], ToolRouterInstantConfig, "Omit"] = omit,
        tools: t.Union[
            t.Optional[t.Dict[str, session_patch_params.Tools]], "Omit"
        ] = omit,
        tags: t.Union[t.Optional[session_patch_params.Tags], "Omit"] = omit,
        auth_configs: t.Union[t.Optional[t.Dict[str, str]], "Omit"] = omit,
        connected_accounts: t.Union[
            t.Optional[t.Dict[str, SequenceNotStr[str]]], "Omit"
        ] = omit,
        manage_connections: t.Union[
            t.Optional[session_patch_params.ManageConnections],
            t.Optional[ToolRouterUpdateManageConnectionsConfig],
            "Omit",
        ] = omit,
        sandbox: t.Union[t.Optional[session_patch_params.Workbench], "Omit"] = omit,
        workbench: t.Union[t.Optional[session_patch_params.Workbench], "Omit"] = omit,
        multi_account: t.Union[
            t.Optional[session_patch_params.MultiAccount],
            t.Optional[ToolRouterUpdateMultiAccountConfig],
            "Omit",
        ] = omit,
        proxy_execute: t.Union[
            t.Optional[t.Union[bool, ToolRouterProxyExecuteConfig]], "Omit"
        ] = omit,
        hooks: t.Union[t.Optional[t.List[ToolRouterHook]], "Omit"] = omit,
        preload: t.Union[t.Optional[session_patch_params.Preload], "Omit"] = omit,
        search: t.Union[t.Optional[session_patch_params.Search], "Omit"] = omit,
        execute: t.Union[t.Optional[session_patch_params.Execute], "Omit"] = omit,
        experimental: t.Union[
            t.Optional[session_patch_params.Experimental],
            t.Optional[ToolRouterUpdateExperimentalConfig],
            "Omit",
        ] = omit,
        expected_config_version: t.Union[int, None, t.Literal[False]] = None,
    ) -> ToolRouterSessionConfig:
        """Partially update the session configuration."""
        from composio.core.models.tool_router import _session_preload_config

        if sandbox is not omit and workbench is not omit:
            raise exceptions.InvalidParams(
                "Pass either `sandbox` or `workbench`, not both. `workbench` is a backwards-compatible alias for `sandbox`."
            )
        if instant is None:
            raise exceptions.InvalidParams(
                "`instant` does not accept None; pass False to disable Instant usage, or omit it to keep the stored policy"
            )
        if (
            not isinstance(hooks, Omit)
            and isinstance(experimental, dict)
            and (experimental.get("session_config_id") is not None)
        ):
            raise exceptions.InvalidParams(
                "`hooks` cannot be combined with `experimental={'session_config_id': ...}`; a saved Session config sets the session's access policy, so apply hooks in a separate update"
            )
        precondition: t.Union[int, "Omit"]
        if expected_config_version is None or expected_config_version is False:
            precondition = omit
        elif isinstance(expected_config_version, bool) or expected_config_version < 1:
            raise exceptions.InvalidParams(
                "`expected_config_version` must be a positive integer, or False to send no precondition"
            )
        else:
            precondition = expected_config_version
        workbench_payload = sandbox if sandbox is not omit else workbench
        extra_body: t.Optional[t.Dict[str, t.Any]] = (
            None
            if isinstance(precondition, Omit)
            else {"expected_config_version": precondition}
        )
        try:
            response = await self._client.tool_router.session.patch(
                session_id=self.session_id,
                toolkits=t.cast(
                    t.Union[session_patch_params.Toolkits, "Omit"], toolkits
                ),
                tools=t.cast(
                    t.Union[t.Dict[str, session_patch_params.Tools], "Omit"], tools
                ),
                tags=t.cast(t.Union[session_patch_params.Tags, "Omit"], tags),
                instant=t.cast(
                    t.Union[
                        t.Literal[False],
                        session_patch_params.CurrentInstantVariant1,
                        "Omit",
                    ],
                    instant,
                ),
                auth_configs=t.cast(t.Union[t.Dict[str, str], "Omit"], auth_configs),
                connected_accounts=connected_accounts,
                manage_connections=t.cast(
                    t.Union[t.Optional[session_patch_params.ManageConnections], "Omit"],
                    manage_connections,
                ),
                workbench=workbench_payload,
                multi_account=t.cast(
                    t.Union[t.Optional[session_patch_params.MultiAccount], "Omit"],
                    multi_account,
                ),
                proxy_execute={"enable": proxy_execute}
                if isinstance(proxy_execute, bool)
                else proxy_execute,
                preload=t.cast(t.Union[session_patch_params.Preload, "Omit"], preload),
                search=t.cast(t.Union[session_patch_params.Search, "Omit"], search),
                execute=t.cast(t.Union[session_patch_params.Execute, "Omit"], execute),
                experimental=t.cast(
                    t.Union[t.Optional[session_patch_params.Experimental], "Omit"],
                    experimental,
                ),
                hooks=t.cast(
                    t.Union[
                        t.Optional[
                            t.Iterable[
                                t.Union[
                                    session_patch_params.CurrentHookVariant0,
                                    session_patch_params.CurrentHookVariant1,
                                ]
                            ]
                        ],
                        "Omit",
                    ],
                    hooks,
                ),
                extra_body=extra_body,
                request_options={"max_retries": 0},
            )
        except ConflictError as exc:
            if precondition is omit:
                message = f"Session {self.session_id} configuration changed while this update was in flight; re-fetch the session and retry the update"
            else:
                message = f"Session {self.session_id} configuration is no longer at version {precondition}; re-fetch the session and retry the update"
            raise exceptions.SessionConfigConflictError(
                message,
                session_id=self.session_id,
                expected_config_version=None
                if isinstance(precondition, Omit)
                else precondition,
            ) from exc
        self.config = t.cast(ToolRouterSessionConfig, response.config)
        self.config_version = response.config_version
        self.preload = _session_preload_config(response.config.preload)
        return self.config

    async def list_config_history(
        self,
        **query: te.Unpack[session_config_history_params.SessionConfigHistoryParams],
    ) -> session_config_history_response.SessionConfigHistoryResponse:
        """List the configuration history of this session, newest first."""
        return await self._client.tool_router.session.config_history(
            session_id=self.session_id, **query
        )

    async def delete(self) -> ToolRouterSessionDeleteResponse:
        """Delete this session."""
        return _delete_response(
            await self._client.tool_router.session.delete(self.session_id)
        )

    async def _run_local(
        self, entry: CustomToolsMapEntry, arguments: dict
    ) -> ToolExecutionResponse:
        if self._user_id is None:
            raise ValueError("A user is required for local tools")
        ctx = _WorkerSessionContext(self._user_id, self, self._custom_tools_map)
        return await asyncio.get_running_loop().run_in_executor(
            _callback_workers,
            contextvars.copy_context().run,
            execute_custom_tool,
            entry,
            arguments,
            ctx,
        )


class AsyncToolRouterSessionWithMcp(AsyncToolRouterSession[TTool, TToolCollection]):
    mcp: ToolRouterMCPServerConfig


class _WorkerSessionContext:
    """Keep the synchronous local-tool contract while dispatching remote I/O on the client loop."""

    def __init__(
        self,
        user_id: str,
        session: AsyncToolRouterSession,
        custom_tools_map: CustomToolsMap | None,
    ):
        self.user_id = user_id
        self._custom_tools_map = custom_tools_map
        self._remote = AsyncToolCallback(session.execute)
        self.proxy_execute = AsyncToolCallback(session.proxy_execute)

    def execute(
        self, tool_slug: str, arguments: dict[str, t.Any]
    ) -> ToolRouterSessionExecuteResponse:
        # Nested local tools run on this worker; a chain never waits for another pool slot.
        entry = find_custom_tool(self._custom_tools_map, tool_slug)
        if entry:
            result = execute_custom_tool(entry, arguments, self)
            return ToolRouterSessionExecuteResponse(
                data=result["data"],
                error=result["error"],
                log_id="",
                result_type="completed" if result["successful"] else "failed",
            )
        return self._remote(tool_slug, arguments=_serialize_arguments(arguments))


async def _async_proxy_execute(
    client: AsyncHttpClient,
    session_id: str,
    *,
    toolkit: str,
    endpoint: str,
    method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
    body: t.Any = None,
    parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
) -> ToolRouterSessionProxyExecuteResponse:
    """Shared proxy execute implementation used by SessionContextImpl and ToolRouterSession."""
    api_params = _proxy_parameters(
        toolkit=toolkit, endpoint=endpoint, method=method, parameters=parameters
    )
    subject = f"{method} proxy call for toolkit {toolkit}"
    raw = await client.without_retries.tool_router.session.proxy_execute(
        session_id=session_id,
        toolkit_slug=toolkit,
        endpoint=endpoint,
        method=method,
        body=body if body is not None else omit,
        parameters=api_params if api_params else omit,
    )
    return _proxy_result(raw, subject)
