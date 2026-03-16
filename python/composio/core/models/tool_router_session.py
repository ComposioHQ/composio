"""
ToolRouterSession class for managing a single tool router session.

Provides methods for tools, authorize, toolkits, search, execute, and files.
"""

from __future__ import annotations

import typing as t

from composio_client import omit

from composio.client import HttpClient
from composio.core.models.connected_accounts import ConnectionRequest
from composio.core.provider import TTool, TToolCollection
from composio.core.provider.base import BaseProvider

if t.TYPE_CHECKING:
    from composio.core.models._modifiers import Modifiers
    from composio.core.models.tool_router import ToolRouterSessionExperimental


class ToolRouterSession(t.Generic[TTool, TToolCollection]):
    """
    Tool router session containing session information and methods.

    Generic Parameters:
        TTool: The individual tool type returned by the provider.
        TToolCollection: The collection type returned by tools().

    Attributes:
        session_id: Unique session identifier
        mcp: MCP server configuration
        experimental: Experimental features (files, assistive prompt, etc.)
    """

    def __init__(
        self,
        *,
        client: HttpClient,
        provider: t.Optional[BaseProvider[t.Any, t.Any]],
        auto_upload_download_files: bool,
        session_id: str,
        mcp: t.Any,
        experimental: "ToolRouterSessionExperimental",
    ) -> None:
        self._client = client
        self._provider = provider
        self._auto_upload_download_files = auto_upload_download_files
        self.session_id = session_id
        self.mcp = mcp
        self.experimental = experimental

    def tools(self, modifiers: t.Optional["Modifiers"] = None) -> TToolCollection:
        """
        Get provider-wrapped tools for execution with your AI framework.

        Returns tools configured for this session, wrapped in the format expected
        by your AI provider (OpenAI, Anthropic, LangChain, etc.).
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
            auto_upload_download_files=self._auto_upload_download_files,
        )

        router_tools = tools_model.get_raw_tool_router_meta_tools(
            session_id=self.session_id,
            modifiers=modifiers,
        )

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

        return t.cast(
            TToolCollection,
            t.cast(AgenticProvider[TTool, TToolCollection], self._provider).wrap_tools(
                tools=router_tools,
                execute_tool=tools_model._wrap_execute_tool_for_tool_router(
                    session_id=self.session_id,
                    modifiers=modifiers,
                ),
            ),
        )

    def authorize(
        self,
        toolkit: str,
        *,
        callback_url: t.Optional[str] = None,
    ) -> ConnectionRequest:
        """
        Authorize a toolkit for the user and get a connection request.

        Initiates the OAuth flow and returns a ConnectionRequest with redirect URL.
        """
        response = self._client.tool_router.session.link(
            session_id=self.session_id,
            toolkit=toolkit,
            callback_url=callback_url if callback_url else omit,
        )
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
    ) -> t.Any:
        """
        Get toolkit connection states for the session.
        """
        from composio.core.models.tool_router import (
            ToolkitConnection,
            ToolkitConnectionAuthConfig,
            ToolkitConnectionState,
            ToolkitConnectedAccount,
            ToolkitConnectionsDetails,
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
    ) -> t.Any:
        """
        Search for tools by semantic use case.

        Returns relevant tools for the given query with schemas and guidance.
        """
        return self._client.tool_router.session.search(
            session_id=self.session_id,
            queries=[{"use_case": query}],
            model=model if model else omit,
        )

    def execute(
        self,
        tool_slug: str,
        *,
        arguments: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> t.Any:
        """
        Execute a tool within the session.
        """
        return self._client.tool_router.session.execute(
            session_id=self.session_id,
            tool_slug=tool_slug,
            arguments=arguments if arguments is not None else omit,
        )
