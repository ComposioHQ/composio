from composio import Composio, TestIntegration

sdk_instance = Composio("7gvfr8u5jqp8v5h1v9dpg4")
github_integration = sdk_instance.get_integration(TestIntegration.GITHUB)
connection_request = github_integration.initiate_connection(user_uuid="karan")
print("Connection request", connection_request.redirectUrl)
connected_account = connection_request.wait_until_active(timeout=60)

print(sdk_instance.get_connected_accounts(user_uuid=["karan"]))