from __future__ import annotations

import functools
import typing as t

import typing_extensions as te

if t.TYPE_CHECKING:
    from .tools import Tool, ToolExecutionResponse, tool_execute_params


# TODO: Maybe use `te.Unpack` in tools.execute?
class ToolExecuteParams(te.TypedDict):
    allow_tracing: te.NotRequired[t.Optional[bool]]
    arguments: t.Dict[str, t.Optional[t.Any]]
    connected_account_id: te.NotRequired[str]
    custom_auth_params: te.NotRequired["tool_execute_params.CustomAuthParams"]
    custom_connection_data: te.NotRequired["tool_execute_params.CustomConnectionData"]
    entity_id: te.NotRequired[str]
    text: te.NotRequired[str]
    user_id: te.NotRequired[str]
    version: te.NotRequired[str]
    dangerously_skip_version_check: te.NotRequired[t.Optional[bool]]


ModifierInOut = t.Union["ToolExecuteParams", "ToolExecutionResponse", "Tool"]


class BeforeExecute(t.Protocol):
    """
    A modifier that is called before the tool is executed.
    """

    def __call__(
        self,
        tool: str,
        toolkit: str,
        params: ToolExecuteParams,
    ) -> ToolExecuteParams: ...


class AfterExecute(t.Protocol):
    """
    A modifier that is called after the tool is executed.
    """

    def __call__(
        self,
        tool: str,
        toolkit: str,
        response: ToolExecutionResponse,
    ) -> ToolExecutionResponse: ...


class SchemaModifier(t.Protocol):
    """
    A modifier that is called to modify the schema of the tool.
    """

    def __call__(
        self,
        tool: str,
        toolkit: str,
        schema: "Tool",
    ) -> "Tool": ...


class BeforeFileUploadCallable(t.Protocol):
    """Legacy positional form of the ``before_file_upload`` hook.

    ``(path, tool, toolkit) -> str | bool``. Still supported for back-compat,
    but new code should use :class:`BeforeFileUploadContextCallable` so it can
    discriminate local paths from URLs via ``context["source"]``.
    """

    def __call__(
        self,
        path: str,
        tool: str,
        toolkit: str,
    ) -> t.Union[str, bool]: ...


class BeforeFileUploadContext(te.TypedDict):
    """Context passed to the new-form ``before_file_upload`` hook.

    - ``path``: the local filesystem path for ``source="path"``, or the URL
      string for ``source="url"``.
    - ``source``: discriminator — ``"path"`` for local paths, ``"url"`` for
      ``http(s)://...`` inputs. Mirrors the TypeScript SDK's ``source`` field
      (TS additionally emits ``"file"`` for ``File`` objects; Python has no
      equivalent runtime type).
    - ``tool`` / ``toolkit``: slugs of the tool being executed.
    """

    path: str
    source: te.Literal["path", "url"]
    tool: str
    toolkit: str


class BeforeFileUploadContextCallable(t.Protocol):
    """Preferred form of the ``before_file_upload`` hook.

    Takes a single :class:`BeforeFileUploadContext` argument and returns either
    a new path/URL string, or ``False`` to abort the upload.
    """

    def __call__(
        self,
        context: BeforeFileUploadContext,
    ) -> t.Union[str, bool]: ...


BeforeFileUploadLike = t.Union[
    BeforeFileUploadCallable,
    BeforeFileUploadContextCallable,
]
"""Either form of ``before_file_upload``. Adapted internally."""


def _count_positional_params(fn: t.Callable) -> int:
    """Return the number of positional (or positional-or-keyword) params, or
    -1 if the signature can't be introspected (e.g. builtins)."""
    import inspect

    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return -1
    return sum(
        1
        for p in sig.parameters.values()
        if p.kind
        in (
            inspect.Parameter.POSITIONAL_ONLY,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
        )
    )


def _adapt_before_file_upload(
    hook: BeforeFileUploadLike,
) -> BeforeFileUploadContextCallable:
    """Normalise a user-supplied hook to the context-object form.

    A hook declared with exactly 3 positional parameters is treated as the
    legacy ``(path, tool, toolkit)`` form; anything else (typically a single
    positional ``context`` parameter) is treated as the new form.
    """
    if _count_positional_params(hook) == 3:
        legacy = t.cast(BeforeFileUploadCallable, hook)

        def wrap(context: BeforeFileUploadContext) -> t.Union[str, bool]:
            return legacy(context["path"], context["tool"], context["toolkit"])

        return wrap
    return t.cast(BeforeFileUploadContextCallable, hook)


ModifierSlug: t.TypeAlias = str
AfterExecuteModifierL: t.TypeAlias = t.Literal["after_execute"]
BeforeExecuteModifierL: t.TypeAlias = t.Literal["before_execute"]
SchemaModifierL: t.TypeAlias = t.Literal["schema"]
BeforeFileUploadModifierL: t.TypeAlias = t.Literal["before_file_upload"]


class Modifier:
    def __init__(
        self,
        modifier: t.Optional[
            AfterExecute
            | BeforeExecute
            | SchemaModifier
            | BeforeExecuteMeta
            | AfterExecuteMeta
            | BeforeFileUploadCallable
            | BeforeFileUploadContextCallable
        ],
        type_: (
            AfterExecuteModifierL
            | BeforeExecuteModifierL
            | SchemaModifierL
            | AfterExecuteMetaModifierL
            | BeforeExecuteMetaModifierL
            | BeforeFileUploadModifierL
        ),
        tools: t.List[str],
        toolkits: t.List[str],
    ) -> None:
        self.modifier = modifier
        self.tools = tools
        self.type = type_
        self.toolkits = toolkits

    def apply(
        self,
        toolkit: str,
        tool: str,
        data: ModifierInOut,
        modifer_type: str,
    ) -> ModifierInOut:
        if self.modifier is None:
            raise ValueError("Modifier is not provided")

        # If no tools or toolkits are provided, apply the modifier to all tools
        if (
            self.type == modifer_type
            and len(self.tools) == 0
            and len(self.toolkits) == 0
        ):
            return self.modifier(tool, toolkit, data)  # type: ignore

        # If the modifier is not the same type, or the slug is not in the tools or
        # toolkits, return the data as is
        if (
            self.type != modifer_type
            or tool not in self.tools
            and toolkit not in self.toolkits
        ):
            return data

        # Apply the modifier to the data
        return self.modifier(tool, toolkit, data)  # type: ignore


@t.overload
def after_execute(
    modifier: t.Optional[AfterExecute],
) -> Modifier: ...


@t.overload
def after_execute(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[AfterExecute], Modifier]: ...


def after_execute(
    modifier: t.Optional[AfterExecute] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[AfterExecute], Modifier]:
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="after_execute",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[AfterExecute], Modifier],
            functools.partial(
                after_execute,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


@t.overload
def before_execute(modifier: t.Optional[BeforeExecute]) -> Modifier: ...


@t.overload
def before_execute(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[BeforeExecute], Modifier]: ...


def before_execute(
    modifier: t.Optional[BeforeExecute] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[BeforeExecute], Modifier]:
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="before_execute",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[BeforeExecute], Modifier],
            functools.partial(
                before_execute,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


@t.overload
def before_file_upload(modifier: t.Optional[BeforeFileUploadLike]) -> Modifier: ...


@t.overload
def before_file_upload(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[BeforeFileUploadLike], Modifier]: ...


def before_file_upload(
    modifier: t.Optional[BeforeFileUploadLike] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[BeforeFileUploadLike], Modifier]:
    """
    Build a ``Modifier`` for the file-upload hook (same scoping pattern as
    :func:`before_execute`).

    Your callable may take **either**:

    - a single ``context`` argument (:class:`BeforeFileUploadContext`) — the
      preferred form, exposes ``context["source"]`` (``"path"`` or ``"url"``),
      or
    - three positional arguments ``(path, tool, toolkit)`` — legacy form, kept
      for back-compat.

    Return a new path/URL string to substitute, or ``False`` to abort the
    upload (raises :class:`~composio.exceptions.FileUploadAbortedError`).

    Pass the returned ``Modifier`` in ``modifiers=[...]`` on
    :meth:`composio.core.models.tools.Tools.execute` or ``tools.get``. Multiple
    such modifiers are composed in list order.
    """
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="before_file_upload",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[BeforeFileUploadLike], Modifier],
            functools.partial(
                before_file_upload,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


@t.overload
def schema_modifier(modifier: t.Optional[SchemaModifier]) -> Modifier: ...


@t.overload
def schema_modifier(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[SchemaModifier], Modifier]: ...


def schema_modifier(
    modifier: t.Optional[SchemaModifier] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[SchemaModifier], Modifier]:
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="schema",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[SchemaModifier], Modifier],
            functools.partial(
                schema_modifier,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


@t.overload
def before_execute_meta(modifier: t.Optional[BeforeExecuteMeta]) -> Modifier: ...


@t.overload
def before_execute_meta(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[BeforeExecuteMeta], Modifier]: ...


def before_execute_meta(
    modifier: t.Optional[BeforeExecuteMeta] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[BeforeExecuteMeta], Modifier]:
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="before_execute_meta",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[BeforeExecuteMeta], Modifier],
            functools.partial(
                before_execute_meta,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


@t.overload
def after_execute_meta(modifier: t.Optional[AfterExecuteMeta]) -> Modifier: ...


@t.overload
def after_execute_meta(
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> t.Callable[[AfterExecuteMeta], Modifier]: ...


def after_execute_meta(
    modifier: t.Optional[AfterExecuteMeta] = None,
    *,
    tools: t.Optional[t.List[str]] = None,
    toolkits: t.Optional[t.List[str]] = None,
) -> Modifier | t.Callable[[AfterExecuteMeta], Modifier]:
    if modifier is not None:
        return Modifier(
            modifier=modifier,
            type_="after_execute_meta",
            tools=tools or [],
            toolkits=toolkits or [],
        )

    if tools is not None or toolkits is not None:
        return t.cast(
            t.Callable[[AfterExecuteMeta], Modifier],
            functools.partial(
                after_execute_meta,
                tools=tools or [],
                toolkits=toolkits or [],
            ),
        )

    raise ValueError("Either tools or toolkits must be provided")


Modifiers = t.List[Modifier]


def merge_before_file_upload(
    modifiers: t.Optional[Modifiers],
    tool: str,
    toolkit: str,
) -> t.Optional[BeforeFileUploadContextCallable]:
    """Compose ``before_file_upload``-type :class:`Modifier`\\ s for this *tool* / *toolkit*.

    Scoping matches :class:`Modifier` (empty ``tools`` and ``toolkits`` = all tools).

    Each user-supplied hook is adapted to the context form by
    :func:`_adapt_before_file_upload`, so legacy 3-arg callables keep working
    while new-form callables receive the full :class:`BeforeFileUploadContext`
    (including ``source``).
    """
    to_chain = [
        m
        for m in (modifiers or [])
        if m.type == "before_file_upload" and m.modifier is not None
    ]
    if not to_chain:
        return None

    def _applies(m: Modifier) -> bool:
        if len(m.tools) == 0 and len(m.toolkits) == 0:
            return True
        return tool in m.tools or toolkit in m.toolkits

    adapted_chain = [
        (m, _adapt_before_file_upload(t.cast(BeforeFileUploadLike, m.modifier)))
        for m in to_chain
    ]

    def combined(context: BeforeFileUploadContext) -> t.Union[str, bool]:
        p: str = context["path"]
        for m, hook in adapted_chain:
            if not _applies(m):
                continue
            # Preserve source/tool/toolkit while forwarding the (possibly
            # rewritten) path to the next hook.
            next_ctx: BeforeFileUploadContext = {
                "path": p,
                "source": context["source"],
                "tool": context["tool"],
                "toolkit": context["toolkit"],
            }
            out = hook(next_ctx)
            if out is False:
                return False
            if isinstance(out, str):
                p = out
        return p

    return combined


@t.overload
def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: BeforeExecuteModifierL,
    request: ToolExecuteParams,
) -> ToolExecuteParams: ...


@t.overload
def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: AfterExecuteModifierL,
    response: "ToolExecutionResponse",
) -> "ToolExecutionResponse": ...


@t.overload
def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: t.Literal["schema"],
    schema: "Tool",
) -> "Tool": ...


@t.overload
def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: BeforeExecuteMetaModifierL,
    session_id: str,
    params: t.Dict[str, t.Any],
) -> t.Dict[str, t.Any]: ...


@t.overload
def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: AfterExecuteMetaModifierL,
    session_id: str,
    response: "ToolExecutionResponse",
) -> "ToolExecutionResponse": ...


def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: t.Literal[
        "before_execute",
        "after_execute",
        "schema",
        "before_execute_meta",
        "after_execute_meta",
    ],
    schema: t.Optional["Tool"] = None,
    request: t.Optional["ToolExecuteParams"] = None,
    response: t.Optional["ToolExecutionResponse"] = None,
    session_id: t.Optional[str] = None,
    params: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Union[ModifierInOut, t.Dict[str, t.Any]]:
    """Apply a modifier to a tool."""
    # For meta modifiers, we handle them differently
    if type in ("before_execute_meta", "after_execute_meta"):
        if session_id is None:
            raise ValueError("session_id is required for meta modifiers")

        if type == "before_execute_meta":
            if params is None:
                raise ValueError("params is required for before_execute_meta")
            result_params: t.Dict[str, t.Any] = params
            for modifier in modifiers:
                if modifier.type == type:
                    # Check if modifier should be applied
                    should_apply = (
                        (len(modifier.tools) == 0 and len(modifier.toolkits) == 0)
                        or tool in modifier.tools
                        or toolkit in modifier.toolkits
                    )

                    if should_apply and modifier.modifier is not None:
                        result_params = t.cast(BeforeExecuteMeta, modifier.modifier)(
                            tool, toolkit, session_id, result_params
                        )
            return result_params
        else:  # after_execute_meta
            if response is None:
                raise ValueError("response is required for after_execute_meta")
            result_response: "ToolExecutionResponse" = response
            for modifier in modifiers:
                if modifier.type == type:
                    # Check if modifier should be applied
                    should_apply = (
                        (len(modifier.tools) == 0 and len(modifier.toolkits) == 0)
                        or tool in modifier.tools
                        or toolkit in modifier.toolkits
                    )

                    if should_apply and modifier.modifier is not None:
                        result_response = t.cast(AfterExecuteMeta, modifier.modifier)(
                            tool, toolkit, session_id, result_response
                        )
            return result_response

    # For regular modifiers
    result: ModifierInOut
    if schema is not None:
        result = schema
    elif request is not None:
        result = request
    elif response is not None:
        result = response
    else:
        raise ValueError("No data provided")

    for modifier in modifiers:
        result = modifier.apply(
            toolkit=toolkit,
            tool=tool,
            data=result,
            modifer_type=type,
        )
    return result


class BeforeExecuteMeta(t.Protocol):
    """
    A modifier that is called before the meta tool is executed in a session context.
    """

    def __call__(
        self,
        tool: str,
        toolkit: str,
        session_id: str,
        params: t.Dict[str, t.Any],
    ) -> t.Dict[str, t.Any]: ...


class AfterExecuteMeta(t.Protocol):
    """
    A modifier that is called after the meta tool is executed in a session context.
    """

    def __call__(
        self,
        tool: str,
        toolkit: str,
        session_id: str,
        response: ToolExecutionResponse,
    ) -> ToolExecutionResponse: ...


AfterExecuteMetaModifierL: t.TypeAlias = t.Literal["after_execute_meta"]
BeforeExecuteMetaModifierL: t.TypeAlias = t.Literal["before_execute_meta"]


class ToolOptions(te.TypedDict):
    modify_schema: te.NotRequired[
        t.Dict[ModifierSlug, AfterExecute | BeforeExecute | SchemaModifier]
    ]
