from composio import Composio

composio = Composio(api_key="your_api_key")

# Use the "AUTH CONFIG ID" from your dashboard
auth_config_id = "your_auth_config_id"

# Use a unique identifier for each user in your application
user_id = 'user-1349-129-12'

connection_request = composio.connected_accounts.link(
    user_id=user_id, 
    auth_config_id=auth_config_id, 
    callback_url='https://your-app.com/callback'
)

redirect_url = connection_request.redirect_url
print(f"Visit: {redirect_url} to authenticate your account")
            
# Wait for the connection to be established
connected_account = connection_request.wait_for_connection()
print(connected_account.id)

# Alternative: Wait with custom timeout
# connected_account = connection_request.wait_for_connection(120)  # 2 minute timeout

# Alternative: If you only have the connection request ID (e.g., stored in database)
# connection_id = connection_request.id  # You can store this ID in your database
# connected_account = composio.connected_accounts.wait_for_connection(connection_id, 60)