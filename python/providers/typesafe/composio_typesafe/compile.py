"""Compiles Composio tools into Jev questions."""

from __future__ import annotations

import typing as t

import typing_extensions as te
from pydantic import BaseModel, StrictStr
from pydantic import ValidationError as PydanticValidationError

from composio.client.types import Tool
from composio.utils.json_schema import dereference_json_schema

from .classify import classify_property, parse_property
from .keys import (
    NONE_KEY,
    NOT_STATED_KEY,
    NULL_KEY,
    build_options,
    option_key,
    option_label,
)
from .types import (
    TypesafeArgumentQuestion,
    TypesafeArrayArgument,
    TypesafeChoiceQuestion,
    TypesafeDuplicateToolError,
    TypesafeNoulQuestion,
    TypesafeOption,
    TypesafeRisk,
    TypesafeToolQuestions,
    TypesafeToolSet,
)


class _InputParameters(BaseModel):
    properties: t.Dict[StrictStr, t.Any] = {}
    required: t.List[StrictStr] = []


def _parse_input_parameters(schema: t.Any) -> _InputParameters:
    try:
        return _InputParameters.model_validate(schema)
    except PydanticValidationError:
        return _InputParameters()


def by_code_unit(name: str) -> bytes:
    """Sort key for UTF-16 code-unit order, which is how JavaScript compares strings."""
    return name.encode("utf-16-be", "surrogatepass")


def _risk_of(tool: Tool) -> TypesafeRisk:
    tags = getattr(tool, "tags", None) or []
    if "destructiveHint" in tags:
        return "destructive"
    return "read_only" if "readOnlyHint" in tags else "mutating"


def _with_description(sentence: str, description: str) -> str:
    return f"{sentence} {description}" if description else sentence


def _choice_question(
    tool_name: str,
    argument: str,
    description: str,
    options: t.Sequence[TypesafeOption],
    option_text: t.Callable[[TypesafeOption], str],
) -> TypesafeChoiceQuestion:
    criteria = {option["key"]: option_text(option) for option in options}
    criteria[NOT_STATED_KEY] = f'The request does not state a value for "{argument}".'
    return {
        "type": "choice",
        "instructions": _with_description(
            f'For the tool "{tool_name}", which value of "{argument}" does the '
            "request state?",
            description,
        ),
        "criteria": criteria,
    }


def _enum_option_text(argument: str, option: TypesafeOption) -> str:
    if option["value"] is None:
        return f'The request explicitly asks for no value (null) for "{argument}".'
    return f'The value "{option_label(option["value"])}" for "{argument}".'


def _compile_argument(
    tool_name: str,
    argument: str,
    index: int,
    required: bool,
    prop: t.Mapping[str, t.Any],
) -> t.Optional[TypesafeArgumentQuestion]:
    argument_class = classify_property(prop)
    description = prop.get("description", "")
    question_id = f"a{index}"

    if argument_class["kind"] == "open":
        return None

    if argument_class["kind"] == "boolean":
        flags: t.List[TypesafeOption] = [
            {"key": "yes", "value": True},
            {"key": "no", "value": False},
        ]
        return {
            "kind": "choice",
            "name": argument,
            "required": required,
            "questionId": question_id,
            "question": _choice_question(
                tool_name,
                argument,
                description,
                flags,
                lambda option: (
                    f'The request states that "{argument}" is true.'
                    if option["value"] is True
                    else f'The request states that "{argument}" is false.'
                ),
            ),
            "options": flags,
            "notStatedKey": NOT_STATED_KEY,
        }

    if argument_class["kind"] == "enum":
        options = build_options(argument_class["values"])
        if argument_class["nullable"]:
            options.append({"key": NULL_KEY, "value": None})
        return {
            "kind": "choice",
            "name": argument,
            "required": required,
            "questionId": question_id,
            "question": _choice_question(
                tool_name,
                argument,
                description,
                options,
                lambda option: _enum_option_text(argument, option),
            ),
            "options": options,
            "notStatedKey": NOT_STATED_KEY,
        }

    mentioned: TypesafeNoulQuestion = {
        "type": "noul",
        "instructions": _with_description(
            f'For the tool "{tool_name}", does the request state which values '
            f'"{argument}" should contain?',
            description,
        ),
    }
    compiled: TypesafeArrayArgument = {
        "kind": "array",
        "name": argument,
        "required": required,
        "mentionedId": f"{question_id}_mentioned",
        "mentioned": mentioned,
        "members": [
            {
                "questionId": f"{question_id}_m{member_index}",
                "value": value,
                "question": {
                    "type": "noul",
                    "instructions": f'For the tool "{tool_name}", does the request '
                    f'state that "{argument}" should include the value '
                    f'"{option_label(value)}"?',
                },
            }
            for member_index, value in enumerate(argument_class["values"])
        ],
    }
    if "maxItems" in argument_class:
        compiled["maxItems"] = t.cast(int, argument_class["maxItems"])
    return compiled


def routing_description_of(tool: Tool) -> str:
    """The text of a tool's option in the routing Choice."""
    tool_description = getattr(tool, "description", None) or ""
    return f"{tool.name}: {tool_description}" if tool_description else tool.name


def compile_tool(tool: Tool) -> TypesafeToolQuestions:
    """Compiles one tool. What it cannot read in a schema is open-ended."""
    dereferenced = dereference_json_schema(
        getattr(tool, "input_parameters", None) or {"type": "object", "properties": {}},
        on_unresolved="sentinel",
    )
    parsed = _parse_input_parameters(dereferenced)
    names = sorted(parsed.properties, key=by_code_unit)
    # `required` is a set, and a name with no matching property is ignored.
    required_set = set(parsed.required)

    compiled: t.List[TypesafeArgumentQuestion] = []
    open_ended: t.List[str] = []
    for index, argument in enumerate(names):
        prop = parse_property(parsed.properties[argument])
        question = (
            None
            if prop is None
            else _compile_argument(
                tool.name, argument, index, argument in required_set, prop
            )
        )
        if question is None:
            open_ended.append(argument)
        else:
            compiled.append(question)

    # Keys are inserted in the TypeScript SDK's order, so both serialize a tool identically.
    result: t.Dict[str, t.Any] = {
        "slug": tool.slug,
        "name": tool.name,
        "routingDescription": routing_description_of(tool),
    }
    version = getattr(tool, "version", None)
    if version:
        result["version"] = version
    result["risk"] = _risk_of(tool)
    result["arguments"] = compiled
    result["openEnded"] = open_ended
    result["required"] = [name for name in names if name in required_set]
    return t.cast(TypesafeToolQuestions, result)


def compile_tool_set(tools: t.Sequence[TypesafeToolQuestions]) -> TypesafeToolSet:
    if len({tool["slug"] for tool in tools}) != len(tools):
        raise TypesafeDuplicateToolError()
    return {"tools": list(tools)}


ROUTING_QUESTION_ID = "route"


class RoutingQuestion(te.TypedDict):
    question: TypesafeChoiceQuestion
    keys: t.List[str]


def routing_question(tools: t.Sequence[t.Mapping[str, t.Any]]) -> RoutingQuestion:
    """The routing Choice over a tool set, with the keys needed to read its answer."""
    keys = [option_key(tool["slug"], index) for index, tool in enumerate(tools)]
    criteria = {
        key: t.cast(str, tool["routingDescription"]) for key, tool in zip(keys, tools)
    }
    criteria[NONE_KEY] = "None of these tools carries out the request."
    return {
        "question": {
            "type": "choice",
            "instructions": "Which tool carries out what the user asks for?",
            "criteria": criteria,
        },
        "keys": keys,
    }
