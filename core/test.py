from composio.sdk.sdk import ComposioSdk
from composio.sdk.enums import TestConnector, Action

sdk_client = ComposioSdk("hrhdegyxh44twa8zhtpkg")
apps = sdk_client.get_list_of_apps()
app_integration = sdk_client.get_app_integration(TestConnector.GITHUB)
connection_request = app_integration.initiate_connection()

connected_account = connection_request.wait_until_active()
connected_account.execute_action(Action.GITHUB_CREATE_ISSUE, {
    "title": "Test issue",
    "body": "This is a test issue",
    "owner": "utkarsh-dixit",
    "repo": "speedy"
})