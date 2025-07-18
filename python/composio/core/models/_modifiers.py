from __future__ import annotations

import functools
import typing as t

import typing_extensions as te

if t.TYPE_CHECKING:
    from .tools import Tool, ToolExecutionResponse, tool_execute_params


# TODO: Maybe use `te.Unpack` in tools.execute?
class ToolExecuteParams(te.TypedDict):
    arguments: t.Dict
    connected_account_id: t.Optional[str]
    custom_auth_params: t.Optional["tool_execute_params.CustomAuthParams"]
    custom_connection_data: t.Optional["tool_execute_params.CustomConnectionData"]
    user_id: t.Optional[str]
    text: t.Optional[str]
    version: t.Optional[str]


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
        modifier: t.Optional[AfterExecute | BeforeExecute | SchemaModifier],
        type_: AfterExecuteModifierL | BeforeExecuteModifierL | SchemaModifierL,
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


def apply_modifier_by_type(
    modifiers: Modifiers,
    toolkit: str,
    tool: str,
    *,
    type: t.Literal["before_execute", "after_execute", "schema"],
    schema: t.Optional["Tool"] = None,
    request: t.Optional["ToolExecuteParams"] = None,
    response: t.Optional["ToolExecutionResponse"] = None,
) -> ModifierInOut:
    """Apply a modifier to a tool."""
    data = schema or request or response
    if data is None:
        raise ValueError("No data provided")

    for modifier in modifiers:
        data = modifier.apply(
            toolkit=toolkit,
            tool=tool,
            data=data,
            modifer_type=type,
        )
    return data


class ToolOptions(te.TypedDict):
    modify_schema: te.NotRequired[
        t.Dict[ModifierSlug, AfterExecute | BeforeExecute | SchemaModifier]
    ]
