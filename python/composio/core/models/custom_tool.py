"""Custom tools and toolkits for tool router sessions.

Decorator API for defining custom tools that run in-process alongside
remote Composio tools. Accessed via ``composio.experimental``.

Usage::

    from pydantic import BaseModel, Field
    from composio import Composio

    composio = Composio()

    class GrepInput(BaseModel):
        pattern: str = Field(description="Pattern to search for")

    @composio.experimental.tool()
    def grep(input: GrepInput, ctx):
        \"\"\"Search for a pattern in local files.\"\"\"
        return {"matches": []}

    dev_tools = composio.experimental.Toolkit(
        slug="DEV_TOOLS",
        name="Dev Tools",
        description="Local dev utilities",
    )

    @dev_tools.tool()
    def search_code(input: GrepInput, ctx):
        \"\"\"Search developer resources.\"\"\"
        return {"results": []}

    session = composio.create(
        user_id="default",
        experimental={
            "custom_tools": [grep],
            "custom_toolkits": [dev_tools],
        },
    )
"""

from __future__ import annotations

import asyncio
import inspect
import typing as t

from pydantic import BaseModel

from composio.exceptions import ValidationError

from .custom_tool_types import (
    LOCAL_TOOL_PREFIX,
    MAX_SLUG_LENGTH,
    SLUG_REGEX,
    CustomTool,
    CustomToolExecuteFn,
    CustomToolsMap,
    CustomToolsMapEntry,
)

if t.TYPE_CHECKING:
    from composio_client.types.tool_router.session_create_response import (
        Experimental as SessionCreateResponseExperimental,
    )


# ────────────────────────────────────────────────────────────────
# Slug validation helpers
# ────────────────────────────────────────────────────────────────


def _validate_slug(slug: str, context: str) -> str:
    """Validate a custom tool or toolkit slug."""
    if not slug:
        raise ValidationError(f"{context}: slug is required")

    if not SLUG_REGEX.match(slug):
        raise ValidationError(
            f"{context}: slug must only contain alphanumeric characters, "
            f"underscores, and hyphens"
        )

    upper = slug.upper()
    if upper.startswith("LOCAL_"):
        raise ValidationError(
            f'{context}: slug must not start with "LOCAL_" — '
            f"this prefix is reserved for internal routing."
        )
    if upper.startswith("COMPOSIO_"):
        raise ValidationError(
            f'{context}: slug must not start with "COMPOSIO_" — '
            f"this prefix is reserved for Composio meta tools."
        )

    return slug


def _compute_final_slug_length(tool_slug: str, toolkit_slug: t.Optional[str]) -> int:
    """Compute the final slug length: LOCAL_[TOOLKIT_]SLUG."""
    length = len(LOCAL_TOOL_PREFIX) + len(tool_slug)
    if toolkit_slug:
        length += len(toolkit_slug) + 1  # +1 for underscore separator
    return length


def _validate_slug_length(
    tool_slug: str, toolkit_slug: t.Optional[str], context: str
) -> None:
    """Validate that the final slug won't exceed the max length."""
    final_length = _compute_final_slug_length(tool_slug, toolkit_slug)
    if final_length > MAX_SLUG_LENGTH:
        prefix = LOCAL_TOOL_PREFIX + (
            f"{toolkit_slug.upper()}_" if toolkit_slug else ""
        )
        available = MAX_SLUG_LENGTH - len(prefix)
        raise ValidationError(
            f'{context}: slug "{tool_slug}" is too long. '
            f'With prefix "{prefix}", the final slug would be {final_length} '
            f"characters (max {MAX_SLUG_LENGTH}). "
            f"Shorten the slug to at most {available} characters."
        )


def _build_final_slug(tool_slug: str, toolkit_slug: t.Optional[str] = None) -> str:
    """Build the final slug: LOCAL_[TOOLKIT_]SLUG."""
    upper = tool_slug.upper()
    if toolkit_slug:
        return f"{LOCAL_TOOL_PREFIX}{toolkit_slug.upper()}_{upper}"
    return f"{LOCAL_TOOL_PREFIX}{upper}"


def _get_input_json_schema(model: t.Type[BaseModel]) -> t.Dict[str, t.Any]:
    """Convert a Pydantic model class to a JSON Schema dict suitable for the backend."""
    full_schema = model.model_json_schema()
    schema: t.Dict[str, t.Any] = {"type": "object"}
    if "properties" in full_schema:
        schema["properties"] = full_schema["properties"]
    if "required" in full_schema:
        schema["required"] = full_schema["required"]
    if "$defs" in full_schema:
        schema["$defs"] = full_schema["$defs"]
    return schema


# ────────────────────────────────────────────────────────────────
# Internal tool creation (used by decorator API)
# ────────────────────────────────────────────────────────────────


def _create_tool(
    slug: str,
    *,
    name: str,
    description: str,
    input_params: t.Type[BaseModel],
    execute: CustomToolExecuteFn,
    extends_toolkit: t.Optional[str] = None,
    output_params: t.Optional[t.Type[BaseModel]] = None,
) -> CustomTool:
    """Internal: create and validate a CustomTool."""
    context = "experimental.tool"

    _validate_slug(slug, context)

    if not name:
        raise ValidationError(f"{context}: name is required")
    if not description:
        raise ValidationError(f"{context}: description is required")

    if not isinstance(input_params, type) or not issubclass(input_params, BaseModel):
        raise ValidationError(
            f"{context}: input_params must be a Pydantic BaseModel subclass. "
            f"Tool input parameters are always an object with named properties."
        )

    try:
        from pydantic import RootModel

        if issubclass(input_params, RootModel):
            raise ValidationError(
                f"{context}: input_params must be a regular BaseModel with named fields, "
                f"not a RootModel. Tool input parameters are always an object with "
                f"named properties."
            )
    except ImportError:
        pass

    if not callable(execute):
        raise ValidationError(f"{context}: execute must be a callable")

    if asyncio.iscoroutinefunction(execute):
        raise ValidationError(
            f"{context}: execute must be a synchronous function, not async. "
            f"The Composio Python SDK is synchronous — use a regular "
            f"'def fn(input, ctx)' instead of 'async def'."
        )

    _validate_slug_length(slug, extends_toolkit, context)

    input_schema = _get_input_json_schema(input_params)

    output_schema: t.Optional[t.Dict[str, t.Any]] = None
    if output_params is not None:
        if not isinstance(output_params, type) or not issubclass(
            output_params, BaseModel
        ):
            raise ValidationError(
                f"{context}: output_params must be a Pydantic BaseModel subclass"
            )
        output_schema = output_params.model_json_schema()

    return CustomTool(
        slug=slug,
        name=name,
        description=description,
        extends_toolkit=extends_toolkit,
        input_schema=input_schema,
        output_schema=output_schema,
        input_params=input_params,
        execute=execute,
    )


def _get_caller_locals(depth: int = 2) -> t.Optional[t.Mapping[str, t.Any]]:
    """Best-effort lookup of a caller frame's locals."""
    frame = inspect.currentframe()
    try:
        caller = frame
        for _ in range(depth):
            caller = caller.f_back if caller is not None else None
        return caller.f_locals if caller is not None else None
    finally:
        del frame


def _resolve_function_annotations(
    fn: t.Callable[..., t.Any],
    *,
    localns: t.Optional[t.Mapping[str, t.Any]] = None,
) -> t.Dict[str, t.Any]:
    """Resolve annotations, including postponed string annotations when possible."""
    try:
        return t.get_type_hints(
            fn,
            globalns=getattr(fn, "__globals__", {}),
            localns=dict(localns) if localns is not None else None,
            include_extras=True,
        )
    except Exception:
        return {}


def _infer_tool_from_function(
    fn: t.Callable[..., t.Any],
    *,
    slug: t.Optional[str] = None,
    name: t.Optional[str] = None,
    description: t.Optional[str] = None,
    extends_toolkit: t.Optional[str] = None,
    output_params: t.Optional[t.Type[BaseModel]] = None,
    annotation_locals: t.Optional[t.Mapping[str, t.Any]] = None,
) -> CustomTool:
    """Create a CustomTool by inferring metadata from a decorated function.

    - slug: from ``fn.__name__.upper()``
    - name: from ``fn.__name__`` humanized
    - description: from ``fn.__doc__``
    - input_params: from the first parameter with a BaseModel type annotation
    """
    # Infer slug
    actual_slug = slug or fn.__name__.upper()
    actual_name = name or fn.__name__.replace("_", " ").title()
    actual_description = description or inspect.cleandoc(fn.__doc__ or "")

    if not actual_description:
        raise ValidationError(
            f"experimental.tool: description is required. "
            f'Add a docstring to "{fn.__name__}" or pass description=...'
        )

    # Validate and infer function signature.
    # Accepted shapes (consistent with TS CustomToolExecuteFn):
    #   (input: BaseModel)          — no session context needed
    #   (input: BaseModel, ctx)     — with session context
    # The first param MUST be annotated with a BaseModel subclass.
    # Reject async before wrapping (wrapper would hide it from _create_tool)
    if asyncio.iscoroutinefunction(fn):
        raise ValidationError(
            f'experimental.tool: "{fn.__name__}" is async. '
            f"The Composio Python SDK is synchronous — use a regular "
            f"'def {fn.__name__}(input, ctx)' instead of 'async def'."
        )

    sig = inspect.signature(fn)
    params = list(sig.parameters.values())
    resolved_annotations = _resolve_function_annotations(
        fn,
        localns=annotation_locals,
    )

    if not params:
        raise ValidationError(
            f'experimental.tool: "{fn.__name__}" must accept at least one parameter '
            f"annotated with a Pydantic BaseModel subclass, e.g. "
            f"def {fn.__name__}(input: MyInput, ctx): ..."
        )

    if len(params) > 2:
        raise ValidationError(
            f'experimental.tool: "{fn.__name__}" accepts {len(params)} parameters, '
            f"but custom tools accept at most 2: (input: BaseModel, ctx). "
            f"Extra parameters will not be populated at runtime."
        )

    # First param must be the input model
    first = params[0]
    first_annotation = resolved_annotations.get(first.name, first.annotation)
    if first_annotation is inspect.Parameter.empty or not (
        isinstance(first_annotation, type) and issubclass(first_annotation, BaseModel)
    ):
        raise ValidationError(
            f'experimental.tool: first parameter of "{fn.__name__}" must be annotated '
            f"with a Pydantic BaseModel subclass. Got: {first_annotation!r}. "
            f"Expected: def {fn.__name__}(input: MyInput, ctx): ..."
        )
    input_params: t.Type[BaseModel] = first_annotation

    # Wrap function to match CustomToolExecuteFn: (input, ctx) -> dict
    if len(params) == 1:

        def execute(input: t.Any, ctx: t.Any) -> t.Dict[str, t.Any]:
            return fn(input)
    else:
        execute = fn

    return _create_tool(
        slug=actual_slug,
        name=actual_name,
        description=actual_description,
        input_params=input_params,
        execute=execute,
        extends_toolkit=extends_toolkit,
        output_params=output_params,
    )


# ────────────────────────────────────────────────────────────────
# ExperimentalToolkit — custom toolkit with .tool() decorator
# ────────────────────────────────────────────────────────────────


class ExperimentalToolkit:
    """Custom toolkit that groups related tools under one namespace.

    Use ``@toolkit.tool()`` to add tools. Pass the toolkit to
    ``composio.create(experimental={"custom_toolkits": [toolkit]})``.

    Tools added to a toolkit must NOT use ``extends_toolkit`` — they
    inherit the toolkit identity instead.

    Example::

        dev_tools = composio.experimental.Toolkit(
            slug="DEV_TOOLS",
            name="Dev Tools",
            description="Local dev utilities",
        )

        @dev_tools.tool()
        def search_code(input: SearchInput, ctx):
            \"\"\"Search developer resources.\"\"\"
            return {"results": []}
    """

    def __init__(self, *, slug: str, name: str, description: str) -> None:
        context = "experimental.Toolkit"
        _validate_slug(slug, context)
        if not name:
            raise ValidationError(f"{context}: name is required")
        if not description:
            raise ValidationError(f"{context}: description is required")

        self.slug = slug
        self.name = name
        self.description = description
        self._tools: t.List[CustomTool] = []

    @property
    def tools(self) -> t.Tuple[CustomTool, ...]:
        return tuple(self._tools)

    @t.overload
    def tool(self, fn: t.Callable[..., t.Any], /) -> CustomTool: ...

    @t.overload
    def tool(
        self,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
    ) -> t.Callable[[t.Callable[..., t.Any]], CustomTool]: ...

    def tool(
        self,
        fn: t.Optional[t.Callable[..., t.Any]] = None,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
    ) -> t.Union[CustomTool, t.Callable[[t.Callable[..., t.Any]], CustomTool]]:
        """Decorator to add a tool to this toolkit.

        Infers slug, name, description, and input_params from the function
        if not explicitly provided.
        """

        def decorator(f: t.Callable[..., t.Any]) -> CustomTool:
            annotation_locals = _get_caller_locals()
            custom_tool = _infer_tool_from_function(
                f,
                slug=slug,
                name=name,
                description=description,
                output_params=output_params,
                annotation_locals=annotation_locals,
                # No extends_toolkit for toolkit tools
            )
            _validate_slug_length(
                custom_tool.slug, self.slug, f'experimental.Toolkit("{self.slug}").tool'
            )
            self._tools.append(custom_tool)
            return custom_tool

        if fn is not None:
            custom_tool = _infer_tool_from_function(
                fn,
                slug=slug,
                name=name,
                description=description,
                output_params=output_params,
                annotation_locals=_get_caller_locals(),
            )
            _validate_slug_length(
                custom_tool.slug,
                self.slug,
                f'experimental.Toolkit("{self.slug}").tool',
            )
            self._tools.append(custom_tool)
            return custom_tool
        return decorator


# ────────────────────────────────────────────────────────────────
# ExperimentalAPI — the composio.experimental namespace
# ────────────────────────────────────────────────────────────────


class ExperimentalAPI:
    """Experimental APIs accessed via ``composio.experimental``.

    Provides decorators for creating custom tools and toolkits
    that run in-process alongside remote Composio tools.
    """

    Toolkit = ExperimentalToolkit

    @t.overload
    def tool(self, fn: t.Callable[..., t.Any], /) -> CustomTool: ...

    @t.overload
    def tool(
        self,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        extends_toolkit: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
    ) -> t.Callable[[t.Callable[..., t.Any]], CustomTool]: ...

    def tool(
        self,
        fn: t.Optional[t.Callable[..., t.Any]] = None,
        *,
        slug: t.Optional[str] = None,
        name: t.Optional[str] = None,
        description: t.Optional[str] = None,
        extends_toolkit: t.Optional[str] = None,
        output_params: t.Optional[t.Type[BaseModel]] = None,
    ) -> t.Union[CustomTool, t.Callable[[t.Callable[..., t.Any]], CustomTool]]:
        """Decorator to create a custom tool from a function.

        Infers slug, name, description, and input_params from the function.
        Override any with explicit keyword arguments.

        Examples::

            # Bare decorator — no parens
            @composio.experimental.tool
            def grep(input: GrepInput, ctx):
                \"\"\"Search for a pattern.\"\"\"
                return {"matches": []}

            # With parens — no args
            @composio.experimental.tool()
            def grep(input: GrepInput, ctx):
                \"\"\"Search for a pattern.\"\"\"
                return {"matches": []}

            # With extends_toolkit — inherits auth
            @composio.experimental.tool(extends_toolkit="gmail")
            def create_draft(input: DraftInput, ctx):
                \"\"\"Create a Gmail draft.\"\"\"
                return ctx.proxy_execute(toolkit="gmail", ...)
        """

        def decorator(f: t.Callable[..., t.Any]) -> CustomTool:
            annotation_locals = _get_caller_locals()
            return _infer_tool_from_function(
                f,
                slug=slug,
                name=name,
                description=description,
                extends_toolkit=extends_toolkit,
                output_params=output_params,
                annotation_locals=annotation_locals,
            )

        if fn is not None:
            return _infer_tool_from_function(
                fn,
                slug=slug,
                name=name,
                description=description,
                extends_toolkit=extends_toolkit,
                output_params=output_params,
                annotation_locals=_get_caller_locals(),
            )
        return decorator


# ────────────────────────────────────────────────────────────────
# Serialization (for backend API payload)
# ────────────────────────────────────────────────────────────────


def serialize_custom_tools(tools: t.List[CustomTool]) -> t.List[t.Dict[str, t.Any]]:
    """Serialize custom tools into the format expected by the backend."""
    result = []
    for tool in tools:
        entry: t.Dict[str, t.Any] = {
            "slug": tool.slug,
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }
        if tool.output_schema:
            entry["output_schema"] = tool.output_schema
        if tool.extends_toolkit:
            entry["extends_toolkit"] = tool.extends_toolkit
        result.append(entry)
    return result


def serialize_custom_toolkits(
    toolkits: t.Sequence[ExperimentalToolkit],
) -> t.List[t.Dict[str, t.Any]]:
    """Serialize custom toolkits into the format expected by the backend."""
    result = []
    for tk in toolkits:
        toolkit_tools = []
        for tool in tk.tools:
            entry: t.Dict[str, t.Any] = {
                "slug": tool.slug,
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            if tool.output_schema:
                entry["output_schema"] = tool.output_schema
            toolkit_tools.append(entry)
        result.append(
            {
                "slug": tk.slug,
                "name": tk.name,
                "description": tk.description,
                "tools": toolkit_tools,
            }
        )
    return result


# ────────────────────────────────────────────────────────────────
# Routing map builders
# ────────────────────────────────────────────────────────────────


def build_custom_tools_map(
    tools: t.List[CustomTool],
    toolkits: t.Optional[t.List[ExperimentalToolkit]] = None,
) -> CustomToolsMap:
    """Build a CustomToolsMap from custom tools and toolkits."""
    by_final_slug: t.Dict[str, CustomToolsMapEntry] = {}
    by_original_slug: t.Dict[str, CustomToolsMapEntry] = {}

    def add_entry(
        handle: CustomTool, final_slug: str, toolkit: t.Optional[str]
    ) -> None:
        original_slug = handle.slug.upper()

        if len(final_slug) > MAX_SLUG_LENGTH:
            raise ValidationError(
                f'Custom tool slug "{handle.slug}" produces final slug '
                f'"{final_slug}" which exceeds {MAX_SLUG_LENGTH} characters.'
            )

        if final_slug in by_final_slug:
            raise ValidationError(
                f'Custom tool slug collision: "{final_slug}" is already registered.'
            )

        if original_slug in by_original_slug:
            existing = by_original_slug[original_slug]
            raise ValidationError(
                f'Custom tool slug collision: original slug "{handle.slug}" '
                f"maps to multiple final slugs. "
                f'"{existing.final_slug}" and "{final_slug}" both resolve '
                f'from "{original_slug}".'
            )

        entry = CustomToolsMapEntry(
            handle=handle, final_slug=final_slug, toolkit=toolkit
        )
        by_final_slug[final_slug] = entry
        by_original_slug[original_slug] = entry

    # Process standalone tools
    for handle in tools:
        add_entry(
            handle,
            _build_final_slug(handle.slug, handle.extends_toolkit),
            handle.extends_toolkit,
        )

    # Process toolkit tools
    if toolkits:
        for tk in toolkits:
            for handle in tk.tools:
                add_entry(handle, _build_final_slug(handle.slug, tk.slug), tk.slug)

    return CustomToolsMap(
        by_final_slug=by_final_slug,
        by_original_slug=by_original_slug,
        toolkits=list(toolkits) if toolkits else None,
    )


def build_custom_tools_map_from_response(
    tools: t.List[CustomTool],
    toolkits: t.Optional[t.List[ExperimentalToolkit]],
    experimental: t.Optional[SessionCreateResponseExperimental],
) -> CustomToolsMap:
    """Build a CustomToolsMap using the slug/original_slug mapping from the backend response."""
    by_final_slug: t.Dict[str, CustomToolsMapEntry] = {}
    by_original_slug: t.Dict[str, CustomToolsMapEntry] = {}

    # Build lookup from original slug -> handle + toolkit
    handles_by_original: t.Dict[str, t.Tuple[CustomTool, t.Optional[str]]] = {}
    for handle in tools:
        key = handle.slug.upper()
        if key in handles_by_original:
            raise ValidationError(
                f'Duplicate custom tool slug "{handle.slug}" — '
                f"each tool must have a unique slug across all custom tools and toolkits."
            )
        handles_by_original[key] = (handle, handle.extends_toolkit)
    if toolkits:
        for tk in toolkits:
            for handle in tk.tools:
                key = handle.slug.upper()
                if key in handles_by_original:
                    raise ValidationError(
                        f'Duplicate custom tool slug "{handle.slug}" — '
                        f"each tool must have a unique slug across all custom tools and toolkits."
                    )
                handles_by_original[key] = (handle, tk.slug)

    def add_entry(
        final_slug: str, original_slug: str, toolkit: t.Optional[str]
    ) -> None:
        match = handles_by_original.get(original_slug.upper())
        if not match:
            return
        handle, default_toolkit = match
        resolved_toolkit = toolkit if toolkit is not None else default_toolkit
        entry = CustomToolsMapEntry(
            handle=handle, final_slug=final_slug, toolkit=resolved_toolkit
        )
        by_final_slug[final_slug.upper()] = entry
        by_original_slug[original_slug.upper()] = entry

    if experimental and experimental.custom_tools:
        for ct in experimental.custom_tools:
            add_entry(ct.slug, ct.original_slug, ct.extends_toolkit)

    if experimental and experimental.custom_toolkits:
        for ctk in experimental.custom_toolkits:
            for ctk_tool in ctk.tools:
                add_entry(ctk_tool.slug, ctk_tool.original_slug, ctk.slug)

    return CustomToolsMap(
        by_final_slug=by_final_slug,
        by_original_slug=by_original_slug,
        toolkits=list(toolkits) if toolkits else None,
    )
