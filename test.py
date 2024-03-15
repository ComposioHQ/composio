# from core.sdk import ComposioClient

# client = ComposioClient()
# user_data = client.authenticate("hash")

# apps_list = client.get_list_of_apps()
# app_names_list = [{"name": app.get('name'), "uniqueId": app.get('key'), "appId": app.get('appId')} for app in apps_list.get('items')]
# print(app_names_list)
# tool_name = input("Enter the tool name: ")
# connection = client.get_connector(tool_name)
# print(connection)

# connection = client.create_connection(tool_name)
# print(connection)

# client.wait_for_connection(connection.get('connectionId'))
# print(connection)

# actions = client.get_actions([tool_name])
# print(actions)

# action_name = input("Enter the action name: ")
# resp = client.execute_action(action_name, connection.get('connectionId'), {
#     "owner": "utkarsh-dixit",
#     "repo": "speedy",
#     "title": "testing E2E new 6",
#     "body": "testing E2E new 6"
# })
# print(resp)