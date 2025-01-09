import composio_llamaindex
from pydantic import BaseModel

from composio import action
from composio.client.enums.action import Action

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
                "description": "A Tool That Allows Interaction With The Screen, Keyboard, And "
                "Mouse Of The Current Computer. Adapted For Mac Os And Linux.",
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
    assert (
        tool.description
        == "Tool Name: computer\nTool Arguments: {'action': {'description': 'The action to perform on the computer. Please provide a value of type string. This parameter is required. Please provide a value of type string. This parameter is required.', 'type': 'str'}, 'text': {'description': 'Text to type or key sequence to press. Please provide a value of type string. Please provide a value of type string.', 'type': 'str'}, 'coordinate': {'description': 'X,Y coordinates for mouse actions', 'type': 'list'}}\nTool Description: A Tool That Allows Interaction With The Screen, Keyboard, And Mouse Of The Current Computer. Adapted For Mac Os And Linux."
    )
    assert tool.args_schema.model_json_schema() == {
        "properties": {
            "action": {
                "description": "The action to perform on the computer. Please provide a value of "
                "type string. This parameter is required. Please provide a value "
                "of type string. This parameter is required.",
                "examples": [],
                "title": "Action",
                "type": "string",
            },
            "coordinate": {
                "default": None,
                "description": "X,Y coordinates for mouse actions",
                "examples": [],
                "items": {},
                "title": "Coordinate",
                "type": "array",
            },
            "text": {
                "default": None,
                "description": "Text to type or key sequence to press. Please provide a value of "
                "type string. Please provide a value of type string.",
                "examples": [],
                "title": "Text",
                "type": "string",
            },
        },
        "required": ["action"],
        "title": "ComputerRequest",
        "type": "object",
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
        == "A Tool That Allows Interaction With The Screen, Keyboard, And Mouse Of The Current Computer. Adapted For Mac Os And Linux."
    )
    assert tool.args_schema.model_json_schema() == {
        "properties": {
            "action": {
                # TODO: "please provide" and "is required" is there 3 times
                "description": "The action to perform on the computer. Please provide a value of "
                "type string. This parameter is required. Please provide a value "
                "of type string. This parameter is required. Please provide a "
                "value of type string. This parameter is required.",
                "examples": [],
                "title": "Action",
                "type": "string",
            },
            "coordinate": {
                "default": None,
                "description": "X,Y coordinates for mouse actions",
                "examples": [],
                "items": {},
                "title": "Coordinate",
                "type": "array",
            },
            "text": {
                "default": None,
                # TODO: "please provide" is there 3 times
                "description": "Text to type or key sequence to press. Please provide a value of "
                "type string. Please provide a value of type string. Please "
                "provide a value of type string.",
                "examples": [],
                "title": "Text",
                "type": "string",
            },
        },
        "required": ["action"],
        # TODO: title should be computer
        "title": "ComputerRequest",
        "type": "object",
    }


def test_claude_toolset() -> None:
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
        # TODO: title should be MYTOOL_CREATE_DRAFT
        "title": "CreateDraftRequest",
        "type": "object",
    }

    tools = toolset.get_tools(actions=[Action.ANTHROPIC_COMPUTER])
    assert len(tools) == 1

    tool = tools[0]
    assert (
        tool.description
        == "Tool Name: computer\nTool Arguments: {'action': {'description': 'The action to perform on the computer. Please provide a value of type string. This parameter is required. Please provide a value of type string. This parameter is required. Please provide a value of type string. This parameter is required. Please provide a value of type string. This parameter is required.', 'type': 'str'}, 'text': {'description': 'Text to type or key sequence to press. Please provide a value of type string. Please provide a value of type string. Please provide a value of type string. Please provide a value of type string.', 'type': 'str'}, 'coordinate': {'description': 'X,Y coordinates for mouse actions', 'type': 'list'}}\nTool Description: A Tool That Allows Interaction With The Screen, Keyboard, And Mouse Of The Current Computer. Adapted For Mac Os And Linux."
    )
    assert tool.args_schema.model_json_schema() == {
        "properties": {
            "action": {
                # TODO: "please provide" and "is required" is there FOUR TIMES
                "description": "The action to perform on the computer. Please provide a value of "
                "type string. This parameter is required. Please provide a value "
                "of type string. This parameter is required. Please provide a "
                "value of type string. This parameter is required. Please provide "
                "a value of type string. This parameter is required.",
                "examples": [],
                "title": "Action",
                "type": "string",
            },
            "coordinate": {
                "default": None,
                "description": "X,Y coordinates for mouse actions",
                "examples": [],
                "items": {},
                "title": "Coordinate",
                "type": "array",
            },
            "text": {
                "default": None,
                # TODO: "please provide" is there FOUR TIMES
                "description": "Text to type or key sequence to press. Please provide a value of "
                "type string. Please provide a value of type string. Please "
                "provide a value of type string. Please provide a value of type string.",
                "examples": [],
                "title": "Text",
                "type": "string",
            },
        },
        "required": ["action"],
        # TODO: title should be computer
        "title": "ComputerRequest",
        "type": "object",
    }


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
        == "A Tool That Allows Interaction With The Screen, Keyboard, And Mouse Of The Current Computer. Adapted For Mac Os And Linux."
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
