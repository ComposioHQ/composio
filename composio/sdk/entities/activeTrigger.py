from composio.sdk.sdk import Composio
from composio.sdk.types.activeTrigger import ActiveTriggerModel

class ActiveTrigger(ActiveTriggerModel):
    def __init__(self, sdk_instance: Composio, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance