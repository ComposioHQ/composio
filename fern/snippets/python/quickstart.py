import os
from composio_core import Composio

userId = "your@email.com"

composio = Composio(api_key=os.environ.get("COMPOSIO_API_KEY"))

print("🚀 Starting GitHub authentication for user:", userId)

connection = composio.toolkits.authorize(userId, "github")

print("🔗 Please authorize access by visiting this URL:")
print("👉", connection.redirect_url)

print("⏳ Waiting for you to complete the authorization in your browser...")
connection.wait_for_connection()
print("✅ Authorization complete! 🎉")

print("🌟 Starring the composiohq/composio repository on GitHub...")

res = composio.tools.execute(
    "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    {"userId": userId, "arguments": {"owner": "composiohq", "repo": "composio"}},
)

print("⭐️ Repository starred! Here is the response:")
print(res)
