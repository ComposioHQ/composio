from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestIntegration, Action

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_apps()
app_integration = sdk_client.get_app_integration(TestIntegration.GITHUB)
connection_request = app_integration.initiate_connection()

connected_account = connection_request.wait_until_active()