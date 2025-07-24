"""ComposioLangChain class definition"""

import types
import typing as t
from inspect import Signature

import pydantic
from langchain_core.tools import StructuredTool as BaseStructuredTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)

_python_reserved = {"for", "async"}
_obj_marker = "-_object_-"


def _clean_reserved_keyword(keyword: str):
    return f"{keyword}_rs"


def _substitute_reserved_python_keywords(schema: t.Dict) -> t.Tuple[dict, dict]:
    if "properties" not in schema:
        return schema, {}

    keywords = {}
    for p_name in list(schema["properties"]):
        if p_name not in _python_reserved:
            continue

        _keywords = {}
        p_val = schema["properties"].pop(p_name)
        if p_val.get("type") == "object":
            p_val, _keywords = _substitute_reserved_python_keywords(schema=p_val)

        p_name_clean = _clean_reserved_keyword(keyword=p_name)
        schema["properties"][p_name_clean] = p_val
        keywords[p_name_clean] = p_name
        keywords[f"{p_name_clean}{_obj_marker}"] = _keywords

    return schema, keywords


def _reinstate_reserved_python_keywords(request: dict, keywords: dict) -> dict:
    for clean_key in sorted(list(keywords), reverse=True):
        subkeys = None
        if clean_key.endswith(_obj_marker):
            subkeys = keywords[clean_key]
            clean_key, _ = clean_key.split(_obj_marker, maxsplit=1)

        if clean_key not in request:
            continue

        orginal_value = request.pop(clean_key)
        if subkeys is not None:
            orginal_value = _reinstate_reserved_python_keywords(
                request=orginal_value,
                keywords=subkeys,
            )
        request[keywords[clean_key]] = orginal_value
    return request


class StructuredTool(BaseStructuredTool):
    def run(self, *args, **kwargs):
        try:
            return super().run(*args, **kwargs)
        except pydantic.ValidationError as e:
            return {"successful": False, "error": parse_pydantic_error(e), "data": None}


class LangchainProvider(
    AgenticProvider[StructuredTool, t.List[StructuredTool]],
    name="langchain",
):
    """
    Composio toolset for Langchain framework.
    """

    runtime = "langchain"

    def wrap_tool(
        self, tool: Tool, execute_tool: AgenticProviderExecuteFn
    ) -> StructuredTool:
        """Wraps composio tool as Langchain StructuredTool object."""
        # Replace reserved python keywords
        schema_params, keywords = _substitute_reserved_python_keywords(
            schema=tool.input_parameters
        )

        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            kwargs = _reinstate_reserved_python_keywords(
                request=kwargs,
                keywords=keywords,
            )
            return execute_tool(tool.slug, kwargs)

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=tool.slug,
            closure=function.__closure__,
        )
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema_params
            )
        )
        action_func.__doc__ = tool.description

        return t.cast(
            StructuredTool,
            StructuredTool.from_function(
                name=tool.slug,
                description=tool.description,
                args_schema=json_schema_to_model(
                    json_schema=schema_params,
                    skip_default=self.skip_default,
                ),
                return_schema=True,
                func=action_func,
                handle_tool_error=True,
                handle_validation_error=True,
            ),
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.List[StructuredTool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.
        """
        return [self.wrap_tool(tool=tool, execute_tool=execute_tool) for tool in tools]
