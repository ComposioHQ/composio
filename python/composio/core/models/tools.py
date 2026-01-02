from __future__ import annotations

import functools
import typing as t

import typing_extensions as te
from composio_client import omit

from composio.client import HttpClient
from composio.client.types import (
    Tool,
    tool_execute_params,
    tool_proxy_params,
    tool_proxy_response,
)
from composio.core.models._files import FileHelper
from composio.core.models.base import Resource
from composio.core.models.custom_tools import CustomTools
from composio.core.provider import (
    TProvider,
)
from composio.core.provider.agentic import AgenticProvider, AgenticProviderExecuteFn
from composio.core.provider.none_agentic import (
    NonAgenticProvider,
)
from composio.core.types import ToolkitVersionParam
from composio.exceptions import InvalidParams, NotFoundError, ToolVersionRequiredError
from composio.utils.pydantic import none_to_omit
from composio.utils.toolkit_version import get_toolkit_version
from composio.core.provider.base import ExecuteToolFn

from ._modifiers import (
    Modifiers,
    ToolExecuteParams,
    after_execute,
    apply_modifier_by_type,
    before_execute,
    schema_modifier,
)


class ToolExecutionResponse(te.TypedDict):
    data: t.Dict
    error: t.Optional[str]
    successful: bool


class Tools(Resource, t.Generic[TProvider]):
    """
    Tools class definition

    This class is used to manage tools in the Composio SDK.
    It provides methods to list, get, and execute tools.
    """

    provider: TProvider

    def __init__(
        self,
        client: HttpClient,
        provider: TProvider,
        file_download_dir: t.Optional[str] = None,
        toolkit_versions: t.Optional[ToolkitVersionParam] = None,
    ):
        """
        Initialize the tools resource.

        :param client: The client to use for the tools resource.
        :param provider: The provider to use for the tools resource.
        :param file_download_dir: Output directory for downloadable files
        :param toolkit_versions: The versions of the toolkits to use. Defaults to 'latest' if not provided.
        """
        self._client = client
        self._custom_tools = CustomTools(client)
        self._tool_schemas: t.Dict[str, Tool] = {}
        self._file_helper = FileHelper(client=self._client, outdir=file_download_dir)
        self._toolkit_versions = toolkit_versions

        self.custom_tool = self._custom_tools.register
        self.provider = provider

        self.provider.set_execute_tool_fn(
            t.cast(
                ExecuteToolFn,
                functools.partial(
                    self.execute,
                    # Dangerously skip version check for provider controlled tool execution
                    dangerously_skip_version_check=True,
                ),
            ),
        )

    def _filter_custom_tools(
        self, tools: t.List[str]
    ) -> t.Tuple[t.List[str], t.List[Tool]]:
        """Filter out custom tools from the list of tools."""
        _tools = []
        _custom_tools = []
        for tool in tools:
            try:
                _custom_tools.append(self._custom_tools[tool].info)
            except KeyError:
                _tools.append(tool)
        return _tools, _custom_tools

    def get_raw_composio_tool_by_slug(self, slug: str) -> Tool:
        """
        Returns schema for the given tool slug.
        """
        try:
            return t.cast(Tool, self._custom_tools[slug])
        except KeyError:
            return t.cast(
                Tool,
                self._client.tools.retrieve(
                    tool_slug=slug,
                    toolkit_versions=none_to_omit(self._toolkit_versions),
                ),
            )

    def get_raw_composio_tools(
        self,
        tools: t.Optional[list[str]] = None,
        search: t.Optional[str] = None,
        toolkits: t.Optional[list[str]] = None,
        scopes: t.Optional[t.List[str]] = None,
        limit: t.Optional[int] = None,
    ) -> list[Tool]:
        """
        Get a list of tool schemas based on the provided filters.
        """
        if tools is None and search is None and toolkits is None:
            raise InvalidParams(
                "Either `tools`, `search`, or `toolkits` must be provided"
            )

        tools_list = []
        if tools is not None:
            tools, custom_tools = self._filter_custom_tools(tools=tools)
            tools_list.extend(custom_tools)
            if len(tools):
                tools_list.extend(
                    self._client.tools.list(
                        tool_slugs=",".join(tools),
                        toolkit_versions=none_to_omit(self._toolkit_versions),
                    ).items
                )

        # Search tools by toolkit slugs and search term
        if toolkits is not None or search is not None:
            tools_list.extend(
                self._client.tools.list(
                    toolkit_slug=none_to_omit(",".join(toolkits) if toolkits else None),
                    search=none_to_omit(search),
                    scopes=scopes,
                    limit=limit,
                    toolkit_versions=none_to_omit(self._toolkit_versions),
                ).items
            )
        return tools_list

    def _get(
        self,
        user_id: str,
        tools: t.Optional[list[str]] = None,
        search: t.Optional[str] = None,
        toolkits: t.Optional[list[str]] = None,
        scopes: t.Optional[t.List[str]] = None,
        modifiers: t.Optional[Modifiers] = None,
        limit: t.Optional[int] = None,
    ):
        """Get a list of tools based on the provided filters."""
        tools_list = self.get_raw_composio_tools(
            tools=tools,
            search=search,
            toolkits=toolkits,
            scopes=scopes,
            limit=limit,
        )
        if modifiers is not None:
            tools_list = [
                apply_modifier_by_type(
                    modifiers=modifiers,
                    toolkit=tool.toolkit.slug,
                    tool=tool.slug,
                    type="schema",
                    schema=tool,
                )
                for tool in tools_list
            ]

        self._tool_schemas.update(
            {tool.slug: tool.model_copy(deep=True) for tool in tools_list}
        )
        for tool in tools_list:
            tool.input_parameters = self._file_helper.process_schema_recursively(
                schema=tool.input_parameters,
            )

        if issubclass(type(self.provider), NonAgenticProvider):
            return t.cast(NonAgenticProvider, self.provider).wrap_tools(
                tools=tools_list
            )

        return t.cast(AgenticProvider, self.provider).wrap_tools(
            tools=tools_list,
            execute_tool=self._wrap_execute_tool(
                user_id=user_id,
                modifiers=modifiers,
            ),
        )

    @t.overload
    def get(
        self,
        user_id: str,
        *,
        slug: str,
        modifiers: t.Optional[Modifiers] = None,
    ):
        """Get tool by slug"""

    @t.overload
    def get(
        self,
        user_id: str,
        *,
        tools: list[str],
        modifiers: t.Optional[Modifiers] = None,
    ):
        """Get tools by tool slugs"""

    @t.overload
    def get(
        self,
        user_id: str,
        *,
        toolkits: list[str],
        scopes: t.Optional[t.List[str]] = None,
        limit: t.Optional[int] = None,
        modifiers: t.Optional[Modifiers] = None,
    ):
        """Get tools by toolkit slugs (Only important tools are returned)"""

    @t.overload
    def get(
        self,
        user_id: str,
        *,
        search: str,
        modifiers: t.Optional[Modifiers] = None,
    ):
        """Search tool by search term"""

    @t.overload
    def get(
        self,
        user_id: str,
        *,
        toolkits: list[str],
        search: t.Optional[str] = None,
        limit: t.Optional[int] = None,
        modifiers: t.Optional[Modifiers] = None,
    ):
        """Get tool by search term and/or toolkit slugs and search term"""

    def get(
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
    ):
        """Get a tool or list of tools based on the provided arguments."""
        if slug is not None:
            return self._get(user_id=user_id, tools=[slug], modifiers=modifiers)
        return self._get(
            user_id=user_id,
            tools=tools,
            search=search,
            toolkits=toolkits,
            scopes=scopes,
            modifiers=modifiers,
            limit=limit,
        )

    def _wrap_execute_tool(
        self,
        modifiers: t.Optional[Modifiers] = None,
        user_id: t.Optional[str] = None,
    ) -> AgenticProviderExecuteFn:
        """Wrap the execute tool function"""
        return t.cast(
            AgenticProviderExecuteFn,
            functools.partial(
                self.execute,
                modifiers=modifiers,
                user_id=user_id,
                # Dangerously skip version check for agentic tool execution via providers
                # This can be safe because most agentic flows users fetch latest version and then execute the tool
                dangerously_skip_version_check=True,
            ),
        )

    def _wrap_execute_tool_for_tool_router(
        self,
        session_id: str,
        modifiers: t.Optional[Modifiers] = None,
    ) -> AgenticProviderExecuteFn:
        """
        Create an execute function for tool router that uses the session's execute_meta endpoint.

        This method creates a function that executes tools within a tool router session context.
        It uses the session's execute_meta endpoint which handles authentication and connection
        management automatically.

        :param session_id: The session ID
        :param modifiers: Optional modifiers to apply before and after execution
        :return: Execute function for tool router
        """

        def execute_tool_fn(slug: str, arguments: t.Dict) -> t.Dict:
            """
            Execute a tool in the tool router session.

            This function is used by agentic providers to execute tools within
            a tool router session context. It uses the session's execute_meta
            endpoint which handles authentication and connection management
            automatically.

            :param slug: The tool slug to execute
            :param arguments: The tool arguments
            :return: Tool execution response
            """
            # Get tool schema for modifiers
            tool = self.get_raw_composio_tool_by_slug(slug)

            # Apply before_execute modifiers
            processed_arguments = arguments
            if modifiers is not None:
                params: ToolExecuteParams = {
                    "arguments": arguments,
                }
                type_before: t.Literal["before_execute"] = "before_execute"
                modified_params = apply_modifier_by_type(
                    modifiers=modifiers,
                    toolkit=tool.toolkit.slug if tool.toolkit else "unknown",
                    tool=slug,
                    type=type_before,
                    request=params,
                )
                processed_arguments = modified_params.get("arguments", arguments)

            # Execute the tool via the session's execute_meta endpoint
            # Note: execute_meta accepts regular tool slugs at runtime, not just meta tool slugs
            # The type signature expects Literal meta tool slugs, but runtime accepts any str
            response = self._client.tool_router.session.execute_meta(
                session_id=session_id,
                slug=slug,  # type: ignore[arg-type]
                arguments=processed_arguments,
            )

            # Convert response to standard format
            result: ToolExecutionResponse = {
                "data": response.data if hasattr(response, "data") else {},
                "error": response.error if hasattr(response, "error") else None,
                "successful": not (hasattr(response, "error") and response.error),
            }

            # Apply after_execute modifiers
            if modifiers is not None:
                type_after: t.Literal["after_execute"] = "after_execute"
                result = apply_modifier_by_type(
                    modifiers=modifiers,
                    toolkit=tool.toolkit.slug if tool.toolkit else "unknown",
                    tool=slug,
                    type=type_after,
                    response=result,
                )

            return t.cast(t.Dict, result)

        return t.cast(AgenticProviderExecuteFn, execute_tool_fn)

    def _execute_custom_tool(
        self,
        slug: str,
        arguments: t.Dict,
        user_id: t.Optional[str] = None,
    ) -> ToolExecutionResponse:
        """Execute a custom tool"""
        # TODO: Better error handling, pydantic validation eg...
        try:
            return {
                "data": self._custom_tools.execute(
                    slug=slug,
                    request=arguments,
                    user_id=user_id,
                ),
                "error": None,
                "successful": True,
            }
        except NotFoundError:
            return {
                "data": {},
                "error": f"Tool with slug {slug} not found",
                "successful": False,
            }

    def _execute_tool(
        self,
        slug: str,
        arguments: t.Dict,
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
        # Get the tool to determine its toolkit
        tool = self.get_raw_composio_tool_by_slug(slug)

        # If version is not explicitly provided, resolve it from instance-level toolkit versions
        # This matches the TypeScript behavior - always resolve version when None
        if version is None:
            toolkit_slug = tool.toolkit.slug if tool.toolkit else "unknown"
            # Use instance-level toolkit versions configuration
            version = get_toolkit_version(toolkit_slug, self._toolkit_versions)

        # Check if the version is 'latest' and dangerously_skip_version_check is not True
        # If so, raise an error to prevent unexpected behavior
        if version == "latest" and not dangerously_skip_version_check:
            raise ToolVersionRequiredError()

        return t.cast(
            ToolExecutionResponse,
            self._client.tools.execute(
                tool_slug=slug,
                arguments=arguments,
                connected_account_id=none_to_omit(connected_account_id),
                custom_auth_params=none_to_omit(custom_auth_params),
                custom_connection_data=none_to_omit(custom_connection_data),
                user_id=none_to_omit(user_id),
                text=none_to_omit(text),
                version=none_to_omit(version),
            ).model_dump(
                exclude={
                    "log_id",
                    "session_info",
                }
            ),
        )

    def execute(
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
        """
        Execute a tool with the provided parameters.

        This method calls the Composio API or a custom tool handler to execute
        the tool and returns the response. It automatically determines whether
        to use a custom tool or a Composio API tool based on the slug.

        :param slug: The slug of the tool to execute.
        :param arguments: The arguments to pass to the tool.
        :param connected_account_id: The ID of the connected account to use for the tool.
        :param custom_auth_params: The custom auth params to use for the tool.
        :param custom_connection_data: The custom connection data to use for the tool, takes priority over custom_auth_params.
        :param user_id: The ID of the user to execute the tool for.
        :param text: The text to pass to the tool.
        :param version: The version of the tool to execute (overrides the SDK-level toolkit versions for this execution).
        :param dangerously_skip_version_check: Skip the version check for 'latest' version. This might cause unexpected behavior when new versions are released.
        :param modifiers: The modifiers to apply to the tool.
        :return: The response from the tool.
        """

        tool = self._tool_schemas.get(slug)
        if tool is None:
            custom_tool = self._custom_tools.get(slug=slug)
            if custom_tool is not None:
                tool = custom_tool.info
                self._tool_schemas[slug] = tool

        if tool is None:
            tool = t.cast(
                Tool,
                self._client.tools.retrieve(
                    tool_slug=slug,
                    toolkit_versions=none_to_omit(self._toolkit_versions),
                ),
            )
            self._tool_schemas[slug] = tool

        if modifiers is not None:
            type_before_exec: t.Literal["before_execute"] = "before_execute"
            request_params: ToolExecuteParams = {
                "arguments": arguments,
            }
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
                toolkit=tool.toolkit.slug,
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

        arguments = self._file_helper.substitute_file_uploads(
            tool=tool,
            request=arguments,
        )
        response = (
            self._execute_custom_tool(
                slug=slug,
                arguments=arguments,
                user_id=user_id,
            )
            if self._custom_tools.get(slug) is not None
            else self._execute_tool(
                slug=slug,
                arguments=arguments,
                connected_account_id=connected_account_id,
                custom_auth_params=custom_auth_params,
                custom_connection_data=custom_connection_data,
                user_id=user_id,
                text=text,
                version=version,
                dangerously_skip_version_check=dangerously_skip_version_check,
            )
        )
        response = self._file_helper.substitute_file_downloads(
            tool=tool,
            response=response,
        )
        if modifiers is not None:
            response = apply_modifier_by_type(
                modifiers=modifiers,
                toolkit=tool.toolkit.slug,
                tool=slug,
                type="after_execute",
                response=response,
            )
        return response

    def proxy(
        self,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
        body: t.Optional[object] = None,
        connected_account_id: t.Optional[str] = None,
        parameters: t.Optional[t.List[tool_proxy_params.Parameter]] = None,
        custom_connection_data: t.Optional[
            tool_proxy_params.CustomConnectionData
        ] = None,
    ) -> tool_proxy_response.ToolProxyResponse:
        """Proxy a tool call to the Composio API"""
        return self._client.tools.proxy(
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
        )


__all__ = [
    "Tools",
    "ToolExecuteParams",
    "ToolExecutionResponse",
    "Modifiers",
    "Modifiers",
    "after_execute",
    "before_execute",
    "schema_modifier",
]
