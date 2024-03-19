from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestIntegration, Action

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_connections()
print(apps)