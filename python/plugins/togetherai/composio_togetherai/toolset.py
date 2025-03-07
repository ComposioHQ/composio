import json
import typing as t

from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam
from together.types.chat_completions import (
    ChatCompletionChunk,
    ChatCompletionResponse,
    ToolCalls,
)

from composio import ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.exceptions import InvalidEntityIdError
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.schema import OpenAISchema, SchemaType
from composio.tools.toolset import ProcessorsType


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="togetherai",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Together AI framework.
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
                "initialization and handling tool calls"
            )
        if self.entity_id != DEFAULT_ENTITY_ID:
            entity_id = self.entity_id
        return entity_id

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[t.Dict[str, t.Any]]:
        """
        Get composio tools wrapped as Together AI compatible tool parameters.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags

        :return: Composio tools wrapped in Together AI compatible format
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

    def execute_tool_call(
        self,
        tool_call: t.Union[ChatCompletionMessageToolCall, ToolCalls],
        entity_id: t.Optional[str] = None,
        check_requested_actions: bool = True,
    ) -> t.Dict:
        """
        Execute a tool call.

        :param tool_call: Tool call metadata.
        :param entity_id: Entity ID to use for executing the function call.
        :return: Object containing output data from the tool call.
        """
        if not tool_call.function:
            raise ValueError("Tool call function is None")
        return self.execute_action(
            action=t.cast(ActionType, tool_call.function.name),
            params=json.loads(tool_call.function.arguments or "{}"),
            entity_id=entity_id or self.entity_id,
            _check_requested_actions=check_requested_actions,
        )

    def handle_tool_calls(
        self,
        response: t.Union[ChatCompletionResponse, t.Iterator[ChatCompletionChunk]],
        entity_id: t.Optional[str] = None,
        check_requested_actions: bool = True,
    ) -> t.List[t.Dict]:
        """
        Handle tool calls from Together AI chat completion response.

        :param response: Chat completion response object or iterator of chunks from
                        Together AI chat completions API
        :param entity_id: Entity ID to use for executing the function calls
        :return: A list of output objects from the function calls
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        outputs = []
        if isinstance(response, t.Iterator):
            chunk: ChatCompletionChunk = next(response)
            completion: ChatCompletionResponse = ChatCompletionResponse(
                **chunk.model_dump()
            )
        else:
            completion = response
        if completion.choices:
            for choice in completion.choices:
                if choice.message and choice.message.tool_calls:
                    for tool_call in choice.message.tool_calls:
                        outputs.append(
                            self.execute_tool_call(
                                tool_call=tool_call,
                                entity_id=entity_id or self.entity_id,
                                check_requested_actions=check_requested_actions,
                            )
                        )
        return outputs
