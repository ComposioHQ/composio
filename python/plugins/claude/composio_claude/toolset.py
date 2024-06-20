import typing as t

from anthropic.types.beta.tools import ToolUseBlock, ToolsBetaMessage
from anthropic.types.beta.tools.tool_param import ToolParam

from composio.client.enums import Action, App, Tag
from composio.constants import DEFAULT_ENTITY_ID
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.schema import ClaudeSchema, SchemaType


class ComposioToolset(BaseComposioToolSet):
    """
    Composio toolset for Anthropic Claude platform.

    Example:
    ```python
        import anthropic
        import dotenv
        from composio_claude import App, ComposioToolset


        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize tools.
        claude_client = anthropic.Anthropic()
        composio_tools = ComposioToolset()

        # Define task.
        task = "Star a repo SamparkAI/composio_sdk on GitHub"

        # Get GitHub tools that are pre-configured
        actions = composio_toolset.get_tools(tools=[App.GITHUB])

        # Get response from the LLM
        response = claude_client.beta.tools.messages.create(
            model="claude-3-opus-20240229",
            max_tokens=1024,
            tools=composio_tools,
            messages=[
                {"role": "user", "content": "Star me sawradip/sawradip repo in github."},
            ],
        )
        print(response)

        # Execute the function calls.
        result = composio_tools.handle_calls(response)
        print(result)
    ```
    """

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        output_in_file: bool = False,
    ) -> None:
        """
        Initialize composio toolset.

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param entity_id: Entity ID for making function calls
        :param output_in_file: Whether to write output to a file
        """
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            runtime="claude",
            entity_id=entity_id,
            output_in_file=output_in_file,
        )
        self.schema = SchemaType.CLAUDE

    def validate_entity_id(self, entity_id: str) -> str:
        """Validate entity ID."""
        if (
            self.entity_id != DEFAULT_ENTITY_ID
            and entity_id != DEFAULT_ENTITY_ID
            and self.entity_id != entity_id
        ):
            raise ValueError(
                "Seperate `entity_id` can not be provided during "
                "intialization and handelling tool calls"
            )
        if self.entity_id != DEFAULT_ENTITY_ID:
            entity_id = self.entity_id
        return entity_id

    def get_actions(self, actions: t.Sequence[Action]) -> t.List[ToolParam]:
        """
        Get composio tools wrapped as `ToolParam` objects.

        :param actions: List of actions to wrap
        :return: Composio tools wrapped as `ToolParam` objects
        """
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
            for schema in self.get_action_schemas(actions=actions)
        ]

    def get_tools(
        self,
        apps: t.Sequence[App],
        tags: t.Optional[t.List[t.Union[str, Tag]]] = None,
    ) -> t.Sequence[ToolParam]:
        """
        Get composio tools wrapped as OpenAI `ChatCompletionToolParam` objects.

        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :return: Composio tools wrapped as `ChatCompletionToolParam` objects
        """
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
            for schema in self.get_action_schemas(apps=apps, tags=tags)
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
            action=Action.from_action(name=tool_call.name),
            params=t.cast(t.Dict, tool_call.input),
            entity_id=entity_id or self.entity_id,
        )

    def handle_tool_calls(
        self,
        llm_response: ToolsBetaMessage,
        entity_id: t.Optional[str] = None,
    ) -> t.List[t.Dict]:
        """
        Handle tool calls from OpenAI chat completion object.

        :param response: Chat completion object from
                        openai.OpenAI.chat.completions.create function call
        :param entity_id: Entity ID to use for executing function calls.
        :return: A list of output objects from the function calls.
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        outputs = []
        for content in llm_response.content:
            if isinstance(content, ToolUseBlock):
                outputs.append(
                    self.execute_tool_call(
                        tool_call=content,
                        entity_id=entity_id or self.entity_id,
                    )
                )
        return outputs
