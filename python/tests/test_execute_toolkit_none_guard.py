"""``Tools.execute`` must not assume every tool schema carries a toolkit.

``execute`` guarded ``tool.toolkit`` when resolving the file-upload toolkit
slug, but dereferenced ``tool.toolkit.slug`` unguarded in both the
``before_execute`` and ``after_execute`` modifier paths. Executing a
toolkit-less tool with modifiers attached therefore raised
``AttributeError: 'NoneType' object has no attribute 'slug'``.

These tests pin the slug modifiers observe: the real toolkit slug when the
schema has one, and ``"unknown"`` when it does not (the same fallback
``_execute_tool`` already used).
"""

import typing as t
from unittest.mock import Mock, patch

import pytest

from composio.core.models._modifiers import ToolExecuteParams
from composio.core.models.base import allow_tracking
from composio.core.models.tools import (
    ToolExecutionResponse,
    Tools,
    after_execute,
    before_execute,
)


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _tool(slug: str, toolkit_slug: t.Optional[str]) -> Mock:
    """Build a tool schema stub, optionally without a toolkit."""
    tool = Mock()
    tool.slug = slug
    tool.toolkit = None if toolkit_slug is None else Mock(slug=toolkit_slug)
    return tool


def _tools_with(tool: Mock) -> Tools:
    """Build a ``Tools`` whose schema cache is preseeded with ``tool``.

    Seeding the cache keeps ``execute`` off the network: it only falls back to
    ``client.tools.retrieve`` when the slug is missing.
    """
    tools: Tools = Tools(client=Mock(), provider=Mock())
    tools._tool_schemas[tool.slug] = tool
    return tools


_RESPONSE: ToolExecutionResponse = {"data": {}, "error": None, "successful": True}


class TestExecuteToolkitSlugResolution:
    """The slug handed to modifiers is resolved once, with a safe fallback."""

    def test_modifiers_do_not_crash_when_tool_has_no_toolkit(self) -> None:
        seen: t.Dict[str, str] = {}

        @before_execute
        def record_before(
            tool: str, toolkit: str, params: ToolExecuteParams
        ) -> ToolExecuteParams:
            seen["before"] = toolkit
            return params

        @after_execute
        def record_after(
            tool: str, toolkit: str, response: ToolExecutionResponse
        ) -> ToolExecutionResponse:
            seen["after"] = toolkit
            return response

        tools = _tools_with(_tool("NO_TOOLKIT_TOOL", None))

        # Before the fix this raised AttributeError before ``_execute_tool``
        # was ever reached.
        with patch.object(
            tools, "_execute_tool", return_value=_RESPONSE
        ) as execute_tool:
            response = tools.execute(
                slug="NO_TOOLKIT_TOOL",
                arguments={},
                version="1.0.0",
                modifiers=[record_before, record_after],
            )

        assert execute_tool.call_count == 1
        assert response == _RESPONSE
        assert seen == {"before": "unknown", "after": "unknown"}

    def test_modifiers_see_the_real_slug_when_the_tool_has_a_toolkit(self) -> None:
        seen: t.Dict[str, str] = {}

        @before_execute
        def record_before(
            tool: str, toolkit: str, params: ToolExecuteParams
        ) -> ToolExecuteParams:
            seen["before"] = toolkit
            return params

        @after_execute
        def record_after(
            tool: str, toolkit: str, response: ToolExecutionResponse
        ) -> ToolExecutionResponse:
            seen["after"] = toolkit
            return response

        tools = _tools_with(_tool("GITHUB_CREATE_ISSUE", "github"))

        with patch.object(tools, "_execute_tool", return_value=_RESPONSE):
            tools.execute(
                slug="GITHUB_CREATE_ISSUE",
                arguments={},
                version="1.0.0",
                modifiers=[record_before, record_after],
            )

        assert seen == {"before": "github", "after": "github"}

    def test_modifiers_still_mutate_request_and_response(self) -> None:
        """The guard must not disturb what modifiers are for."""

        @before_execute
        def add_text(
            tool: str, toolkit: str, params: ToolExecuteParams
        ) -> ToolExecuteParams:
            params["text"] = "injected"
            return params

        @after_execute
        def tag_response(
            tool: str, toolkit: str, response: ToolExecutionResponse
        ) -> ToolExecutionResponse:
            return {**response, "data": {"tagged": True}}

        tools = _tools_with(_tool("NO_TOOLKIT_TOOL", None))

        with patch.object(
            tools, "_execute_tool", return_value=_RESPONSE
        ) as execute_tool:
            response = tools.execute(
                slug="NO_TOOLKIT_TOOL",
                arguments={},
                version="1.0.0",
                modifiers=[add_text, tag_response],
            )

        assert execute_tool.call_args.kwargs["text"] == "injected"
        assert response["data"] == {"tagged": True}

    def test_toolkitless_tool_without_modifiers_is_unaffected(self) -> None:
        """The path that already worked keeps working."""
        tools = _tools_with(_tool("NO_TOOLKIT_TOOL", None))

        with patch.object(
            tools, "_execute_tool", return_value=_RESPONSE
        ) as execute_tool:
            response = tools.execute(
                slug="NO_TOOLKIT_TOOL",
                arguments={"a": 1},
                version="1.0.0",
            )

        assert response == _RESPONSE
        assert execute_tool.call_args.kwargs["arguments"] == {"a": 1}
