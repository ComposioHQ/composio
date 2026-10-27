"""Gemini provider for Composio SDK.

Returns Python callables compatible with google-genai's Automatic Function
Calling (AFC). The SDK can introspect the callable's signature to derive
FunctionDeclaration schemas and auto-execute tool calls in the chat loop.
"""

import functools
import types as pytypes
import typing as t
from inspect import Parameter, Signature

from pydantic import BaseModel

from composio.client.types import Tool
from composio.core.provider import AgenticProvider, ToolCallSession
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Modifiers
from composio.utils.shared import (
    ToolSchemaAliases,
    alias_tool_input_schema,
    get_pydantic_signature_format_from_schema_params,
    json_schema_to_model,
    normalize_tool_arguments,
    validate_and_serialize_tool_arguments,
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


_AMBIGUOUS = object()
"""Marks a slug wrapped for more than one execution context."""


def _execution_context(execute_tool: AgenticProviderExecuteFn) -> object:
    """Identify who a wrapped tool executes as.

    ``tools.get(user_id=...)`` binds the user into a ``functools.partial``, so
    two fetches for the same user share a context. Any other execute function,
    such as a Tool Router session's, is its own context.
    """
    if isinstance(execute_tool, functools.partial):
        user_id = execute_tool.keywords.get("user_id")
        if user_id is not None:
            return ("user_id", user_id)
    return execute_tool


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
        self._executors: t.Dict[
            str,
            t.Tuple[AgenticProviderExecuteFn, ToolSchemaAliases, t.Type[BaseModel]],
        ] = {}
        # The execution context each slug was wrapped for, or ``_AMBIGUOUS``
        # once it has been wrapped for two, so ``handle_response`` never runs a
        # call as whichever user fetched the tools last.
        self._executor_contexts: t.Dict[str, object] = {}

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
        self._executors[tool.slug] = (execute_tool, aliases, args_schema)
        context = _execution_context(execute_tool)
        if self._executor_contexts.setdefault(tool.slug, context) != context:
            self._executor_contexts[tool.slug] = _AMBIGUOUS

        def function(**kwargs: t.Any) -> t.Dict:
            """Composio tool execution wrapper."""
            kwargs = _to_serializable(kwargs)
            kwargs = validate_and_serialize_tool_arguments(
                args_schema,
                normalize_tool_arguments(kwargs),
            )
            kwargs = aliases.restore_arguments(kwargs)
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
        modifiers: t.Optional[Modifiers] = None,
        session: t.Optional[ToolCallSession] = None,
    ) -> tuple[list, bool]:
        """Manually handle function calls in a Gemini response.

        Provided for backward compatibility with code that uses manual function
        calling instead of AFC. For new code, pass the callables from
        ``wrap_tools()`` to ``GenerateContentConfig(tools=...)`` and AFC will
        handle execution automatically.

        A Gemini response does not say which user it belongs to. Pass the
        ``user_id`` the tools were fetched for, or the Tool Router ``session``
        that produced them, and every call runs for that target. Direct
        execution with ``user_id`` applies ``modifiers`` passed here, not the
        ones given to ``tools.get()``. Without a target, each call runs through
        the executor stored when its tool was wrapped; that raises if the tool
        was wrapped for more than one user or session.

        Returns:
            tuple: ``(function_responses, executed)`` where *function_responses*
            are ``genai_types.Part`` objects ready to send back, and *executed*
            is ``True`` if any functions were executed.
        """
        target = (
            None
            if user_id is None and session is None
            else self.resolve_tool_call_execution_target(
                user_id=user_id, session=session
            )
        )
        if modifiers is not None and user_id is None:
            raise ValueError("modifiers can only be used with user_id")

        if not HAS_GENAI:
            return [], False

        if not (hasattr(response, "candidates") and response.candidates):
            return [], False

        candidate = response.candidates[0]
        if not (hasattr(candidate, "content") and candidate.content.parts):
            return [], False

        function_calls = [
            part.function_call
            for part in candidate.content.parts
            if hasattr(part, "function_call")
            and part.function_call
            and part.function_call.name in self._executors
        ]
        if target is None:
            ambiguous = sorted(
                {
                    fc.name
                    for fc in function_calls
                    if self._executor_contexts.get(fc.name) is _AMBIGUOUS
                }
            )
            if ambiguous:
                raise ValueError(
                    f"Tools {ambiguous} were fetched for more than one user or "
                    "session, so the user to execute them for is ambiguous. "
                    "Pass the user the response belongs to: "
                    "handle_response(response, user_id=...) or "
                    "handle_response(response, session=...)."
                )

        function_responses: list = []
        for fc in function_calls:
            # Same validate -> serialize -> alias sequence as the AFC callable.
            execute_tool, aliases, args_schema = self._executors[fc.name]
            arguments = validate_and_serialize_tool_arguments(
                args_schema,
                normalize_tool_arguments(_to_serializable(dict(fc.args))),
            )
            arguments = aliases.restore_arguments(arguments)
            result = (
                execute_tool(slug=fc.name, arguments=arguments)
                if target is None
                else self.execute_tool_for_target(
                    target=target,
                    slug=fc.name,
                    arguments=arguments,
                    modifiers=modifiers,
                )
            )
            processed = _process_execution_result(result)

            function_responses.append(
                genai_types.Part(
                    function_response=genai_types.FunctionResponse(
                        name=fc.name, response=processed
                    )
                )
            )

        return function_responses, bool(function_responses)
