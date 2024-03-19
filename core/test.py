from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestIntegration, Action

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_apps()
app_integration = sdk_client.get_app_integration(TestIntegration.GITHUB)
print("GOT APP INTEGRATION")
connection_request = app_integration.initiate_connection()
print("INITIATED CONNECTION")
print(f"Connection reuqest: {connection_request.redirectUrl} ")
connected_account = connection_request.wait_until_active()
print("CONNECTED ACCOUNT")
connected_account.execute_action(Action.GITHUB_CREATE_ISSUE, {
    "title": "Test issue",
    "body": "This is a test issue",
    "owner": "utkarsh-dixit",
    "repo": "speedy"
})