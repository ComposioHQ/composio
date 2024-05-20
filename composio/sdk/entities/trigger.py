from typing import TYPE_CHECKING
from composio.sdk.types.trigger import TriggerModel

if TYPE_CHECKING:
    from composio.sdk import Composio

class Trigger(TriggerModel):
    def __init__(self, sdk_instance: 'Composio', **data):
        """Represents a trigger info item in Composio.

        :param sdk_instance: The Composio SDK instance.
        :type sdk_instance: Composio
        :param data: The data to initialize the Trigger object with.
        :type data: dict
        """
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def ping(self):
        """Pings the trigger.

        :return: The response from the ping request.
        :rtype: Any
        """
        return self.sdk_instance.http_client.get(f"v1/triggers/{self.id}/ping")