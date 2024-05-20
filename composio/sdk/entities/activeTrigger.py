from composio.sdk.api.repo import post_disable_trigger, post_enable_trigger
from composio.sdk.sdk import Composio
from composio.sdk.types.activeTrigger import ActiveTriggerModel

class ActiveTrigger(ActiveTriggerModel):
    def __init__(self, sdk_instance: Composio, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance
    
    def disable_trigger(self):
        """
            Disables the trigger.
        """
        return post_disable_trigger(self.sdk_instance.base_url, self.sdk_instance.api_key, self.id)

    def enable_trigger(
            self,
            connected_account_id: str,
            user_inputs: dict
        ):
        """
            Enables the trigger.

            Args:
                connected_account_id (str): The ID of the connected account to enable the trigger for.
                user_inputs (dict): The user inputs to pass to the trigger.
        """
        return post_enable_trigger(
            base_url=self.sdk_instance.base_url,
            api_key=self.sdk_instance.api_key,
            trigger_name=self.triggerName,
            connected_account_id=connected_account_id,
            user_inputs=user_inputs
        )