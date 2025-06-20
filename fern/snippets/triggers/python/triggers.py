from composio import Composio

composio = Composio()

trigger = composio.triggers.get("GITHUB_STAR_ADDED_EVENT")

print(trigger)