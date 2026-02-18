import json
import typing as t

import pydantic
from crewai.tools import BaseTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import json_schema_to_model


def _make_strict_compatible(schema: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    """Make a JSON schema compatible with OpenAI's strict mode.

    CrewAI uses OpenAI strict mode for function calling, which requires
    ``additionalProperties: false`` on every nested object. Freeform dicts
    (``additionalProperties: true`` with no defined properties) are converted
    to ``type: string`` so the model outputs a JSON string instead.

    Returns a new schema dict (does not mutate the original).
    """
    schema = dict(schema)

    # Process $defs first so $ref targets are also strict-compatible
    if "$defs" in schema:
        schema["$defs"] = {
            k: _make_strict_compatible(v) for k, v in schema["$defs"].items()
        }

    # Recurse into properties
    if "properties" in schema:
        schema["properties"] = {
            k: _make_strict_compatible(v) for k, v in schema["properties"].items()
        }

    # Recurse into array items
    if "items" in schema and isinstance(schema["items"], dict):
        schema["items"] = _make_strict_compatible(schema["items"])

    if schema.get("type") == "object":
        has_properties = bool(schema.get("properties"))
        if schema.get("additionalProperties") is True or (
            not has_properties and "additionalProperties" not in schema
        ):
            if not has_properties:
                # Freeform dict with no defined keys — strict mode cannot
                # represent this as an object, so convert to a JSON string.
                desc = schema.get("description", "")
                schema = {
                    "type": "string",
                    "description": f"{desc} (as a JSON string)",
                }
                return schema
        # Object with defined properties — just lock it down.
        schema["additionalProperties"] = False

    return schema


def _parse_json_strings(value: t.Any) -> t.Any:
    """Recursively parse string values that look like JSON objects back into
    dicts/lists.

    When freeform dict fields are converted to string type for strict-mode
    compatibility, the model outputs JSON strings. This function converts
    them back so downstream ``execute_tool`` receives the expected types.
    """
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, (dict, list)):
                return _parse_json_strings(parsed)
        except (json.JSONDecodeError, TypeError):
            pass
        return value
    if isinstance(value, dict):
        return {k: _parse_json_strings(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_parse_json_strings(item) for item in value]
    return value


class CrewAIProvider(AgenticProvider[BaseTool, list[BaseTool]], name="crewai"):
    """
    Composio toolset for CrewAI framework.
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
                    return execute_tool(
                        slug=tool.slug,
                        arguments=_parse_json_strings(kwargs),
                    )
                except pydantic.ValidationError as e:
                    return {
                        "successful": False,
                        "error": parse_pydantic_error(e),
                        "data": None,
                    }

        strict_schema = _make_strict_compatible(tool.input_parameters)
        return Wrapper(
            name=tool.slug,
            description=tool.description,
            args_schema=json_schema_to_model(
                json_schema=strict_schema,
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
