"""Gemini provider for Composio SDK.

Returns Python callables compatible with google-genai's Automatic Function
Calling (AFC). The SDK can introspect the callable's signature to derive
FunctionDeclaration schemas and auto-execute tool calls in the chat loop.
"""

import threading
import types as pytypes
import typing as t
from inspect import Parameter, Signature

from pydantic import BaseModel

from composio.client.types import Tool
from composio.core.provider import (
    AgenticProvider,
    ToolCallExecutionTarget,
    ToolCallSession,
    get_execution_target,
)
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.shared import (
    ToolSchemaAliases,
    alias_tool_input_schema,
    get_pydantic_signature_format_from_schema_params,
    json_schema_to_model,
    normalize_tool_arguments,
    validate_and_serialize_tool_arguments,
)

if t.TYPE_CHECKING:
    from composio.core.provider.base import AsyncToolCallSession


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
    # Only fields the model returned: AFC fills omitted optional fields with
    # ``None``, which the tool schema may not allow. Aliases restore reserved
    # names such as ``from``.
    # Pydantic v2 BaseModel
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_unset=True, by_alias=True)
    # Pydantic v1 BaseModel
    if hasattr(value, "dict") and hasattr(value, "__fields__"):
        return value.dict(exclude_unset=True, by_alias=True)
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_serializable(v) for v in value]
    return value


def _literal_type(schema: t.Any) -> type:
    """The Python type shared by a typeless property's ``const``/``enum``
    values, or ``object`` when there is none."""
    if not isinstance(schema, dict):
        return object
    if "const" in schema:
        values = [schema["const"]]
    elif isinstance(schema.get("enum"), list) and schema["enum"]:
        values = schema["enum"]
    else:
        return object
    # ``bool`` first: it is a subclass of ``int``.
    for literal_type in (bool, str, int, float):
        if all(type(value) is literal_type for value in values):
            return literal_type
    return object


def _afc_annotation(annotation: t.Any, schema: t.Any = None) -> t.Any:
    """Return an annotation google-genai AFC can convert arguments with.

    AFC reads the callable's signature both to declare the function and to
    convert the arguments the model returns, and the conversion calls
    ``isinstance`` with the annotation. That raises on ``Annotated[...]``,
    parameterized ``Dict`` and ``typing.Any``, so any tool using them failed
    before it ran. The plain annotations declare the same function; the source
    schema is still enforced by ``args_schema``.

    A property without a ``type`` is ``typing.Any``. A bare ``const`` or
    ``enum`` is declared with the type of its values, so ``{"enum": ["asc",
    "desc"]}`` stays a string as it was before the signature carried
    validators. Anything else becomes ``object``, which declares no type and
    lets the conversion accept any value.
    """
    origin = t.get_origin(annotation)
    args = t.get_args(annotation)
    if origin is t.Annotated:
        return _afc_annotation(args[0], schema)
    if origin is list and args:
        return t.List[_afc_annotation(args[0])]  # type: ignore[misc]
    if origin is dict:
        return dict
    if origin in (t.Union, pytypes.UnionType):
        return t.Union[tuple(_afc_annotation(arg) for arg in args)]
    if annotation is t.Any:
        return _literal_type(schema)
    return annotation


def _execution_context(execute_tool: AgenticProviderExecuteFn) -> object:
    """Identify who a wrapped tool executes as.

    ``tools.get(user_id=...)`` and ``session.tools()`` record their user ID or
    session on the execute function, so two fetches for the same user share a
    context. Any other execute function is its own context.
    """
    target = get_execution_target(execute_tool)
    return execute_tool if target is None else target


class _WrappedTool(t.NamedTuple):
    """How one fetch wrapped a tool: the argument schema it built and the
    execute function of the user or session it was fetched for.

    They are stored together because schema modifiers can differ per fetch, so
    a call must be validated with the schema of the fetch whose executor runs it.
    """

    execute_tool: AgenticProviderExecuteFn
    aliases: ToolSchemaAliases
    args_schema: t.Type[BaseModel]

    def arguments_for(self, kwargs: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
        arguments = validate_and_serialize_tool_arguments(
            self.args_schema, normalize_tool_arguments(_to_serializable(kwargs))
        )
        return self.aliases.restore_arguments(arguments)


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


def _response_part(name: str, result: t.Any) -> t.Any:
    return genai_types.Part(
        function_response=genai_types.FunctionResponse(
            name=name, response=_process_execution_result(result)
        )
    )


class GeminiProvider(AgenticProvider[t.Callable, list[t.Callable]], name="gemini"):
    """Composio toolset for Google AI Python Gemini framework.

    Returns Python callables compatible with google-genai's Automatic Function
    Calling (AFC). Pass the result of ``wrap_tools()`` directly to
    ``GenerateContentConfig(tools=...)`` and the SDK will auto-execute tool
    calls in the ``chat.send_message()`` loop.
    """

    async_tool_execution = "native"

    __schema_skip_defaults__ = True

    def __init__(self, **kwargs: t.Any):
        super().__init__(**kwargs)
        # Guards the registries below: tools can be fetched on one thread while
        # ``handle_response`` reads them on another.
        self._lock = threading.Lock()
        # Wrapped tool per slug, for each user ID or session the tools were
        # fetched for, so ``handle_response`` runs a call as the caller's user,
        # with the caller's schema, rather than whoever fetched the tool last.
        self._wrapped_tools: t.Dict[object, t.Dict[str, _WrappedTool]] = {}

    def _for_async_client(self) -> "GeminiProvider":
        bound = super()._for_async_client()
        bound._lock = threading.Lock()
        bound._wrapped_tools = {}
        return bound

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
        aliases = alias_tool_input_schema(schema=tool.input_parameters)
        # Defaults stay out of the function declaration (see below), but the
        # validation model needs them: without a default every optional field
        # would be required.
        args_schema = json_schema_to_model(aliases.schema, skip_default=False)
        context = _execution_context(execute_tool)
        wrapped = _WrappedTool(execute_tool, aliases, args_schema)
        with self._lock:
            self._wrapped_tools.setdefault(context, {})[tool.slug] = wrapped

        def function(**kwargs: t.Any) -> t.Dict:
            return _process_execution_result(
                execute_tool(tool.slug, wrapped.arguments_for(kwargs))
            )

        async_execute = getattr(type(execute_tool), "aexecute", None)

        async def async_function(**kwargs: t.Any) -> t.Dict:
            assert async_execute is not None
            result = await async_execute(
                execute_tool, tool.slug, wrapped.arguments_for(kwargs)
            )
            return _process_execution_result(result)

        action_func = async_function if async_execute is not None else function
        action_func.__name__ = tool.slug

        # Build typed signature from JSON schema.
        # Uses get_pydantic_signature_format_from_schema_params (not
        # get_signature_format_from_schema_params) because the pydantic variant
        # goes through json_schema_to_pydantic_type() which produces
        # parameterized generics (e.g. List[str] instead of bare List).
        # The google-genai SDK requires parameterized array types — bare List
        # generates {"type": "ARRAY"} without "items", which the API rejects.
        properties = aliases.schema.get("properties") or {}
        sig_params = [
            param.replace(
                annotation=_afc_annotation(param.annotation, properties.get(param.name))
            )
            for param in get_pydantic_signature_format_from_schema_params(
                schema_params=aliases.schema,
                skip_default=True,
            )
        ]
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

    def handle_response(
        self,
        response: t.Any,
        *,
        user_id: t.Optional[str] = None,
        session: t.Optional[ToolCallSession] = None,
    ) -> tuple[list, bool]:
        """Manually handle function calls in a Gemini response.

        Provided for backward compatibility with code that uses manual function
        calling instead of AFC. For new code, pass the callables from
        ``wrap_tools()`` to ``GenerateContentConfig(tools=...)`` and AFC will
        handle execution automatically.

        A Gemini response does not say which user it belongs to. Pass the
        ``user_id`` given to ``tools.get()``, or the Tool Router ``session``
        whose ``tools()`` produced the tools, and each call runs exactly as
        the matching wrapped tool would, with the same modifiers and session
        routing. Without either, the provider must have wrapped tools for a
        single user or session only; otherwise this raises ``ValueError``.

        Returns:
            tuple: ``(function_responses, executed)`` where *function_responses*
            are ``genai_types.Part`` objects ready to send back, and *executed*
            is ``True`` if any functions were executed.
        """
        parts = [
            _response_part(name, execute_tool(slug=name, arguments=arguments))
            for name, execute_tool, arguments in self._response_calls(
                response, user_id=user_id, session=session
            )
        ]
        return parts, bool(parts)

    async def ahandle_response(
        self,
        response: t.Any,
        *,
        user_id: t.Optional[str] = None,
        session: t.Optional["AsyncToolCallSession"] = None,
    ) -> tuple[list, bool]:
        """Execute a Gemini response using the tools fetched from AsyncComposio."""
        parts = []
        for name, execute_tool, arguments in self._response_calls(
            response, user_id=user_id, session=session
        ):
            async_execute = getattr(type(execute_tool), "aexecute", None)
            if async_execute is None:
                raise RuntimeError(
                    "Fetch tools with AsyncComposio before calling ahandle_response()."
                )
            result = await async_execute(execute_tool, slug=name, arguments=arguments)
            parts.append(_response_part(name, result))
        return parts, bool(parts)

    def _response_calls(
        self,
        response: t.Any,
        *,
        user_id: t.Optional[str],
        session: t.Optional[ToolCallSession],
    ) -> t.Iterator[tuple[str, AgenticProviderExecuteFn, t.Dict[str, t.Any]]]:
        target = (
            None
            if user_id is None and session is None
            else self.resolve_tool_call_execution_target(
                user_id=user_id, session=session
            )
        )

        if not HAS_GENAI:
            return

        if not (hasattr(response, "candidates") and response.candidates):
            return

        candidate = response.candidates[0]
        if not (hasattr(candidate, "content") and candidate.content.parts):
            return

        function_calls = [
            part.function_call
            for part in candidate.content.parts
            if hasattr(part, "function_call") and part.function_call
        ]

        # Pick every wrapped tool before running any call, so a concurrent
        # fetch cannot change who a later call in this response runs as, or
        # which schema checks it.
        with self._lock:
            if not any(
                fc.name in wrapped
                for fc in function_calls
                for wrapped in self._wrapped_tools.values()
            ):
                return
            wrapped_tools = self._wrapped_tools_for(target)
            calls = [
                (fc, wrapped_tools[fc.name])
                for fc in function_calls
                if fc.name in wrapped_tools
            ]

        for fc, wrapped in calls:
            yield fc.name, wrapped.execute_tool, wrapped.arguments_for(dict(fc.args))

    def _wrapped_tools_for(
        self,
        target: t.Optional[ToolCallExecutionTarget],
    ) -> t.Dict[str, _WrappedTool]:
        """Return the tools wrapped for *target*. Call with the lock held."""
        if target is None:
            if len(self._wrapped_tools) > 1:
                raise ValueError(
                    "This provider has wrapped tools for more than one user or "
                    "session, so the user to execute the response as is "
                    "ambiguous. Pass the user the response belongs to: "
                    "handle_response(response, user_id=...) or "
                    "handle_response(response, session=...)."
                )
            return next(iter(self._wrapped_tools.values()), {})

        wrapped_tools = self._wrapped_tools.get(target)
        if wrapped_tools is None:
            source = (
                "composio.tools.get() for this user_id"
                if isinstance(target, str)
                else "this session's tools()"
            )
            raise ValueError(f"This provider has not wrapped any tools from {source}.")
        return wrapped_tools
