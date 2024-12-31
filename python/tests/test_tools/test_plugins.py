from composio import Action, App
from composio.client.enums.base import ActionData
from composio.tools.local.base import action
import composio_openai
import composio_crewai
import composio_langchain
import composio_llamaindex


def test_openai_toolset():
    toolset = composio_openai.ComposioToolSet()

    @composio_openai.action(toolname="my_tool")
    def create_draft(
        message_body: str,
        thread_id: str | None = None,
    ) -> dict:
        """
        Create a draft reply to a specific Gmail thread

        :param thread_id: The ID of the thread to which the reply is to be drafted
        :param message_body: The content of the draft reply
        :return draft: The created draft details
        """
        return {}

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
                        "thread_id": {
                            "description": "The ID of the thread to which the reply is to be "
                            "drafted. Please provide a value of type string.",
                            "title": "Thread Id",
                            # TODO: this seems wrong, why both type and anyof
                            "type": "string",
                            "default": None,
                            "anyOf": [
                                {"type": "string"},
                                {"type": "null"},
                            ],
                        },
                    },
                    "required": [
                        "message_body",
                    ],
                    "title": "CreateDraftRequest",
                    "type": "object",
                },
            },
            "type": "function",
        },
    ]
