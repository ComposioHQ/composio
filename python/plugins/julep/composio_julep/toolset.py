import json

from julep import Client
from julep.api.types import ChatResponse

from composio import Action
from composio.constants import DEFAULT_ENTITY_ID

from composio_openai import ComposioToolSet as BaseComposioToolSet


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="julep",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset wrapper for Julep framework.
    """

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
        outputs = []
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        while response.finish_reason == "tool_calls":
            for _responses in response.response:
                for _response in _responses:
                    try:
                        tool_function = json.loads(_response.content)  # type: ignore
                        outputs.append(
                            self.execute_action(
                                action=Action(value=tool_function["name"]),
                                params=json.loads(tool_function["arguments"]),
                                entity_id=entity_id or self.entity_id,
                                _check_requested_actions=True,
                            )
                        )
                    except json.JSONDecodeError:
                        outputs.append(_response.content)

            response = julep_client.sessions.chat(  # submit the tool call
                session_id=session_id,
                messages=[{"role": "assistant", "content": json.dumps(outputs)}],  # type: ignore
                recall=True,
                remember=True,
            )

        return response
