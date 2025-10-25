from composio import Composio
from datetime import datetime

composio = Composio(api_key="YOUR_API_KEY")

# Get all available versions for a toolkit
versions = composio.tools.get_toolkit_versions("github")

# Display version information
for version in versions:
    print(f"Version: {version['version']}")
    print(f"Released: {version['created_at']}")
    print(f"Status: {version['status']}")
    print("-" * 40)

# Find the latest stable version
stable_versions = [v for v in versions if v['status'] == 'stable']
if stable_versions:
    latest_stable = stable_versions[0]
    print(f"Latest stable version: {latest_stable['version']}")

# Find versions released in the last 7 days
recent_versions = []
for version in versions:
    release_date = datetime.fromisoformat(version['created_at'])
    days_ago = (datetime.now() - release_date).days
    if days_ago <= 7:
        recent_versions.append(version)
        
print(f"Versions released in last 7 days: {len(recent_versions)}")