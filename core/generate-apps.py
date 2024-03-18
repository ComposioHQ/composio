from composio.sdk import ComposioSdk

def test():
        sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
        apps = sdk_client.get_list_of_apps()
        # print(apps)
        enum_content = 'from enum import Enum\n\n'
        enum_content += 'class Apps(Enum):\n'
        for app in apps["items"]:
            print(app)
            app_name = app['key'].upper().replace(' ', '_').replace('-', '_')
            enum_content += f'    {app_name} = "{app["key"]}"\n'

        actions = sdk_client.get_actions()
        enum_content += '\n'
        enum_content += 'class Actions(Enum):\n'
        for action in actions["items"]:
            print(action)
            action_name = action['name'].upper().replace(' ', '_').replace('-', '_')
            enum_content += f'    {action_name} = "{action["name"]}"\n'

        with open('composio/sdk/enums.py', 'w') as f:
            f.write(enum_content)


test()