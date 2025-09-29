"""Core types for Composio SDK."""

import typing as t

import typing_extensions as te

# Tool versioning types
ToolkitLatestVersion = te.Literal["latest"]
ToolkitVersion = str  # Can be "latest" or any version string like "20250906_01"
ToolkitVersions = t.Dict[str, ToolkitVersion]
ToolkitVersionParam = t.Union[
    str, ToolkitVersions, None
]  # String can be any global version


# Shared types for MCP and ToolRouter
class MCPToolkitConfig(te.TypedDict):
    """Configuration for a single toolkit in MCP server or ToolRouter session."""

    toolkit: te.NotRequired[str]  # e.g., "github", "slack", "composio_search"
    auth_config_id: te.NotRequired[
        str
    ]  # Auth configuration ID (for toolkits requiring auth)


__all__ = [
    "ToolkitLatestVersion",
    "ToolkitVersion",
    "ToolkitVersions",
    "ToolkitVersionParam",
    "MCPToolkitConfig",
]
