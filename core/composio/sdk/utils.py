from .sdk import Composio
import os

def _get_enum_key(name):
    return name.upper().replace(' ', '_').replace('-', '_')

def generate_enums():
    sdk_client = Composio("yw1qb4ls4340z696zh7sa")
    apps = sdk_client.get_list_of_apps()
    actions = sdk_client.get_list_of_actions()

    enum_content = 'from enum import Enum\n\n'
    enum_content += 'class App(Enum):\n'
    for app in apps["items"]:
        app_name = app['key'].upper().replace(' ', '_').replace('-', '_')
        enum_content += f'    {app_name} = "{app["key"]}"\n'
    
    enum_content += "\n"
    enum_content += 'class TestIntegration(Enum):\n'
    for app in apps["items"]:
        app_name = app['key'].upper().replace(' ', '_').replace('-', '_')
        enum_content += f'    {app_name} = "test-{app["key"]}-connector"\n'

    enum_content += '\n'
    enum_content += 'class Action(Enum):\n'
    enum_content += '    def __init__(self, service, action):\n'
    enum_content += '        self.service = service\n'
    enum_content += '        self.action = action\n\n'
    for app in apps["items"]:
        app_key = app['key']
        app_actions = [action for action in actions if action["appKey"] == app_key]
        for action in app_actions:
            enum_name = f'{app_key.upper()}_{_get_enum_key(action["display_name"])}'
            enum_value = f'("{app_key}", "{action["name"]}")'
            enum_content += f'    {enum_name} = {enum_value}\n'
        # enum_content += f'Actions.{app_name} = {app_name}\n\n'
    with open(os.path.join(os.path.dirname(__file__), 'enums.py'), 'w') as f:
        f.write(enum_content)
