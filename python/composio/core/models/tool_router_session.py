"""
ToolRouterSession class for managing a single tool router session.

Provides methods for tools, authorize, toolkits, search, execute, and files.
When custom tools are bound to the session, execution is routed: local tools
run in-process, remote tools are sent to the backend.
"""

from __future__ import annotations

import typing as t
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import typing_extensions as te
from composio_client import BadRequestError, ConflictError, Omit, omit
from composio_client._types import SequenceNotStr
from composio_client.types.tool_list_response import (
    ItemDeprecated,
    ItemDeprecatedToolkit,
    ItemToolkit,
)
from composio_client.types.tool_router import (
    session_attach_response,
    session_create_response,
    session_link_params,
    session_patch_params,
    session_patch_response,
    session_retrieve_response,
)
from composio_client.types.tool_router.session_execute_response import (
    SessionExecuteResponse,
)
from composio_client.types.tool_router.session_search_response import (
    SessionSearchResponse,
)

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    Tool,
    session_config_history_params,
    session_config_history_response,
)
from composio.core.models._modifiers import Modifiers, apply_modifier_by_type
from composio.core.models.connected_accounts import ConnectionRequest
from composio.core.models.custom_tool import (
    find_custom_tool_map_entry_by_final_slug,
    find_custom_tool_map_entry_by_toolkit_and_original_slug,
)
from composio.core.models.custom_tool_execution import (
    assert_unambiguous_custom_tool_slug,
    execute_custom_tool,
    find_custom_tool,
)
from composio.core.models.custom_tool_types import (
    CustomToolsMap,
    CustomToolsMapEntry,
    InlineCustomToolsWirePayload,
    ToolRouterSessionProxyExecuteResponse,
    RegisteredCustomTool,
    RegisteredCustomToolkit,
)
from composio.core.models.experimental import ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT
from composio.core.models.inline_custom_tools_payload import (
    inline_custom_tools_execute_experimental,
    inline_custom_tools_search_experimental,
)
from composio.core.models.session_context import (
    SessionContextImpl,
    proxy_execute_impl,
)
from composio.core.models.tool_router_session_delete import (
    ToolRouterSessionDeleteResponse,
    delete_tool_router_session,
)
from composio.core.models.tools import ToolExecuteParams, ToolExecutionResponse
from composio.core.provider import TTool, TToolCollection
from composio.core.provider.base import BaseProvider

if t.TYPE_CHECKING:
    from composio.core.models.tool_router import (
        ToolkitConnectionsDetails,
        ToolRouterMCPServerConfig,
        ToolRouterSessionExperimental,
    )

COMPOSIO_MULTI_EXECUTE_TOOL = "COMPOSIO_MULTI_EXECUTE_TOOL"
DIRECT_CUSTOM_TOOL_DESCRIPTION_PREFIX = (
    "[Direct tool - call directly, no search needed beforehand.]"
)
MAX_PARALLEL_WORKERS = 5


@dataclass
class ToolRouterSessionPreloadConfig:
    """Preloaded tools configured for a tool router session."""

    tools: t.Union[t.List[str], t.Literal["all"]]


#: Server-side session configuration as returned by the API: toolkit and tool
#: allowlists, tags, auth configs, connected accounts, ``manage_connections``,
#: preload, sandbox (``workbench``), search and execute settings. The four
#: generated response models carry the same fields.
ToolRouterSessionConfig = t.Union[
    session_create_response.Config,
    session_retrieve_response.Config,
    session_attach_response.Config,
    session_patch_response.Config,
]


class ToolRouterPremiumUsageEnable(te.TypedDict):
    enable: t.List[str]


class ToolRouterPremiumUsageDisable(te.TypedDict):
    disable: t.List[str]


class ToolRouterPremiumUsageConfig(te.TypedDict, total=False):
    """Experimental premium usage policy for a Session."""

    toolkits: t.Union[ToolRouterPremiumUsageEnable, ToolRouterPremiumUsageDisable]
    tools: t.Dict[
        str, t.Union[ToolRouterPremiumUsageEnable, ToolRouterPremiumUsageDisable]
    ]
    return_premium_charge: bool


class ToolRouterUpdateManageConnectionsConfig(te.TypedDict, total=False):
    """``manage_connections`` shape accepted by :meth:`ToolRouterSession.update`.

    Only the supplied subfields travel. Unlike the create-time config,
    ``callback_url=None`` removes the stored callback URL while leaving the
    sibling connection settings untouched.
    """

    enable: t.Optional[bool]
    callback_url: t.Optional[str]
    enable_connection_removal: t.Optional[bool]
    enable_wait_for_connections: t.Optional[bool]


class ToolRouterUpdateMultiAccountConfig(te.TypedDict, total=False):
    """``multi_account`` shape accepted by :meth:`ToolRouterSession.update`.

    ``max_accounts_per_toolkit=None`` removes the stored maximum so the
    default applies again.
    """

    enable: bool
    max_accounts_per_toolkit: t.Optional[int]
    require_explicit_selection: bool


class ToolRouterUpdateExperimentalConfig(te.TypedDict, total=False):
    """``experimental`` shape accepted by :meth:`ToolRouterSession.update`.

    Each leaf follows the PATCH contract: omit to keep the stored value,
    ``None`` to remove it, a value to replace it.
    """

    permissions: t.Optional[t.Dict[str, t.Any]]
    link_url_overwrite: t.Optional[str]
    fast_mode: t.Optional[bool]
    submit_feedback: t.Optional[t.Dict[str, bool]]
    session_config_id: str


class ToolRouterSession(t.Generic[TTool, TToolCollection]):
    """
    A Composio session — the object returned by ``composio.create(...)`` /
    ``composio.use(...)``. Use it to fetch session-scoped tools, authorize
    toolkits, search, and execute tools.

    Generic Parameters:
        TTool: The individual tool type returned by the provider.
        TToolCollection: The collection type returned by tools().

    The hosted MCP endpoint (``session.mcp``) exists at runtime on every
    session, but is only surfaced in the type when you opt in with
    ``create(..., mcp=True)`` / ``use(..., mcp=True)``, which returns a
    :class:`ToolRouterSessionWithMcp`. By default agents use native tools via
    :meth:`tools`. See https://docs.composio.dev/docs/sessions-via-mcp

    Attributes:
        session_id: Unique session identifier
        config: Server-side session configuration as returned by the API,
                refreshed in place by :meth:`update`
        experimental: Experimental features (files, assistive prompt, etc.)
    """

    #: Unique session identifier.
    session_id: str
    #: Server-side session configuration (toolkit/tool allowlists, tags,
    #: preload, sandbox, manage_connections) as returned by the API. Refreshed
    #: in place by :meth:`update`.
    config: ToolRouterSessionConfig
    #: Experimental capabilities available on this session.
    experimental: "ToolRouterSessionExperimental"
    #: Version of the server-side configuration this object last observed.
    #: Refreshed in place by :meth:`update`. Pass it as ``expected_config_version``
    #: to make an update conditional.
    config_version: t.Optional[int]

    def __init__(
        self,
        *,
        client: HttpClient,
        provider: t.Optional[BaseProvider[t.Any, t.Any]],
        dangerously_allow_auto_upload_download_files: bool,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
        file_upload_dirs: t.Union[t.Sequence[str], t.Literal[False], None] = None,
        session_id: str,
        mcp: t.Any,
        experimental: "ToolRouterSessionExperimental",
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
        # Sessions built from an API response always carry their config; the
        # fallback only covers direct construction without one (tests).
        self.config = config or session_create_response.Config(
            user_id=user_id or "",
            execute=session_create_response.ConfigExecute(),
            search=session_create_response.ConfigSearch(),
            preload=session_create_response.ConfigPreload(tools=self.preload.tools),
            premium_usage=False,
        )
        # The MCP endpoint exists on every session at runtime (kept for
        # backwards compatibility), but is only typed via
        # ToolRouterSessionWithMcp. Assign through setattr so type checkers do
        # not surface `mcp` on the base class — MCP is an explicit opt-in.
        setattr(self, "mcp", mcp)
        self.experimental = experimental
        self.config_version = (
            config_version if isinstance(config_version, int) else None
        )
        self._custom_tools_map = custom_tools_map
        self._user_id = user_id
        self._preloaded_custom_tool_slugs = preloaded_custom_tool_slugs or []
        self._inline_custom_tools_payload = inline_custom_tools_payload

        # Create singleton session context if custom tools are bound
        self._session_context: t.Optional[SessionContextImpl] = None
        if custom_tools_map and user_id:
            self._session_context = SessionContextImpl(
                client=client,
                user_id=user_id,
                session_id=session_id,
                custom_tools_map=custom_tools_map,
                inline_custom_tools_payload=inline_custom_tools_payload,
            )

    def _has_custom_tools(self) -> bool:
        """Check if this session has any custom tools bound."""
        if self._custom_tools_map is None:
            return False
        return len(self._custom_tools_map.by_final_slug) > 0

    def _tool_router_backend_execute(
        self,
        tools_model: t.Any,
        modifiers: t.Optional["Modifiers"] = None,
    ) -> t.Callable[..., t.Any]:
        """Backend execute wrapper with this session's file-upload settings."""
        return tools_model._wrap_execute_tool_for_tool_router(
            session_id=self.session_id,
            modifiers=modifiers,
            inline_custom_tools_payload=self._inline_custom_tools_payload,
        )

    def tools(self, modifiers: t.Optional["Modifiers"] = None) -> TToolCollection:
        """
        Get provider-wrapped tools for execution with your AI framework.

        Returns tools configured for this session, wrapped in the format expected
        by your AI provider (OpenAI, Anthropic, LangChain, etc.).

        When custom tools are bound to the session, execution of
        COMPOSIO_MULTI_EXECUTE_TOOL is intercepted: local tools are executed
        in-process, remote tools are sent to the backend.
        """
        from composio.core.models.tools import Tools as ToolsModel
        from composio.core.provider import AgenticProvider, NonAgenticProvider

        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. "
                "Please initialize ToolRouter with a provider."
            )

        tools_model = ToolsModel(
            client=self._client,
            provider=self._provider,
            dangerously_allow_auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            file_upload_dirs=self._file_upload_dirs,
        )

        router_tools = tools_model.get_raw_tool_router_meta_tools(
            session_id=self.session_id,
            modifiers=modifiers,
        )
        router_tools = self._add_preloaded_custom_tools(router_tools, modifiers)

        for tool in router_tools:
            tool.input_parameters = (
                tools_model._file_helper.enhance_schema_descriptions(
                    schema=tool.input_parameters,
                )
            )

        if issubclass(type(self._provider), NonAgenticProvider):
            return t.cast(
                TToolCollection,
                t.cast(
                    NonAgenticProvider[TTool, TToolCollection], self._provider
                ).wrap_tools(tools=router_tools),
            )

        # For agentic providers: if custom tools are bound, create a routing
        # execute function that intercepts COMPOSIO_MULTI_EXECUTE_TOOL
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
                execute_tool=execute_fn,
            ),
        )

    def _add_preloaded_custom_tools(
        self,
        tools: t.List[Tool],
        modifiers: t.Optional["Modifiers"],
    ) -> t.List[Tool]:
        custom_tools = self._get_preloaded_custom_tool_schemas(modifiers)
        if not custom_tools:
            return tools

        existing_slugs = {tool.slug.upper() for tool in tools}
        appended_tools = [
            tool for tool in custom_tools if tool.slug.upper() not in existing_slugs
        ]
        if not appended_tools:
            return tools

        return [*tools, *appended_tools]

    def _get_preloaded_custom_tool_schemas(
        self,
        modifiers: t.Optional["Modifiers"],
    ) -> t.List[Tool]:
        if not self._custom_tools_map or not self._preloaded_custom_tool_slugs:
            return []

        tools: t.List[Tool] = []
        for slug in self._preloaded_custom_tool_slugs:
            entry = find_custom_tool_map_entry_by_final_slug(
                self._custom_tools_map,
                slug,
            )
            if entry is None:
                continue

            tool = self._custom_tool_entry_to_tool(entry)
            if modifiers is not None:
                tool = t.cast(
                    Tool,
                    apply_modifier_by_type(
                        modifiers=modifiers,
                        toolkit=tool.toolkit.slug,
                        tool=tool.slug,
                        type="schema",
                        schema=tool,
                    ),
                )
            tools.append(tool)

        return tools

    def _custom_tool_entry_to_tool(self, entry: CustomToolsMapEntry) -> Tool:
        toolkit_slug = entry.toolkit or "custom"
        toolkit_name = (
            self._custom_toolkit_name(toolkit_slug) or entry.toolkit or "Custom"
        )

        return Tool(
            available_versions=[],
            deprecated=ItemDeprecated(
                available_versions=[],
                displayName=entry.handle.name,
                is_deprecated=False,
                toolkit=ItemDeprecatedToolkit(logo=""),
                version="latest",
            ),
            description=(
                f"{DIRECT_CUSTOM_TOOL_DESCRIPTION_PREFIX}\n{entry.handle.description}"
            ),
            input_parameters=entry.handle.input_schema,
            is_deprecated=False,
            name=entry.handle.name,
            no_auth=entry.handle.extends_toolkit is None,
            output_parameters=entry.handle.output_schema or {},
            scopes=[],
            slug=entry.final_slug,
            tags=[],
            toolkit=ItemToolkit(logo="", name=toolkit_name, slug=toolkit_slug),
            version="latest",
        )

    def _custom_toolkit_name(self, toolkit_slug: str) -> t.Optional[str]:
        if self._custom_tools_map is None:
            return None

        for toolkit in self._custom_tools_map.toolkits or []:
            if toolkit.slug.lower() == toolkit_slug.lower():
                return toolkit.name
        return None

    def _create_routing_execute_fn(
        self,
        tools_model: t.Any,
        modifiers: t.Optional["Modifiers"],
    ) -> t.Callable[..., t.Any]:
        """Create an execute function that routes local/remote tools.

        Applies before_execute/after_execute modifiers around the overall
        COMPOSIO_MULTI_EXECUTE_TOOL call, consistent with the standard path.
        """
        backend_execute = self._tool_router_backend_execute(
            tools_model, modifiers=modifiers
        )

        def routing_execute(slug: str, arguments: t.Dict) -> t.Dict:
            if slug == COMPOSIO_MULTI_EXECUTE_TOOL:
                # Apply before_execute modifiers
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

                result = self._route_multi_execute(processed_arguments, tools_model)

                # Apply after_execute modifiers
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
                    t.Dict[str, t.Any],
                    execute_custom_tool(
                        entry,
                        arguments,
                        t.cast(SessionContextImpl, self._session_context),
                    ),
                )
            assert_unambiguous_custom_tool_slug(self._custom_tools_map, slug)
            # Non-multi-execute meta tools always go to backend
            return backend_execute(slug, arguments)

        return routing_execute

    def _parse_tool_item(self, item: t.Any) -> t.Dict[str, t.Any]:
        """Parse an individual tool item from COMPOSIO_MULTI_EXECUTE_TOOL's tools array."""
        if not isinstance(item, dict):
            return {"tool_slug": "", "arguments": {}}
        return {
            "tool_slug": str(item.get("tool_slug", "")),
            "arguments": item.get("arguments", {}),
        }

    def _route_multi_execute(
        self,
        input_args: t.Dict[str, t.Any],
        tools_model: t.Any,
    ) -> t.Dict[str, t.Any]:
        """Route a COMPOSIO_MULTI_EXECUTE_TOOL call.

        Splits the tools[] array into local and remote, executes each
        appropriately, and merges results in the original request order.

        Modifiers are NOT applied here — the caller (routing_execute)
        handles before_execute/after_execute to avoid double application.
        """
        tool_items = input_args.get("tools")
        if not isinstance(tool_items, list) or len(tool_items) == 0:
            # Fallback: send to backend as-is (no modifiers — caller handles them)
            return self._tool_router_backend_execute(tools_model)(
                COMPOSIO_MULTI_EXECUTE_TOOL,
                input_args,
            )

        parsed = [self._parse_tool_item(item) for item in tool_items]

        # Partition into local (with resolved entry) and remote
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

        # All remote — just forward entire payload (no modifiers — caller handles them)
        if not local_items:
            return self._tool_router_backend_execute(tools_model)(
                COMPOSIO_MULTI_EXECUTE_TOOL,
                input_args,
            )

        ctx = self._session_context
        assert ctx is not None

        # Determine worker count (capped at MAX_PARALLEL_WORKERS)
        num_tasks = len(local_items) + (1 if remote_indices else 0)
        num_workers = min(MAX_PARALLEL_WORKERS, num_tasks)

        with ThreadPoolExecutor(max_workers=num_workers) as pool:
            # Submit local tool executions
            local_futures = []
            for idx, entry in local_items:
                future = pool.submit(
                    execute_custom_tool,
                    entry,
                    parsed[idx]["arguments"],
                    ctx,
                )
                local_futures.append((idx, future))

            # Submit remote batch (single call) if any
            # No modifiers here — the outer routing_execute handles them
            remote_future = None
            if remote_indices:
                remote_tool_items = [tool_items[i] for i in remote_indices]
                remote_input = {**input_args, "tools": remote_tool_items}
                execute_fn = self._tool_router_backend_execute(tools_model)
                remote_future = pool.submit(
                    execute_fn,
                    COMPOSIO_MULTI_EXECUTE_TOOL,
                    remote_input,
                )

            # Gather local results
            local_results: t.List[t.Tuple[int, ToolExecutionResponse]] = []
            for idx, future in local_futures:
                local_results.append((idx, future.result()))

            # Gather remote result. A transport failure (exception from the
            # backend call) must not discard completed local results, so it
            # is captured here and surfaced as per-tool failures below
            # (matches TS).
            remote_result: t.Optional[t.Dict[str, t.Any]] = None
            remote_error_message: t.Optional[str] = None
            if remote_future:
                try:
                    remote_result = remote_future.result()
                except Exception as error:
                    remote_error_message = str(error) or "Remote tool execution failed"

        # If only one local tool and no remote, return unwrapped
        if not remote_indices and len(local_results) == 1:
            return t.cast(t.Dict[str, t.Any], local_results[0][1])

        # Build local result entries matching backend format
        local_entries = []
        for idx, result in local_results:
            local_entry: t.Dict[str, t.Any] = {
                "response": {
                    "successful": result["successful"],
                    "data": result["data"],
                },
                "tool_slug": parsed[idx]["tool_slug"],
                "index": idx,
            }
            if result.get("error"):
                local_entry["response"]["error"] = result["error"]
                local_entry["error"] = result["error"]
            local_entries.append(local_entry)

        # Restore original request order, then re-index sequentially.
        remote_data_raw = (remote_result or {}).get("data")
        remote_data = remote_data_raw if isinstance(remote_data_raw, dict) else {}
        remote_results_list: t.List[t.Dict[str, t.Any]]
        if remote_error_message is not None:
            remote_results_list = [
                {
                    "response": {
                        "successful": False,
                        "data": {},
                        "error": remote_error_message,
                    },
                    "tool_slug": parsed[index]["tool_slug"],
                    "error": remote_error_message,
                }
                for index in remote_indices
            ]
        else:
            remote_results_list = (
                remote_data.get("results", [])
                if isinstance(remote_data.get("results"), list)
                else []
            )
        merged_results = [
            {
                **entry,
                "index": remote_indices[position]
                if position < len(remote_indices)
                else position,
            }
            for position, entry in enumerate(remote_results_list)
        ]
        merged_results.extend(local_entries)
        merged_results.sort(key=lambda entry: int(entry["index"]))
        all_results = [{**entry, "index": i} for i, entry in enumerate(merged_results)]
        failed = sum(1 for r in all_results if r.get("error"))
        merged_data = {**remote_data, "results": all_results}
        if local_entries and (
            remote_error_message is not None
            or any(
                key in remote_data
                for key in ("total_count", "success_count", "error_count")
            )
        ):
            merged_data["total_count"] = len(all_results)
            merged_data["success_count"] = len(all_results) - failed
            merged_data["error_count"] = failed

        remote_error = remote_error_message
        if remote_error is None and remote_result:
            raw_remote_error = remote_result.get("error")
            remote_error = (
                str(raw_remote_error) if raw_remote_error is not None else None
            )
        has_any_error = any(r.get("error") for _, r in local_results) or bool(
            remote_error
        )
        error_message = None
        if has_any_error:
            error_message = (
                remote_error
                if remote_error is not None and failed == 0
                else f"{failed} out of {len(all_results)} tools failed"
            )

        return {
            "data": merged_data,
            "error": error_message,
            "successful": not has_any_error,
        }

    def authorize(
        self,
        toolkit: str,
        *,
        callback_url: t.Optional[str] = None,
        alias: t.Optional[str] = None,
        experimental: t.Optional[session_link_params.Experimental] = None,
    ) -> ConnectionRequest:
        """
        Authorize a toolkit for the user and get a connection request.

        Initiates the OAuth flow and returns a ConnectionRequest with redirect URL.

        :param alias: Human-readable alias for the connection. Must be unique
            per userId and toolkit within the project.
        :param experimental: Experimental options for this connection. Pass an
            ``Experimental`` dict with ``account_type`` and/or
            ``acl_config_for_shared`` to create a SHARED connection with a
            per-user ACL. Experimental — shape may change in future releases.
        """
        try:
            response = self._client.tool_router.session.link(
                session_id=self.session_id,
                toolkit=toolkit,
                callback_url=callback_url if callback_url else omit,
                alias=alias if alias is not None else omit,
                experimental=experimental if experimental is not None else omit,
            )
        except BadRequestError as error:
            # The server rejects ACL on PRIVATE connections — surface that
            # as a typed error mirroring ``composio.connected_accounts.link()``.
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise

        return ConnectionRequest(
            id=response.connected_account_id,
            redirect_url=response.redirect_url,
            status="INITIATED",
            client=self._client,
        )

    def toolkits(
        self,
        *,
        toolkits: t.Optional[t.List[str]] = None,
        next_cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
        is_connected: t.Optional[bool] = None,
        search: t.Optional[str] = None,
    ) -> ToolkitConnectionsDetails:
        """
        Get toolkit connection states for the session.
        """
        from composio.core.models.tool_router import (
            ToolkitConnectedAccount,
            ToolkitConnection,
            ToolkitConnectionAuthConfig,
            ToolkitConnectionsDetails,
            ToolkitConnectionState,
        )

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

        result = self._client.tool_router.session.toolkits(
            session_id=self.session_id,
            **toolkits_params,
        )

        toolkit_states: t.List[ToolkitConnectionState] = []
        for item in result.items:
            connected_account = item.connected_account
            auth_config: t.Optional[ToolkitConnectionAuthConfig] = None
            connected_acc: t.Optional[ToolkitConnectedAccount] = None

            if connected_account:
                if connected_account.auth_config:
                    auth_config = ToolkitConnectionAuthConfig(
                        id=connected_account.auth_config.id,
                        mode=connected_account.auth_config.auth_scheme,
                        is_composio_managed=connected_account.auth_config.is_composio_managed,
                    )
                connected_acc = ToolkitConnectedAccount(
                    id=connected_account.id,
                    status=connected_account.status,
                )

            connection = (
                None
                if item.is_no_auth
                else ToolkitConnection(
                    is_active=(
                        connected_account.status == "ACTIVE"
                        if connected_account
                        else False
                    ),
                    auth_config=auth_config,
                    connected_account=connected_acc,
                )
            )

            toolkit_state = ToolkitConnectionState(
                slug=item.slug,
                name=item.name,
                logo=item.meta.logo if item.meta else None,
                is_no_auth=item.is_no_auth if item.is_no_auth else False,
                connection=connection,
            )
            toolkit_states.append(toolkit_state)

        return ToolkitConnectionsDetails(
            items=toolkit_states,
            next_cursor=result.next_cursor,
            total_pages=int(result.total_pages),
        )

    def search(
        self,
        *,
        query: str,
        model: t.Optional[str] = None,
    ) -> SessionSearchResponse:
        """
        Search for tools by semantic use case.

        Returns relevant tools for the given query with schemas and guidance.
        """
        return self._client.tool_router.session.search(
            session_id=self.session_id,
            queries=[{"use_case": query}],
            model=model if model else omit,
            experimental=inline_custom_tools_search_experimental(
                self._inline_custom_tools_payload
            ),
        )

    def execute(
        self,
        tool_slug: str,
        *,
        arguments: t.Optional[t.Dict[str, t.Any]] = None,
        account: t.Optional[str] = None,
    ) -> SessionExecuteResponse:
        """
        Execute a tool within the session.

        For custom tools, accepts the full slug (e.g. "LOCAL_GREP") or the
        original slug (e.g. "GREP") when that original slug is unique across
        the session's custom tools and toolkits. Custom tools are executed
        in-process; remote tools are sent to the Composio backend.

        :param account: Account ID or alias for direct app tool execution in
            multi-account sessions. Helper/meta tools either ignore this
            top-level field or define their own account-selection fields.

        Both paths return a ``SessionExecuteResponse`` with ``data``,
        ``error``, and ``log_id`` attributes.
        """
        from composio_client.types.tool_router.session_execute_response import (
            SessionExecuteResponse,
        )

        # Check if this is a local tool (by original or final slug)
        entry = find_custom_tool(self._custom_tools_map, tool_slug)
        if entry and self._session_context:
            result = execute_custom_tool(entry, arguments or {}, self._session_context)
            return SessionExecuteResponse(
                data=result["data"],
                error=result["error"],
                log_id="",
            )

        assert_unambiguous_custom_tool_slug(self._custom_tools_map, tool_slug)

        return self._client.tool_router.session.execute(
            session_id=self.session_id,
            tool_slug=tool_slug,
            arguments=arguments if arguments is not None else omit,
            account=account if account is not None else omit,
            experimental=inline_custom_tools_execute_experimental(
                self._inline_custom_tools_payload
            ),
        )

    def custom_tools(
        self, *, toolkit: t.Optional[str] = None
    ) -> t.List[RegisteredCustomTool]:
        """List all custom tools registered in this session.

        Returns tools with their final slugs, schemas, and resolved toolkit.

        :param toolkit: Filter by toolkit slug (e.g. 'gmail', 'DEV_TOOLS')
        :returns: Array of registered custom tools
        """
        if not self._custom_tools_map:
            return []

        entries = list(self._custom_tools_map.by_final_slug.values())
        if toolkit:
            entries = [
                e for e in entries if e.toolkit and e.toolkit.lower() == toolkit.lower()
            ]

        return [
            RegisteredCustomTool(
                slug=entry.final_slug,
                name=entry.handle.name,
                description=entry.handle.description,
                toolkit=entry.toolkit,
                input_schema=entry.handle.input_schema,
                output_schema=entry.handle.output_schema,
            )
            for entry in entries
        ]

    def custom_toolkits(self) -> t.List[RegisteredCustomToolkit]:
        """List all custom toolkits registered in this session.

        Returns toolkits with their tools showing final slugs.
        """
        if not self._custom_tools_map or not self._custom_tools_map.toolkits:
            return []

        result = []
        for tk in self._custom_tools_map.toolkits:
            tools = []
            for tool in tk.tools:
                entry = find_custom_tool_map_entry_by_toolkit_and_original_slug(
                    self._custom_tools_map, tk.slug, tool.slug
                )
                if entry is None:
                    # Only trust a bare alias that belongs to this toolkit.
                    bare = self._custom_tools_map.by_original_slug.get(
                        tool.slug.upper()
                    )
                    if (
                        bare is not None
                        and bare.toolkit is not None
                        and bare.toolkit.lower() == tk.slug.lower()
                    ):
                        entry = bare
                tools.append(
                    RegisteredCustomTool(
                        slug=entry.final_slug if entry else tool.slug,
                        name=tool.name,
                        description=tool.description,
                        toolkit=tk.slug,
                        input_schema=tool.input_schema,
                        output_schema=tool.output_schema,
                    )
                )
            result.append(
                RegisteredCustomToolkit(
                    slug=tk.slug,
                    name=tk.name,
                    description=tk.description,
                    tools=tools,
                )
            )
        return result

    def proxy_execute(
        self,
        *,
        toolkit: str,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        body: t.Any = None,
        parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
    ) -> ToolRouterSessionProxyExecuteResponse:
        """Proxy an API call through Composio's auth layer.

        :param toolkit: Composio toolkit slug (e.g. 'gmail', 'github')
        :param endpoint: API endpoint URL
        :param method: HTTP method
        :param body: Request body (for POST, PUT, PATCH)
        :param parameters: Query/header parameters
        :returns: Proxied API response
        """
        return proxy_execute_impl(
            self._client,
            self.session_id,
            toolkit=toolkit,
            endpoint=endpoint,
            method=method,
            body=body,
            parameters=parameters,
        )

    def update(
        self,
        *,
        toolkits: t.Union[t.Optional[session_patch_params.Toolkits], "Omit"] = omit,
        premium_usage: t.Union[
            t.Literal[False], ToolRouterPremiumUsageConfig, "Omit"
        ] = omit,
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
        """Partially update the session configuration.

        Only the fields provided are changed; omitted fields are preserved.
        For each policy block ``None`` removes the stored override (which can
        increase access: ``toolkits=None`` restores the unrestricted default,
        while ``toolkits={"enable": []}`` denies every app toolkit and is sent
        as-is). Supplied ``tools``, ``auth_configs`` and ``connected_accounts``
        maps replace the stored map entirely. Inside ``manage_connections``,
        ``callback_url=None`` removes only the stored callback URL.
        Experimental ``premium_usage`` accepts ``False`` to disable billed
        access or an object to set its filters; it does not accept ``None``.
        Any object, even one that only sets ``return_premium_charge``,
        re-enables premium usage on a Session set to ``False``.

        By default the request carries no precondition: the last writer wins.
        Pass ``expected_config_version`` (for example this object's
        ``config_version``) to make the update conditional: the API then
        applies it only when the stored version still matches, and a concurrent
        change raises :class:`~composio.exceptions.SessionConfigConflictError`
        (HTTP 409) instead of being overwritten. The API must support the
        ``expected_config_version`` field; otherwise it rejects the request with
        a 400. ``expected_config_version=False`` is the same as omitting it.
        The PATCH is never retried by the transport, so a 409 is reported
        exactly once. On conflict this object stays unchanged: re-fetch the
        session with ``composio.sessions.use(session_id)`` and retry against
        the fresh ``config_version``.

        ``config``, ``config_version`` and ``preload`` are refreshed in place
        only after a successful response, and the updated ``config`` is
        returned.

        ``workbench`` is a backwards-compatible alias for ``sandbox``. Prefer
        ``sandbox`` in new code.

        All other parameters use the same types as the generated
        ``client.tool_router.session.patch()`` method.
        """
        from composio.core.models.tool_router import _session_preload_config

        if sandbox is not omit and workbench is not omit:
            raise exceptions.InvalidParams(
                "Pass either `sandbox` or `workbench`, not both. "
                "`workbench` is a backwards-compatible alias for `sandbox`."
            )
        if premium_usage is None:
            raise exceptions.InvalidParams(
                "`premium_usage` does not accept None; pass False to disable "
                "premium usage, or omit it to keep the stored policy"
            )

        precondition: t.Union[int, "Omit"]
        if expected_config_version is None or expected_config_version is False:
            precondition = omit
        elif isinstance(expected_config_version, bool) or expected_config_version < 1:
            raise exceptions.InvalidParams(
                "`expected_config_version` must be a positive integer, or False to "
                "send no precondition"
            )
        else:
            precondition = expected_config_version

        workbench_payload = sandbox if sandbox is not omit else workbench

        # The generated client has no typed parameter for the precondition, so
        # it travels as an extra root body field.
        extra_body = (
            None
            if isinstance(precondition, Omit)
            else {"expected_config_version": precondition}
        )

        # The generated client does not type ``None`` for every policy block
        # although the API accepts it (it removes the stored override), nor the
        # subfield removals inside ``manage_connections``, ``multi_account`` and
        # ``experimental``; the values are serialized as-is.
        try:
            response = self._client.tool_router.session.patch(
                session_id=self.session_id,
                toolkits=t.cast(
                    t.Union[session_patch_params.Toolkits, "Omit"], toolkits
                ),
                tools=t.cast(
                    t.Union[t.Dict[str, session_patch_params.Tools], "Omit"], tools
                ),
                tags=t.cast(t.Union[session_patch_params.Tags, "Omit"], tags),
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
                preload=t.cast(t.Union[session_patch_params.Preload, "Omit"], preload),
                search=t.cast(t.Union[session_patch_params.Search, "Omit"], search),
                execute=t.cast(t.Union[session_patch_params.Execute, "Omit"], execute),
                experimental=t.cast(
                    t.Union[t.Optional[session_patch_params.Experimental], "Omit"],
                    experimental,
                ),
                premium_usage=t.cast(
                    t.Union[
                        t.Literal[False],
                        session_patch_params.CurrentPremiumUsageVariant1,
                        "Omit",
                    ],
                    premium_usage,
                ),
                extra_body=extra_body,
                # A stale precondition is a deterministic 409: never retry it.
                request_options={"max_retries": 0},
            )
        except ConflictError as exc:
            if precondition is omit:
                message = (
                    f"Session {self.session_id} configuration changed while this "
                    "update was in flight; re-fetch the session and retry the update"
                )
            else:
                message = (
                    f"Session {self.session_id} configuration is no longer at "
                    f"version {precondition}; re-fetch the session and retry the update"
                )
            raise exceptions.SessionConfigConflictError(
                message,
                session_id=self.session_id,
                expected_config_version=(
                    None if isinstance(precondition, Omit) else precondition
                ),
            ) from exc
        self.config = response.config
        self.config_version = response.config_version
        self.preload = _session_preload_config(response.config.preload)
        return self.config

    def list_config_history(
        self,
        **query: te.Unpack[session_config_history_params.SessionConfigHistoryParams],
    ) -> session_config_history_response.SessionConfigHistoryResponse:
        """
        List the configuration history of this session, newest first.

        Every ``update()`` records a new config version; this returns those
        versions with cursor-based pagination.

        :param cursor: Pagination cursor from a previous response.
        :param limit: Number of items per page (max 100).
        :return: The config versions under ``.items`` plus pagination fields.

        Example:
            history = session.list_config_history(limit=10)
            for entry in history.items:
                print(entry.version, entry.is_current)
        """
        return self._client.tool_router.session.config_history(
            session_id=self.session_id,
            **query,
        )

    def delete(self) -> ToolRouterSessionDeleteResponse:
        """
        Delete this session.

        Deleted sessions immediately stop being retrievable or executable. An
        already-deleted session surfaces the backend 404.
        """
        return delete_tool_router_session(self._client, self.session_id)


class ToolRouterSessionWithMcp(ToolRouterSession[TTool, TToolCollection]):
    """A :class:`ToolRouterSession` whose hosted MCP endpoint is exposed.

    Returned by ``create(..., mcp=True)`` / ``use(..., mcp=True)``. The ``mcp``
    attribute is populated by the base ``__init__`` at runtime; this subclass
    only surfaces it in the type. See
    https://docs.composio.dev/docs/sessions-via-mcp
    """

    #: Hosted MCP server configuration (url + auth headers) for this session.
    #: This is the recommended MCP path, gated behind ``mcp=True``.
    #: See https://docs.composio.dev/docs/sessions-via-mcp
    mcp: "ToolRouterMCPServerConfig"
