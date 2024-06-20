import json
import typing as t

from composio_openai import ComposioToolSet as BaseComposioToolSet
from julep import Client
from julep.api.types import ChatResponse

from composio.client.enums import Action
from composio.constants import DEFAULT_ENTITY_ID


class ComposioToolSet(BaseComposioToolSet):
    """
    Composio toolset wrapper for Julep framework.
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
            api_key,
            base_url,
            entity_id=entity_id,
            output_in_file=output_in_file,
        )
        self._runtime = "julep"

    def handle_tool_calls(  # type: ignore[override]
        self,
        julep_client: Client,
        session_id: str,
        response: ChatResponse,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> ChatResponse:
        """
        Handle tool calls from Julep chat client object.

        :param response: Chat completion object from
                        julep.Client.sessions.chat function call
        :param entity_id: Entity ID to use for executing function calls.
        :return: A list of output objects from the function calls.
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        outputs = []
        while response.finish_reason == "tool_calls":
            for _responses in response.response:
                for _response in _responses:
                    try:
                        tool_function = json.loads(_response.content)
                        outputs.append(
                            self.execute_action(
                                action=Action.from_action(name=tool_function["name"]),
                                params=json.loads(tool_function["arguments"]),
                                entity_id=entity_id or self.entity_id,
                            )
                        )
                    except json.JSONDecodeError:
                        outputs.append(_response.content)

            response = julep_client.sessions.chat(  # submit the tool call
                session_id=session_id,
                messages=[
                    {
                        "role": "assistant",
                        "content": json.dumps(outputs),
                    }
                ],
                recall=True,
                remember=True,
            )

        return response
