import json
import typing as t

from composio_openai import ComposioToolSet as BaseComposioToolSet
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
    ) -> None:
        """
        Initialize composio toolset.

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param entity_id: Entity ID for making function calls
        """
        super().__init__(
            api_key,
            base_url,
            entity_id=entity_id,
        )
        self.runtime = "julep"

    def handle_tool_calls(
        self,
        response: ChatResponse,
        entity_id: str = "default",
    ) -> t.List[t.Dict]:
        """
        Handle tool calls from Julep chat client object.

        :param response: Chat completion object from
                        julep.Client.sessions.chat function call
        :param entity_id: Entity ID.
        :return: A list of output objects from the function calls.
        """
        entity_id = self.validate_entity_id(entity_id)
        outputs = []

        for _responses in response.response:
            for _response in _responses:
                try:
                    function = json.loads(_response.content)
                    outputs.append(
                        self.execute_action(
                            action=Action.from_action(name=function["name"]),
                            params=json.loads(function["arguments"]),
                            entity_id=self.entity_id,
                        )
                    )
                except json.JSONDecodeError:
                    outputs.append(_response.content)
        return outputs
