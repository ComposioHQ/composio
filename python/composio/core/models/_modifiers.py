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


ModifierSlug: t.TypeAlias = str
AfterExecuteModifierL: t.TypeAlias = t.Literal["after_execute"]
BeforeExecuteModifierL: t.TypeAlias = t.Literal["before_execute"]
SchemaModifierL: t.TypeAlias = t.Literal["schema"]


class Modifier:
    def __init__(
        self,
        modifier: t.Optional[
            AfterExecute
            | BeforeExecute
            | SchemaModifier
            | BeforeExecuteMeta
            | AfterExecuteMeta
        ],
        type_: (
            AfterExecuteModifierL
            | BeforeExecuteModifierL
            | SchemaModifierL
            | AfterExecuteMetaModifierL
            | BeforeExecuteMetaModifierL
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
