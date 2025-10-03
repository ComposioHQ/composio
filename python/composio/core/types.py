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


__all__ = [
    "ToolkitLatestVersion",
    "ToolkitVersion",
    "ToolkitVersions",
    "ToolkitVersionParam",
]
