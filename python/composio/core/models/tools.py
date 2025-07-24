from __future__ import annotations

import functools
import typing as t

import typing_extensions as te

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
    NoneAgenticProviderExecuteFn,
)
from composio.exceptions import InvalidParams, NotFoundError

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
    ):
        """
        Initialize the tools resource.

        :param client: The client to use for the tools resource.
        :param provider: The provider to use for the tools resource.
        :param file_download_dir: Output directory for downloadable files
        """
        self._client = client
        self._custom_tools = CustomTools(client)
        self._tool_schemas: t.Dict[str, Tool] = {}
        self._file_helper = FileHelper(client=self._client, outdir=file_download_dir)

        self.custom_tool = self._custom_tools.register
        self.provider = provider

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
            return t.cast(Tool, self._client.tools.retrieve(tool_slug=slug))

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
            tools_list.extend(self._client.tools.list(tool_slugs=",".join(tools)).items)

        # Search tools by toolkit slugs and search term
        if toolkits is not None or search is not None:
            tools_list.extend(
                self._client.tools.list(
                    toolkit_slug=(
                        ",".join(toolkits) if toolkits else self._client.not_given
                    ),
                    search=search if search else self._client.not_given,
                    scopes=scopes,
                    limit=limit,
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
            t.cast(NonAgenticProvider, self.provider).set_execute_tool_fn(
                t.cast(
                    NoneAgenticProviderExecuteFn,
                    self.execute,
                )
            )
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
            ),
        )

    def _execute_custom_tool(
        self,
        slug: str,
        arguments: t.Dict,
    ) -> ToolExecutionResponse:
        """Execute a custom tool"""
        # TODO: Better error handling, pydantic validation eg...
        try:
            return {
                "data": self._custom_tools.execute(slug=slug, request=arguments),
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
    ) -> ToolExecutionResponse:
        """Execute a tool"""
        return t.cast(
            ToolExecutionResponse,
            self._client.tools.execute(
                tool_slug=slug,
                arguments=arguments,
                connected_account_id=connected_account_id or self._client.not_given,
                custom_auth_params=custom_auth_params or self._client.not_given,
                custom_connection_data=custom_connection_data or self._client.not_given,
                user_id=user_id or self._client.not_given,
                text=text or self._client.not_given,
                version=version or self._client.not_given,
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
        :param version: The version of the tool to execute.
        :param modifiers: The modifiers to apply to the tool.
        :return: The response from the tool.
        """
        tool = self._tool_schemas.get(slug)
        if tool is None and self._custom_tools.get(slug=slug) is not None:
            tool = self._custom_tools[slug].info
            self._tool_schemas[slug] = tool

        if tool is None:
            tool = t.cast(Tool, self._client.tools.retrieve(tool_slug=slug))
            self._tool_schemas[slug] = tool

        if modifiers is not None:
            processed_params = apply_modifier_by_type(
                modifiers=modifiers,
                toolkit=tool.toolkit.slug,
                tool=slug,
                type="before_execute",
                request={
                    "connected_account_id": connected_account_id,
                    "custom_auth_params": custom_auth_params,
                    "custom_connection_data": custom_connection_data,
                    "version": version,
                    "text": text,
                    "user_id": user_id,
                    "arguments": arguments,
                },
            )
            connected_account_id = processed_params["connected_account_id"]
            custom_auth_params = processed_params["custom_auth_params"]
            custom_connection_data = processed_params["custom_connection_data"]
            text = processed_params["text"]
            version = processed_params["version"]
            user_id = processed_params["user_id"]
            arguments = processed_params["arguments"]

        arguments = self._file_helper.substitute_file_uploads(
            tool=tool,
            request=arguments,
        )
        response = (
            self._execute_custom_tool(slug=slug, arguments=arguments)
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
        self, **options: te.Unpack[tool_proxy_params.ToolProxyParams]
    ) -> tool_proxy_response.ToolProxyResponse:
        """Proxy a tool call to the Composio API"""
        return self._client.tools.proxy(
            endpoint=options["endpoint"],
            method=options["method"],
            body=options.get("body", self._client.not_given),
            connected_account_id=options.get(
                "connected_account_id", self._client.not_given
            ),
            parameters=options.get("parameters", self._client.not_given),
            custom_connection_data=options.get(
                "custom_connection_data", self._client.not_given
            ),
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
