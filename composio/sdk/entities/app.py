from composio.sdk.sdk import Composio
from composio.sdk.types.app import AppInfoModel
from composio.sdk.utils import SchemaFormat, format_schema


class App(AppInfoModel):
    def __init__(self, sdk_instance: Composio, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance
    
    def get_all_actions(self, format: SchemaFormat = SchemaFormat.OPENAI):
        app_unique_id = self.appId
        resp = self.sdk_instance.http_client.get(
            f"v1/actions?appNames={app_unique_id}"
        )
        actions = resp.json()
        return [format_schema(action_schema, format = format) for action_schema in actions["items"]]
    
    def get_all_triggers(self, format: SchemaFormat = SchemaFormat.OPENAI):
        app_unique_id = self.appId
        resp = self.sdk_instance.http_client.get(
            f"v1/triggers?appNames={app_unique_id}"
        )
        triggers = resp.json()
        return [format_schema(trigger_schema, format = format) for trigger_schema in triggers["items"]]