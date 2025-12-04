import asyncio
from composio import Composio

composio = Composio(api_key="your-composio-api-key")

user_id = "pg-user-550e8400-e29b-41d4"
required_toolkits = ["gmail", "googlecalendar", "linear", "slack"]

async def main():
    session = await composio.create(
        user=user_id,
        manage_connections=False,
    )

    toolkits = await session.toolkits()

    def is_connected(slug):
        toolkit = next((t for t in toolkits if t.slug == slug), None)
        return toolkit and toolkit.connected_account

    pending = [slug for slug in required_toolkits if not is_connected(slug)]

    if pending:
        print("Connect these apps to continue:")

        for slug in pending:
            connection_request = await session.authorize(
                slug,
                callback_url="https://yourapp.com/onboarding"
            )
            print(f"  {slug}: {connection_request.redirect_url}")

        print("\nWaiting for connections...")

        for slug in pending:
            connection_request = await session.authorize(slug)
            await connection_request.wait_for_connection(60000)
            print(f"  {slug} connected")

    print("\nAll apps connected. Starting assistant...")
    tools = await session.tools()

asyncio.run(main())
