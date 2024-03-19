from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestConnectors

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_apps()
app_integration = sdk_client.get_app_integration(TestConnectors.GITHUB)
print(f"App name is: {app_integration.appName}")
connection_request = app_integration.initiate_connection()
print(f"Connection request is: {connection_request.redirectUrl}")

connection_request.wait_until_active()