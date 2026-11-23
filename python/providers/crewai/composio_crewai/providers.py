import typing as t

import pydantic
from crewai.tools import BaseTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.json_schema import dereference_json_schema
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import (
    json_schema_to_model,
    normalize_tool_arguments,
    validate_and_serialize_tool_arguments,
)


class CrewAIProvider(AgenticProvider[BaseTool, list[BaseTool]], name="crewai"):
    """
    Composio toolset for CrewiAI framework.
    """

    async_tool_execution = "native"

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> BaseTool:
        """Wrap a tool as a CrewAI tool."""

        async_execute = getattr(type(execute_tool), "aexecute", None)

        class Wrapper(BaseTool):
            def _validate_kwargs(
                self, kwargs: t.Dict[str, t.Any]
            ) -> t.Dict[str, t.Any]:
                """Validate zero-field schemas and preserve argument presence."""
                if self.args_schema is None:
                    return kwargs
                return validate_and_serialize_tool_arguments(self.args_schema, kwargs)

            def run(self, *args, **kwargs):
                try:
                    return super().run(*args, **kwargs)
                except pydantic.ValidationError as e:
                    return {
                        "successful": False,
                        "error": parse_pydantic_error(e),
                        "data": None,
                    }

            def _run(self, **kwargs):
                try:
                    # Normalize defensively so a stringified payload is coerced to a dict (issue #2406).
                    return execute_tool(
                        slug=tool.slug, arguments=normalize_tool_arguments(kwargs)
                    )
                except pydantic.ValidationError as e:
                    return {
                        "successful": False,
                        "error": parse_pydantic_error(e),
                        "data": None,
                    }

        class AsyncWrapper(Wrapper):
            def to_structured_tool(self):
                # CrewAI converts tools to this form before an agent invokes them.
                structured = super().to_structured_tool()
                structured.func = self._arun
                return structured

            async def _arun(self, **kwargs):
                assert async_execute is not None
                return await async_execute(
                    execute_tool,
                    slug=tool.slug,
                    arguments=normalize_tool_arguments(kwargs),
                )

        # Inline internal $ref/$defs before building the Pydantic model. The
        # converter types a referenced property as Any, so CrewAI would show the
        # model an untyped argument. Dangling references degrade to a permissive
        # object instead of raising, matching the other providers.
        input_parameters = dereference_json_schema(
            tool.input_parameters,
            on_unresolved="sentinel",
        )
        wrapper_type = AsyncWrapper if async_execute is not None else Wrapper
        return wrapper_type(
            name=tool.slug,
            description=tool.description,
            args_schema=json_schema_to_model(
                json_schema=input_parameters,
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
