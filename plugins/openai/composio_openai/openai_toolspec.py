import json
import logging
import os
import time
from typing import List, Union

from openai import Client
from openai.types.beta import thread
from openai.types.beta.threads import run
from openai.types.chat.chat_completion import ChatCompletion

from composio import Action, App, ComposioCore, FrameworkEnum, Tag
from composio.sdk import SchemaFormat, format_schema


logger = logging.getLogger(__name__)


class OpenaiStyleToolsetBase:
    def __init__(
        self, framework, entity_id: str = "default", schema_format=SchemaFormat.OPENAI
    ):
        """
        Initialize the OpenaiStyleToolsetBase.

        Args:
            framework (FrameworkEnum): The framework to use for the session.
            entity_id (str, optional): The ID of the entity for which to execute the action. Defaults to "default".
            schema_format (SchemaFormat, optional): The format to use for the schema. Defaults to SchemaFormat.OPENAI.
        """
        self.entity_id = entity_id
        self.client = ComposioCore(
            framework=framework, api_key=os.environ.get("COMPOSIO_API_KEY")
        )
        self.schema_format = schema_format

    def finalize_entity_id(self, entity_id):
        """
        Finalize the entity ID.

        Args:
            entity_id (str): The ID of the entity for which to execute the action.

        Returns:
            str: The finalized entity ID.
        """
        if (
            self.entity_id != "default"
            and entity_id != "default"
            and self.entity_id != entity_id
        ):
            raise ValueError(
                "Seperate `entity_id` can not be provided during intialization and handelling tool calls"
            )
        elif self.entity_id != "default":
            entity_id = self.entity_id
        return entity_id

    def get_actions(self, actions: Union[Action, List[Action]]):
        """
        Retrieves a list of action schemas from the Composio API.

        Args:
            actions (Union[Action, List[Action]]): A list of Action enum instances to filter the actions by. If None, all actions are retrieved.

        Returns:
            list[dict[str, any]]: A list of action schemas.
        """
        if isinstance(actions, Action):
            actions = [actions]

        action_schemas = self.client.sdk.get_list_of_actions(actions=actions)

        formatted_schemas = [
            format_schema(action_schema, format=self.schema_format)
            for action_schema in action_schemas
        ]
        return formatted_schemas

    def get_tools(
        self, tools: Union[App, List[App]], tags: List[Union[str, Tag]] = None
    ):
        """
        Retrieves a list of tool schemas from the Composio API.

        Args:
            tools (Union[App, List[App]]): A list of App enum instances to filter the tools by. If None, all tools are retrieved.
            tags (List[Union[str, Tag]], optional): A list of tags to filter the tools by. If None, all tags are retrieved.

        Returns:
            list[dict[str, any]]: A list of tool schemas.
        """
        if isinstance(tools, App):
            tools = [tools]

        action_schemas = self.client.sdk.get_list_of_actions(apps=tools, tags=tags)
        formatted_schemas = [
            format_schema(action_schema, format=self.schema_format)
            for action_schema in action_schemas
        ]
        return formatted_schemas


class ComposioToolset(OpenaiStyleToolsetBase):
    def __init__(self, *args, framework=FrameworkEnum.OPENAI, **kwargs):
        super().__init__(*args, framework=framework, **kwargs)

    def execute_tool_call(self, tool_call, entity_id):
        """
        Execute a tool call.

        Args:
            tool_call (ToolCall): The tool call to execute.
            entity_id (str): The ID of the entity for which to execute the action.

        Returns:
            list: A list of outputs from the action.
        """
        action_name_to_execute = tool_call.function.name
        action = self.client.sdk.get_action_enum_without_tool(
            action_name=action_name_to_execute
        )
        arguments = json.loads(tool_call.function.arguments)
        tool_response = self.client.execute_action(
            action=action, params=arguments, entity_id=entity_id
        )
        return tool_response

    def handle_tool_calls(
        self, llm_response: ChatCompletion, entity_id: str = "default"
    ) -> list[any]:
        """
        Handle tool calls in the OpenAI response.

        Args:
            llm_response (ChatCompletion): The response from the OpenAI model.
            entity_id (str, optional): The ID of the entity for which to execute the action. Defaults to "default".

        Returns:
            list: A list of outputs from the action.
        """
        outputs = []
        entity_id = self.finalize_entity_id(entity_id)

        try:
            if llm_response.choices:
                for choice in llm_response.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            tool_response = self.execute_tool_call(tool_call, entity_id)
                            outputs.append(tool_response)

        except Exception as e:
            raise e from e

        return outputs

    def handle_assistant_tool_calls(
        self, run_object, entity_id: str = "default"
    ) -> list[any]:
        """
        Handle tool calls in the OpenAI response.

        Args:
            run_object (run): The run object to handle.
            entity_id (str, optional): The ID of the entity for which to execute the action. Defaults to "default".

        Returns:
            list: A list of outputs from the action.
        """
        if (
            self.entity_id != "default"
            and entity_id != "default"
            and self.entity_id != entity_id
        ):
            raise ValueError(
                "Seperate `entity_id` can not be provided during intialization and handelling tool calls"
            )
        elif self.entity_id != "default":
            entity_id = self.entity_id

        tool_calls = run_object["required_action"]["submit_tool_outputs"]["tool_calls"]
        tool_outputs = []
        for tool_call in tool_calls:
            tool_response = self.execute_tool_call(tool_call, entity_id)
            tool_output = {
                "tool_call_id": tool_call.id,
                "output": json.dumps(tool_response),
            }
            tool_outputs.append(tool_output)
        return tool_outputs

    def wait_and_handle_assistant_tool_calls(
        self,
        client: Client,
        run: run,
        thread: thread,
        verbose: bool = False,
    ):
        """
        Wait and handle assistant tool calls.

        Args:
            client (Client): The OpenAI client.
            run (run): The run object to handle.
            thread (thread): The thread object to handle.
            verbose (bool, optional): Whether to print the status of the run. Defaults to False.

        Returns:
            run: The run object.
        """
        run_object = run
        thread_object = thread
        while run_object.status in ("queued", "in_progress", "requires_action"):
            # Look here
            if run_object.status == "requires_action":
                run_object = client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                    tool_outputs=self.handle_assistant_tool_calls(run_object),
                )
            else:
                run_object = client.beta.threads.runs.retrieve(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                )
                time.sleep(0.5)
        return run_object


if __name__ == "__main__":
    from pprint import pprint

    toolset = ComposioToolset()
    out = toolset.get_tools(tools=App.GITHUB)
    pprint(out)
