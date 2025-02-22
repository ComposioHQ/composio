import composio_llamaindex
import pytest
from pydantic import BaseModel, ValidationError

from composio import action
from composio.client.enums.action import Action
from composio.exceptions import ComposioSDKError

import composio_claude
import composio_crewai
import composio_langchain
import composio_openai


class Thread(BaseModel):
    id: str


@action(toolname="my_tool")
def create_draft(
    message_body: str,
    thread: Thread | None = None,
) -> dict:
    """
    Create a draft reply to a specific Gmail thread

    :param thread: The thread to which the reply is to be drafted
    :param message_body: The content of the draft reply
    :return draft: The created draft details
    """
    _ = message_body, thread
    return {}


def test_openai_toolset() -> None:
    toolset = composio_openai.ComposioToolSet()

    tools = toolset.get_tools(actions=[create_draft])
    assert tools == [
        {
            "function": {
                "description": "Create a draft reply to a specific Gmail thread",
                "name": "MYTOOL_CREATE_DRAFT",
                "parameters": {
                    "properties": {
                        "message_body": {
                            "description": "The content of the draft reply. Please provide a "
                            "value of type string. This parameter is required.",
                            "title": "Message Body",
                            "type": "string",
                        },
                        "thread": {
                            "anyOf": [
                                {
                                    "properties": {
                                        "id": {
                                            "title": "Id",
                                            "type": "string",
                                        },
                                    },
                                    "required": ["id"],
                                    "title": "Thread",
                                    "type": "object",
                                },
                                {"type": "null"},
                            ],
                            "default": None,
                            "description": "The thread to which the reply is to be drafted",
                            "type": "object",
                        },
                    },
                    "required": ["message_body"],
                    "title": "CreateDraftRequest",
                    "type": "object",
                },
            },
            "type": "function",
        },
    ]

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert tools == [
        {
            "function": {
                "description": "A tool that allows interaction with the screen, keyboard, and "
                "mouse of the current computer. adapted for macos and linux.",
                "name": "computer",
                "parameters": {
                    "properties": {
                        "action": {
                            "description": "The action to perform on the computer. Please provide "
                            "a value of type string. This parameter is required.",
                            "enum": [
                                "key",
                                "type",
                                "mouse_move",
                                "left_click",
                                "left_click_drag",
                                "right_click",
                                "middle_click",
                                "double_click",
                                "screenshot",
                                "cursor_position",
                            ],
                            "title": "ActionType",
                            "type": "string",
                        },
                        "coordinate": {
                            "anyOf": [
                                {
                                    "maxItems": 2,
                                    "minItems": 2,
                                    "prefixItems": [
                                        {"type": "integer"},
                                        {"type": "integer"},
                                    ],
                                    "type": "array",
                                },
                                {"type": "null"},
                            ],
                            "default": None,
                            "description": "X,Y coordinates for mouse actions",
                            "title": "Coordinate",
                            "type": "array",
                        },
                        "text": {
                            "anyOf": [
                                {"type": "string"},
                                {"type": "null"},
                            ],
                            "default": None,
                            "description": "Text to type or key sequence to press. Please provide "
                            "a value of type string.",
                            "title": "Text",
                            "type": "string",
                        },
                    },
                    "required": ["action"],
                    "title": "ComputerRequest",
                    "type": "object",
                },
            },
            "type": "function",
        },
    ]


def test_crewai_toolset() -> None:
    toolset = composio_crewai.ComposioToolSet()

    tools = toolset.get_tools(actions=[create_draft])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.name == "MYTOOL_CREATE_DRAFT"
    assert (
        tool.description
        # TODO: Thread's properties should be present in the arguments
        == "Tool Name: MYTOOL_CREATE_DRAFT\nTool Arguments: {'message_body': {'description': 'The content of the draft reply. Please provide a value of type string. This parameter is required.', 'type': 'str'}, 'thread': {'description': 'The thread to which the reply is to be drafted', 'type': 'dict'}}\nTool Description: Create a draft reply to a specific Gmail thread"
    )
    assert tool.args_schema.model_json_schema() == {
        "properties": {
            "message_body": {
                "description": "The content of the draft reply. Please provide a value of type "
                "string. This parameter is required.",
                "examples": [],
                "title": "Message Body",
                "type": "string",
            },
            "thread": {
                "default": None,
                "description": "The thread to which the reply is to be drafted",
                "examples": [],
                "title": "Thread",
                # TODO: Thread's properties should be present in the schema
                "type": "object",
            },
        },
        "required": ["message_body"],
        "title": "CreateDraftRequest",
        "type": "object",
    }

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.description == (
        "Tool Name: computer\nTool Arguments: {'action': {'description': 'The "
        "action to perform on the computer. Please provide a value of type string. "
        "This parameter is required.', 'type': 'str'}, 'text': {'description': "
        "'Text to type or key sequence to press. Please provide a value of "
        "type string.', 'type': 'str'}, 'coordinate': {'description': "
        "'X,Y coordinates for mouse actions', 'type': 'list'}}\nTool "
        "Description: A tool that allows interaction with the screen, "
        "keyboard, and mouse of the current computer. adapted for macos and linux."
    )
    assert set(tool.args_schema.model_json_schema().get("properties", {}).keys()) == {
        "action",
        "text",
        "coordinate",
    }


def test_langchain_toolset() -> None:
    toolset = composio_langchain.ComposioToolSet()

    tools = toolset.get_tools(actions=[create_draft])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.name == "MYTOOL_CREATE_DRAFT"
    # TODO: there's no schema in this description
    assert tool.description == "Create a draft reply to a specific Gmail thread"
    assert tool.args_schema.model_json_schema() == {
        "properties": {
            "message_body": {
                "description": "The content of the draft reply. Please provide a value of type "
                "string. This parameter is required.",
                "examples": [],
                "title": "Message Body",
                "type": "string",
            },
            "thread": {
                "default": None,
                "description": "The thread to which the reply is to be drafted",
                "examples": [],
                "title": "Thread",
                "type": "object",
            },
        },
        "required": ["message_body"],
        # TODO: title should be MYTOOL_CREATE_DRAFT
        "title": "CreateDraftRequest",
        "type": "object",
    }

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert len(tools) == 1

    tool = tools[0]
    assert (
        tool.description
        == "A tool that allows interaction with the screen, keyboard, and mouse of the current computer. adapted for macos and linux."
    )

    assert set(tool.args_schema.model_json_schema().get("properties", {}).keys()) == {
        "action",
        "text",
        "coordinate",
    }


def test_claude_toolset() -> None:
    toolset = composio_claude.ComposioToolSet()

    tools = toolset.get_tools(actions=[create_draft])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.get("name") == "MYTOOL_CREATE_DRAFT"
    assert (
        tool.get("description")
        # TODO: Thread's properties should be present in the arguments
        == "Create a draft reply to a specific Gmail thread"
    )
    assert tool.get("input_schema", {}) == {
        "properties": {
            "message_body": {
                "description": "The content of the draft reply. Please provide a value of type string. This parameter is required.",
                "title": "Message Body",
                "type": "string",
            },
            "thread": {
                "anyOf": [
                    {
                        "properties": {"id": {"title": "Id", "type": "string"}},
                        "required": ["id"],
                        "title": "Thread",
                        "type": "object",
                    },
                    {"type": "null"},
                ],
                "default": None,
                "description": "The thread to which the reply is to be drafted",
                "type": "object",
            },
        },
        "title": "CreateDraftRequest",
        "type": "object",
        "required": ["message_body"],
    }

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.get("name") == "computer"
    assert set(tool.get("input_schema").get("properties", {}).keys()) == {
        "action",
        "text",
        "coordinate",
    }

    # check that objects that cannot be casted into Message type raise an error.
    wrong_type_response = "some_random_value_from_llm"
    with pytest.raises(
        expected_exception=ComposioSDKError,
        match=(
            "llm_response should be of type `Message` or castable to type `Message`, "
            f"received object {wrong_type_response} of type {type(wrong_type_response)}"
        ),
    ):
        toolset.handle_tool_calls(llm_response=wrong_type_response)

    random_llm_response = {"some_random_key_from_llm": "some_random_value_from_llm"}
    with pytest.raises(
        expected_exception=ValidationError,
        match=None,
    ):
        toolset.handle_tool_calls(llm_response=random_llm_response)


def test_llamaindex_toolset() -> None:
    toolset = composio_llamaindex.ComposioToolSet()

    tools = toolset.get_tools(actions=[create_draft])
    assert len(tools) == 1

    tool = tools[0]
    assert tool.metadata.name == "MYTOOL_CREATE_DRAFT"
    assert (
        tool.metadata.description == "Create a draft reply to a specific Gmail thread"
    )
    assert tool.metadata.fn_schema is not None
    assert tool.metadata.fn_schema.model_json_schema() == {
        "properties": {
            "message_body": {
                # TODO: description missing
                "title": "Message Body",
                "type": "string",
            },
            "thread": {
                "default": None,
                # TODO: description missing
                "title": "Thread",
                "type": "object",
            },
        },
        "required": ["message_body"],
        "title": "MYTOOL_CREATE_DRAFT",
        "type": "object",
    }

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert len(tools) == 1

    tool = tools[0]
    assert (
        tool.metadata.description
        == "A tool that allows interaction with the screen, keyboard, and mouse of the current computer. adapted for macos and linux."
    )
    assert tool.metadata.fn_schema is not None
    assert tool.metadata.fn_schema.model_json_schema() == {
        "properties": {
            "action": {
                # TODO: description missing
                "title": "Action",
                "type": "string",
            },
            "coordinate": {
                "default": None,
                # TODO: description missing
                "items": {},
                "title": "Coordinate",
                "type": "array",
            },
            "text": {
                "default": None,
                # TODO: description missing
                "title": "Text",
                "type": "string",
            },
        },
        "required": ["action"],
        "title": "computer",
        "type": "object",
    }
