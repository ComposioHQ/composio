"""
OpenAI tool spec.
"""

import json
import time
import typing as t
import warnings

import typing_extensions as te
from openai import Client
from openai.types.beta.thread import Thread
from openai.types.beta.threads.run import RequiredAction, Run
from openai.types.chat.chat_completion import ChatCompletion
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

from composio import ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.exceptions import InvalidEntityIdError
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.schema import OpenAISchema, SchemaType
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="openai",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for OpenAI framework.

    Example:
    ```python
        import dotenv
        from composio_openai import App, ComposioToolSet
        from openai import OpenAI


        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize tools.
        openai_client = OpenAI()
        composio_tools = ComposioToolSet()

        # Define task.
        task = "Star a repo composiohq/composio on GitHub"

        # Get GitHub tools that are pre-configured
        actions = composio_toolset.get_tools(apps=[App.GITHUB])

        # Get response from the LLM
        response = openai_client.chat.completions.create(
            model="gpt-4-turbo-preview",
            tools=actions,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": task},
            ],
        )
        print(response)

        # Execute the function calls.
        result = composio_tools.handle_calls(response)
        print(result)
    ```
    """

    schema = SchemaType.OPENAI

    def validate_entity_id(self, entity_id: str) -> str:
        """Validate entity ID."""
        if (
            self.entity_id != DEFAULT_ENTITY_ID
            and entity_id != DEFAULT_ENTITY_ID
            and self.entity_id != entity_id
        ):
            raise InvalidEntityIdError(
                "separate `entity_id` can not be provided during "
                "initialization and handelling tool calls"
            )
        if self.entity_id != DEFAULT_ENTITY_ID:
            entity_id = self.entity_id
        return entity_id

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self, actions: t.Sequence[ActionType]
    ) -> t.List[ChatCompletionToolParam]:
        """
        Get composio tools wrapped as OpenAI `ChatCompletionToolParam` objects.

        :param actions: List of actions to wrap
        :return: Composio tools wrapped as `ChatCompletionToolParam` objects
        """
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tools(actions=actions)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[ChatCompletionToolParam]:
        """
        Get composio tools wrapped as OpenAI `ChatCompletionToolParam` objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags

        :return: Composio tools wrapped as `ChatCompletionToolParam` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)
        return [
            ChatCompletionToolParam(  # type: ignore
                **t.cast(
                    OpenAISchema,
                    self.schema.format(
                        schema.model_dump(
                            exclude_none=True,
                        )
                    ),
                ).model_dump()
            )
            for schema in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]

    def get_realtime_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
    ) -> t.List[t.Dict]:
        """
        Get composio tools wrapped as OpenAI `ChatCompletionToolParam` objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags

        :return: Composio tools wrapped as `ChatCompletionToolParam` objects
        """
        tools = self.get_tools(actions=actions, apps=apps, tags=tags)
        return [
            {
                "type": "function",
                "name": tool["function"]["name"],
                "description": tool["function"].get("description", ""),
                "parameters": tool["function"].get("parameters", {}),
            }
            for tool in tools
        ]

    def execute_tool_call(
        self,
        tool_call: ChatCompletionMessageToolCall,
        entity_id: t.Optional[str] = None,
        check_requested_actions: bool = True,
    ) -> t.Dict:
        """
        Execute a tool call.

        :param tool_call: Tool call metadata.
        :param entity_id: Entity ID to use for executing the function call.
        :return: Object containing output data from the tool call.
        """
        return self.execute_action(
            action=tool_call.function.name,
            params=json.loads(tool_call.function.arguments),
            entity_id=entity_id or self.entity_id,
            _check_requested_actions=check_requested_actions,
        )

    def handle_tool_calls(
        self,
        response: ChatCompletion,
        entity_id: t.Optional[str] = None,
        check_requested_actions: bool = True,
    ) -> t.List[t.Dict]:
        """
        Handle tool calls from OpenAI chat completion object.

        :param response: Chat completion object from
                        openai.OpenAI.chat.completions.create function call
        :param entity_id: Entity ID to use for executing the function call.
        :return: A list of output objects from the function calls.
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        outputs = []
        if response.choices:
            for choice in response.choices:
                if choice.message.tool_calls:
                    for tool_call in choice.message.tool_calls:
                        outputs.append(
                            self.execute_tool_call(
                                tool_call=tool_call,
                                entity_id=entity_id or self.entity_id,
                                check_requested_actions=check_requested_actions,
                            )
                        )
        return outputs

    def handle_assistant_tool_calls(
        self,
        run: Run,
        entity_id: t.Optional[str] = None,
        check_requested_actions: bool = True,
    ) -> t.List:
        """Wait and handle assistant function calls"""
        tool_outputs = []
        for tool_call in t.cast(
            RequiredAction, run.required_action
        ).submit_tool_outputs.tool_calls:
            tool_response = self.execute_tool_call(
                tool_call=t.cast(ChatCompletionMessageToolCall, tool_call),
                entity_id=entity_id or self.entity_id,
                check_requested_actions=check_requested_actions,
            )
            tool_output = {
                "tool_call_id": tool_call.id,
                "output": json.dumps(tool_response),
            }
            tool_outputs.append(tool_output)
        return tool_outputs

    def wait_and_handle_assistant_tool_calls(
        self,
        client: Client,
        run: Run,
        thread: Thread,
        entity_id: t.Optional[str] = None,
    ) -> Run:
        """Wait and handle assistant function calls"""
        thread_object = thread
        while run.status in ("queued", "in_progress", "requires_action"):
            if run.status == "requires_action":
                run = client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread_object.id,
                    run_id=run.id,
                    tool_outputs=self.handle_assistant_tool_calls(
                        run=run,
                        entity_id=entity_id or self.entity_id,
                    ),
                )
            else:
                run = client.beta.threads.runs.retrieve(
                    thread_id=thread_object.id,
                    run_id=run.id,
                )
                time.sleep(0.5)
        return run
