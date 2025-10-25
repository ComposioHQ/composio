import os
from composio import Composio

# Get current environment from environment variable
env = os.getenv("ENVIRONMENT", "development")

# Define version configurations for each environment
version_configs = {
    "development": {
        "github": "latest",
        "slack": "latest",
        "gmail": "latest"
    },
    "staging": {
        "github": "20250116_00",  # Test new GitHub version
        "slack": "20250110_00",    # Keep stable Slack version
        "gmail": "20250110_00"
    },
    "production": {
        "github": "20250110_00",  # Stable, tested version
        "slack": "20250110_00",   # Stable, tested version
        "gmail": "20250109_00"    # Stable, tested version
    }
}

# Initialize Composio with environment-specific versions
composio = Composio(
    api_key=os.getenv("COMPOSIO_API_KEY"),
    toolkit_versions=version_configs[env]
)

print(f"Environment: {env}")
print(f"Toolkit versions: {version_configs[env]}")