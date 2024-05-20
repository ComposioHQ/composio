from composio.sdk.sdk import Composio
from composio.sdk.types.trigger import TriggerModel

class Trigger(TriggerModel):
    def __init__(self, sdk_instance: Composio, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance