import typing as t

import pydantic
from crewai.tools import BaseTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import json_schema_to_model


class CrewAIProvider(AgenticProvider[BaseTool, list[BaseTool]], name="crewai"):
    """
    Composio toolset for CrewiAI framework.
    """

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> BaseTool:
        """Wrap a tool as a CrewAI tool."""

        class Wrapper(BaseTool):
            def _run(self, **kwargs):
                try:
                    return execute_tool(slug=tool.slug, arguments=kwargs)
                except pydantic.ValidationError as e:
                    return {
                        "successful": False,
                        "error": parse_pydantic_error(e),
                        "data": None,
                    }

        return Wrapper(
            name=tool.slug,
            description=tool.description,
            args_schema=json_schema_to_model(
                json_schema=tool.input_parameters,
                skip_default=self.skip_default,
            ),
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[BaseTool]:
        """Wrap a list of tools as a list of CrewAI tools."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
