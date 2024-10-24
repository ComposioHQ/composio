"""Collection classes for managing multiple tools."""

from typing import Any, Sequence
from composio_claude import App
from anthropic.types.beta import BetaToolUnionParam
from .composio import ComposioIntegratedTool
from .base import (
    BaseAnthropicTool,
    ToolError,
    ToolFailure,
    ToolResult,
)
import logging

logging.basicConfig(level=logging.INFO)


class ToolCollection:
    """A collection of anthropic-defined tools."""

    def __init__(self, *tools: BaseAnthropicTool):
        self.tools = list(tools)
        self.tool_map = {tool.to_params()["name"]: tool for tool in self.tools}
        logging.info(
            "Registered tools: %s", [tool.to_params()["name"] for tool in self.tools]
        )

    async def run(self, *, name: str, tool_input: dict[str, Any]) -> ToolResult:
        logging.info(f"Executing tool: {name} with input: {tool_input}")
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            if (
                name == "GOOGLESHEETS_CREATE_GOOGLE_SHEET1"
                or name == "GOOGLESHEETS_GET_SPREADSHEET_INFO"
                or name == "GOOGLESHEETS_BATCH_GET"
            ):
                return await tool(name=name, **tool_input)
            else:
                return await tool(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)

    def to_params(
        self,
    ) -> list[BetaToolUnionParam]:
        return [tool.to_params() for tool in self.tools]
