import typing as t
import warnings

import typing_extensions as te

from composio.exceptions import (
    ErrorProcessingToolExecutionRequest,
    InvalidEntityIdError,
)
from composio.utils import help_msg


try:
    from anthropic.types.beta.tools import ToolUseBlock, ToolsBetaMessage
    from anthropic.types.beta.tools.tool_param import ToolParam

    class BetaToolUseBlock:  # type: ignore
        pass

except ModuleNotFoundError:
    from anthropic.types.tool_use_block import ToolUseBlock
    from anthropic.types.tool_param import ToolParam
    from anthropic.types.message import Message as ToolsBetaMessage
    from anthropic.types.beta.beta_tool_use_block import BetaToolUseBlock  # type: ignore

from composio import Action, ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.schema import ClaudeSchema, SchemaType
from composio.tools.toolset import ProcessorsType


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="claude",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Anthropic Claude platform.

    Example:
    ```python
        import anthropic
        import dotenv
        from composio_claude import App, ComposioToolSet


        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize tools.
        claude_client = anthropic.Anthropic()
        composio_tools = ComposioToolSet()

        # Define task.
        task = "Star a repo composiohq/composio on GitHub"

        # Get GitHub tools that are pre-configured
        actions = composio_toolset.get_tools(tools=[App.GITHUB])

        # Get response from the LLM
        response = claude_client.beta.tools.messages.create(
            model="claude-3-opus-20240229",
            max_tokens=1024,
            tools=composio_tools,
            messages=[
                {"role": "user", "content": "Star me composiohq/composio repo in github."},
            ],
        )
        print(response)

        # Execute the function calls.
        result = composio_tools.handle_calls(response)
        print(result)
    ```
    """

    schema = SchemaType.CLAUDE

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
    def get_actions(self, actions: t.Sequence[ActionType]) -> t.List[ToolParam]:
        """
        Get composio tools wrapped as `ToolParam` objects.

        :param actions: List of actions to wrap
        :return: Composio tools wrapped as `ToolParam` objects
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
    ) -> t.List[ToolParam]:
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
            ToolParam(
                **t.cast(
                    ClaudeSchema,
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
        tool_call: ToolUseBlock,
        entity_id: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute a tool call.

        :param tool_call: Tool call metadata.
        :param entity_id: Entity ID to use for executing function calls.
        :return: Object containing output data from the tool call.
        """
        return self.execute_action(
            action=Action(value=tool_call.name),
            params=t.cast(t.Dict, tool_call.input),
            entity_id=entity_id or self.entity_id,
            _check_requested_actions=True,
        )

    def handle_tool_calls(
        self,
        llm_response: t.Union[dict, ToolsBetaMessage],
        entity_id: t.Optional[str] = None,
    ) -> t.List[t.Dict]:
        """
        Handle tool calls from OpenAI chat completion object.

        :param response: Chat completion object from
                        openai.OpenAI.chat.completions.create function call
        :param entity_id: Entity ID to use for executing function calls.
        :return: A list of output objects from the function calls.
        """
        # Since llm_response can also be a dictionary, we should only proceed
        # towards action execution if we have the correct type of llm_response
        if not isinstance(llm_response, (dict, ToolsBetaMessage)):
            raise ErrorProcessingToolExecutionRequest(
                "llm_response should be of type `Message` or castable to type `Message`, "
                f"received object {llm_response} of type {type(llm_response)}"
            )
        if isinstance(llm_response, dict):
            llm_response = ToolsBetaMessage(**llm_response)

        outputs = []
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        for content in llm_response.content:
            if isinstance(content, (ToolUseBlock, BetaToolUseBlock)):
                outputs.append(
                    self.execute_tool_call(
                        tool_call=content,
                        entity_id=entity_id or self.entity_id,
                    )
                )
        return outputs
