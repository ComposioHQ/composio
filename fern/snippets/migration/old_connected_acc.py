from composio_openai import ComposioToolSet

toolset = ComposioToolSet()
user_id = "your_user_unique_id"
google_integration_id = "0000-0000"

entity = toolset.get_entity(id=user_id)

try:
    print(f"Initiating OAuth connection for entity {entity.id}...")
    connection_request = toolset.initiate_connection(
        integration_id=google_integration_id,
        entity_id=user_id,
        # Optionally add: redirect_url="https://yourapp.com/final-destination"
        # if you want user sent somewhere specific *after* Composio finishes.
    )

    # Check if a redirect URL was provided (expected for OAuth)
    if connection_request.redirectUrl:
        print(f"Received redirect URL: {connection_request.redirectUrl}")
    else:
        print("Error: Expected a redirectUrl for OAuth flow but didn't receive one.")


except Exception as e:
    print(f"Error initiating connection: {e}")
