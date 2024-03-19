from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestConnectors

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_apps()
print(apps)
app_integration = sdk_client.get_app_integration(TestConnectors.GITHUB)
print(app_integration)