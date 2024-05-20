
from enum import Enum, auto
import json
from typing import TYPE_CHECKING, Any
from openai.types.chat.chat_completion import ChatCompletion
from composio.sdk.enums import Action
from composio.sdk.types.connectedAccount import ConnectedAccountModel
from composio.sdk.utils import SchemaFormat
from composio.sdk.utils import format_schema

if TYPE_CHECKING:
    from composio.sdk import Composio

class ConnectedAccount(ConnectedAccountModel):
    """The ConnectedAccount class.

    :param sdk_instance: The Composio SDK instance.
    :type sdk_instance: Composio
    :param data: The data to initialize the ConnectedAccount object with.
    :type data: dict
    """
    def __init__(self, sdk_instance: 'Composio', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def _execute_action(
        self, action_name: Action, connected_account_id: str, params: dict
    ):
        """Executes an action on the connected account.

        :param action_name: The name of the action to execute.
        :type action_name: Action
        :param connected_account_id: The ID of the connected account to execute the action on.
        :type connected_account_id: str
        :param params: The parameters to pass to the action.
        :type params: dict

        :return: The response from the action execution.
        :rtype: Any
        """
        resp = self.sdk_instance.http_client.post(
            f"v1/actions/{action_name.value[1]}/execute",
            json={"connectedAccountId": connected_account_id, "input": params},
        )
        return resp.json()

    def execute_action(self, action_name: Action, params: dict):
        """Executes an action on the connected account.

        :param action_name: The name of the action to execute.
        :type action_name: Action
        :param params: The parameters to pass to the action.
        :type params: dict

        :return: The response from the action execution.
        :rtype: Any
        """
        resp = self._execute_action(action_name, self.id, params)
        return resp

    def get_all_actions(self, format: SchemaFormat = SchemaFormat.OPENAI) -> list[Action]:
        app_unique_id = self.appUniqueId
        resp = self.sdk_instance.http_client.get(
            f"v1/actions?appNames={app_unique_id}"
        )
        actions = resp.json()
        schema_formatted_actions = [format_schema(action_schema, format=format) for action_schema in actions["items"]]
        return [
            Enum(
                'Action',
                {
                    (action_schema.get("service", ""), action_schema.get("action", ""), action_schema.get("no_auth", False)): auto()
                }
            )
            for action_schema in schema_formatted_actions
        ]

    def handle_tools_calls(self, tool_calls: ChatCompletion) -> list[Any]:
        output = []
        try:
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            function = tool_call.function
                            action = self.sdk_instance.get_action_enum( # type: ignore
                                function.name, self.appUniqueId
                            )
                            arguments = json.loads(function.arguments)
                            output.append(self.execute_action(action, arguments))
        except Exception as e:
            raise e from e

        return output
