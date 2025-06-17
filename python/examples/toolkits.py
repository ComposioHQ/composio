from composio import Composio

composio = Composio()

# List all toolkits
toolkits = composio.toolkits.get()
print(toolkits)

# Get a toolkit by slug
toolkit = composio.toolkits.get(slug="github")
print(toolkit)

# List all toolkits categories
categories = composio.toolkits.list_categories()
print(categories)

# Authorize a user to a toolkit
connection_request = composio.toolkits.authorize(user_id="123", toolkit="github")
print(connection_request)
