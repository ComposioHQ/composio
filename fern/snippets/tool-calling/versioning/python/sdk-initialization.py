from composio import Composio

# Pin specific versions for each toolkit
composio = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={
        "github": "20250116_00",
        "slack": "20250115_01",
        "gmail": "20250115_00"
    }
)