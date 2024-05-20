from typing import TYPE_CHECKING
from composio.sdk.types.app import AppInfoModel
from composio.sdk.utils import SchemaFormat, format_schema
from composio.sdk.api.repo import get_list_triggers, get_list_of_actions

if TYPE_CHECKING:
    from composio.sdk import Composio

class App(AppInfoModel):
    def __init__(self, sdk_instance: 'Composio', **data):
        """The App class represents an app in Composio.

        :param sdk_instance: The Composio SDK instance.
        :type sdk_instance: Composio
        :param data: The data to initialize the App object with.
        :type data: dict
        """
        super().__init__(**data)
        self.sdk_instance = sdk_instance
    
    def get_all_actions_schema(self, format: SchemaFormat = SchemaFormat.OPENAI):
        """Get all actions for the app.

        :param SchemaFormat format: The format of the actions to get. Defaults to SchemaFormat.OPENAI.
        :return: A list of actions for the app.
        :rtype: list[Action]
        """
        from composio.sdk.enums import App
        app_unique_id = self.appId
        actions = get_list_of_actions(
            base_url=self.sdk_instance.base_url,
            api_key=self.sdk_instance.api_key,
            app_names = [App(app_unique_id)]
        )
        return [format_schema(action_schema, format = format) for action_schema in actions]
    
    def get_all_triggers_schema(self, format: SchemaFormat = SchemaFormat.OPENAI):
        """Get all triggers for the app.

        :param SchemaFormat format: The format of the triggers to get. Defaults to SchemaFormat.OPENAI.
        :return: A list of triggers for the app.
        :rtype: list[Trigger]
        """
        from composio.sdk.enums import App
        app_unique_id = self.appId
        trigger_response = get_list_triggers(self.sdk_instance.base_url, self.sdk_instance.api_key, [App(app_unique_id)])
        return [format_schema(trigger_schema, format = format) for trigger_schema in trigger_response]