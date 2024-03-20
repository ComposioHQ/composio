from composio import Composio, SchemaFormat
from composio import TestIntegration, Action, App
from openai import OpenAI

sdk_client = Composio("yw1qb4ls4340z696zh7sa")
integration = sdk_client.get_app_integration("d4550b15-dc09-498b-9863-0424905f7fb0") # User Selected Id

print(integration.get_required_variables()) # list of params req from user

params = {"api_key":"lin_api_VcPcZ71RunTiWRRBQDUuGwY0cUFSG1EukWAElS6M"}

connection_request = integration.initiate_connection(params=params)
print(connection_request)
if connection_request.redirectUrl is not None:
	print(f"Please complete the auth flow by opening this link: {connection_request.redirectUrl}")
else:
	print("The account status is :{}",connection_request.connectionStatus)
	print(sdk_client.get_list_of_actions([App.LINEAR], [Action.LINEAR_GET_PROJECTS]))