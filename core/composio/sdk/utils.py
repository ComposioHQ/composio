from .sdk import ComposioSdk
import os

def _get_enum_key(name):
    return name.upper().replace(' ', '_').replace('-', '_')

def generate_enums():
    sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
    apps = sdk_client.get_list_of_apps()
    actions = sdk_client.get_actions()

    enum_content = 'from enum import Enum\n\n'
    enum_content += 'class Apps(Enum):\n'
    for app in apps["items"]:
        app_name = app['key'].upper().replace(' ', '_').replace('-', '_')
        enum_content += f'    {app_name} = "{app["key"]}"\n'

    enum_content += '\n'
    enum_content += 'class Actions(Enum):\n'
    for app in apps["items"]:
        app_name = app['key'].capitalize().replace(' ', '_').replace('-', '_')

        app_actions = [action for action in actions["items"] if action["appKey"] == app["key"]]
        if len(app_actions) > 0:
            enum_content += f'  class {app_name}(Enum):\n'
            for action in app_actions:
                action_name_parts = action['name'].split('_')
                action_name = '_'.join([part.capitalize() for part in action_name_parts])
                enum_content += f'    {_get_enum_key(action["display_name"])} = "{action["name"]}"\n'
            enum_content += '\n'
        # enum_content += f'Actions.{app_name} = {app_name}\n\n'
    with open(os.path.join(os.path.dirname(__file__), 'enums.py'), 'w') as f:
        f.write(enum_content)
