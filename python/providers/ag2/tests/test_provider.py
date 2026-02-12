"""
Tests for AG2 Provider
"""

import os
import tempfile
from unittest.mock import MagicMock

os.environ.setdefault("COMPOSIO_CACHE_DIR", tempfile.mkdtemp(prefix="composio-test-"))

from autogen.tools.tool import Tool as FunctionTool
from composio_ag2 import AG2Provider


def test_wrap_tool_returns_function_tool() -> None:
    provider = AG2Provider()
    mock_tool = MagicMock(
        slug="GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
        description="Star a repository on GitHub.",
        input_parameters={
            "type": "object",
            "properties": {
                "owner": {"type": "string"},
                "repo": {"type": "string"},
            },
            "required": ["owner", "repo"],
        },
    )

    def execute_tool(*, slug, arguments):
        return {"successful": True, "data": {"slug": slug, "args": arguments}}

    wrapped = provider.wrap_tool(mock_tool, execute_tool)

    assert isinstance(wrapped, FunctionTool)
    assert wrapped.name
    assert wrapped.description == mock_tool.description


def test_wrap_tools_returns_list() -> None:
    provider = AG2Provider()
    tools = [
        MagicMock(
            slug="TOOL_ONE",
            description="Tool one.",
            input_parameters={"type": "object", "properties": {}},
        ),
        MagicMock(
            slug="TOOL_TWO",
            description="Tool two.",
            input_parameters={"type": "object", "properties": {}},
        ),
    ]

    def execute_tool(*, slug, arguments):
        return {"successful": True, "data": {"slug": slug, "args": arguments}}

    wrapped = provider.wrap_tools(tools, execute_tool)
    assert len(wrapped) == 2
