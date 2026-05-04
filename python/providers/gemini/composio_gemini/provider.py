"""Gemini provider for Composio SDK.

Returns Python callables compatible with google-genai's Automatic Function
Calling (AFC). The SDK can introspect the callable's signature to derive
FunctionDeclaration schemas and auto-execute tool calls in the chat loop.
"""

import types as pytypes
import typing as t
from inspect import Parameter, Signature

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.shared import (
    get_pydantic_signature_format_from_schema_params,
    reinstate_reserved_python_keywords,
    substitute_reserved_python_keywords,
)

# google-genai is only needed for handle_response (backward compat)
try:
    from google.genai import types as genai_types

    HAS_GENAI = True
except ImportError:
    genai_types = None  # type: ignore
    HAS_GENAI = False


def _to_serializable(value: t.Any) -> t.Any:
    """Recursively convert Pydantic models (and other non-JSON types) to plain dicts/lists.

    The google-genai SDK's AFC pipeline calls ``convert_if_exist_pydantic_model``
    on function arguments, turning nested dicts into dynamically-generated
    Pydantic ``GeneratedModel`` instances.  These are not JSON-serializable, so
    the Composio ``execute_tool`` call fails.  This helper normalises them back
    to plain Python primitives before handing off to the API.
    """
    # Pydantic v2 BaseModel
    if hasattr(value, "model_dump"):
        return value.model_dump()
    # Pydantic v1 BaseModel
    if hasattr(value, "dict") and hasattr(value, "__fields__"):
        return value.dict()
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_serializable(v) for v in value]
    return value


def _process_execution_result(result: t.Any) -> t.Dict:
    """Process a tool execution result into a dict suitable for Gemini function responses."""
    if not isinstance(result, dict):
        return {"result": result}

    if result.get("successful", True) and "data" in result:
        data = result["data"]
        return data if isinstance(data, dict) else {"result": data}

    if not result.get("successful", True):
        return {
            "error": result.get("error", "Tool execution failed"),
            "details": result,
        }

    return result


class GeminiProvider(AgenticProvider[t.Callable, list[t.Callable]], name="gemini"):
    """Composio toolset for Google AI Python Gemini framework.

    Returns Python callables compatible with google-genai's Automatic Function
    Calling (AFC). Pass the result of ``wrap_tools()`` directly to
    ``GenerateContentConfig(tools=...)`` and the SDK will auto-execute tool
    calls in the ``chat.send_message()`` loop.
    """

    __schema_skip_defaults__ = True

    def __init__(self, **kwargs: t.Any):
        super().__init__(**kwargs)
        self._executors: t.Dict[str, AgenticProviderExecuteFn] = {}

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.Callable:
        """Wrap a Composio tool as a Python callable for google-genai AFC.

        The returned function has ``__name__``, ``__doc__``, ``__signature__``
        and ``__annotations__`` set so the google-genai SDK can:

        1. Derive a ``FunctionDeclaration`` schema via ``from_callable()``
        2. Store it in the AFC ``function_map`` for automatic execution
        """
        self._executors[tool.slug] = execute_tool

        # Handle reserved Python keywords in parameter names
        schema_params, keywords = substitute_reserved_python_keywords(
            schema=tool.input_parameters
        )

        def function(**kwargs: t.Any) -> t.Dict:
            """Composio tool execution wrapper."""
            kwargs = _to_serializable(kwargs)
            kwargs = reinstate_reserved_python_keywords(
                request=kwargs, keywords=keywords
            )
            result = execute_tool(tool.slug, kwargs)
            return _process_execution_result(result)

        # Create a real function object (passes inspect.isfunction)
        action_func = pytypes.FunctionType(
            function.__code__,
            globals=globals(),
            name=tool.slug,
            closure=function.__closure__,
        )

        # Build typed signature from JSON schema.
        # Uses get_pydantic_signature_format_from_schema_params (not
        # get_signature_format_from_schema_params) because the pydantic variant
        # goes through json_schema_to_pydantic_type() which produces
        # parameterized generics (e.g. List[str] instead of bare List).
        # The google-genai SDK requires parameterized array types — bare List
        # generates {"type": "ARRAY"} without "items", which the API rejects.
        sig_params = get_pydantic_signature_format_from_schema_params(
            schema_params=schema_params,
            skip_default=True,
        )
        action_func.__signature__ = Signature(parameters=sig_params)  # type: ignore
        action_func.__doc__ = tool.description or f"Execute {tool.slug}"

        # Build __annotations__ for typing.get_type_hints() compatibility
        annotations: t.Dict[str, t.Any] = {}
        for param in sig_params:
            if param.annotation is not Parameter.empty:
                annotations[param.name] = param.annotation
        annotations["return"] = dict
        action_func.__annotations__ = annotations

        return action_func

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[t.Callable]:
        """Wrap multiple Composio tools as Python callables for google-genai AFC."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]

    # --- Backward compatibility: manual function calling ---

    def handle_response(self, response: t.Any) -> tuple[list, bool]:
        """Manually handle function calls in a Gemini response.

        Provided for backward compatibility with code that uses manual function
        calling instead of AFC. For new code, pass the callables from
        ``wrap_tools()`` to ``GenerateContentConfig(tools=...)`` and AFC will
        handle execution automatically.

        Returns:
            tuple: ``(function_responses, executed)`` where *function_responses*
            are ``genai_types.Part`` objects ready to send back, and *executed*
            is ``True`` if any functions were executed.
        """
        if not HAS_GENAI:
            return [], False

        if not (hasattr(response, "candidates") and response.candidates):
            return [], False

        candidate = response.candidates[0]
        if not (hasattr(candidate, "content") and candidate.content.parts):
            return [], False

        function_responses: list = []
        executed = False

        for part in candidate.content.parts:
            if not (hasattr(part, "function_call") and part.function_call):
                continue

            fc = part.function_call
            if fc.name not in self._executors:
                continue

            result = self._executors[fc.name](slug=fc.name, arguments=dict(fc.args))
            processed = _process_execution_result(result)

            function_responses.append(
                genai_types.Part(
                    function_response=genai_types.FunctionResponse(
                        name=fc.name, response=processed
                    )
                )
            )
            executed = True

        return function_responses, executed
