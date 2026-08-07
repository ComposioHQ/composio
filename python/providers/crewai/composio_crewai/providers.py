import typing as t

import pydantic
from crewai.tools import BaseTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import json_schema_to_model, normalize_tool_arguments


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
            def _validate_kwargs(
                self, kwargs: t.Dict[str, t.Any]
            ) -> t.Dict[str, t.Any]:
                """Validate arguments without renaming or padding them.

                CrewAI's own implementation dumps the validated model with
                neither ``by_alias`` nor ``exclude_unset``, which corrupts the
                payload in two ways: parameters aliased to keep them valid
                Python identifiers (``validate`` becomes ``validate_``) reach
                the backend under the wrong key, and optional parameters the
                model never supplied are materialized as explicit ``None``.

                It also wraps the failure as a plain ``ValueError``, which
                escapes the ``pydantic.ValidationError`` handler below.
                Re-raising the original keeps that handler reachable.
                """
                schema = self.args_schema
                if schema is None or not schema.model_fields:
                    return kwargs
                validated = schema.model_validate(kwargs)
                return validated.model_dump(by_alias=True, exclude_unset=True)

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
