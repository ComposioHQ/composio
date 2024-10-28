from composio_crewai import ComposioToolSet, App
toolset = ComposioToolSet()
repo_url = "git clone https://<github-token>@github.com/ComposioHQ/hermes"
entity = toolset.get_entity(id="default")
user_connected_account = entity.get_connection(app=App.GITHUB)
if user_connected_account is None:
    raise Exception("User not connected to GitHub")
connected_account = toolset.get_connected_account(id=user_connected_account.id)

# Get the parameters for your local usage
print(toolset.get_auth_params(connection_id=connected_account.id))

#print(connected_account.connectionParams) # use this for raw/advanced cases