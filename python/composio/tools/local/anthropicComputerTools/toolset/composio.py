from typing import Dict, Any, cast, List
from anthropic.types.beta import BetaToolUnionParam
from composio_claude import App, ComposioToolSet, Action
from .base import BaseAnthropicTool, ToolError, ToolResult
import streamlit as st
import logging


COMPOSIO_LOGGING_LEVEL = logging.DEBUG


class ComposioIntegratedTool(BaseAnthropicTool):
    def __init__(self, app: App, action_name: str):
        super().__init__()
        self.app = app
        self.composio_toolset = ComposioToolSet()
        # Get tools directly from composio - these are already in Claude's API format
        self.tools = self.composio_toolset.get_tools(actions=[action_name])
        self.name = f"composio_{app}"

        # Debug what tools we got
        logging.info(f"Composio tools for {app}: {self.tools}")

    def to_params(self) -> List[BetaToolUnionParam]:
        # Since composio already returns tools in Claude's format,
        # we just need to return them directly
        logging.info("these are all the tools", self.tools)
        if not self.tools:
            return [
                {
                    "type": "function",
                    "name": self.name,
                    "parameters": {"type": "object", "properties": {}},
                    "description": f"No tools available for {self.app}",
                }
            ]
        # Return all tools' parameters
        return self.tools[0]

    async def __call__(self, name: str, **kwargs) -> ToolResult:
        try:
            logging.info(f"Executing tool with parameters:")
            for key, value in kwargs.items():
                logging.info(f"  {key}: {value}")
            logging.info(name)
            # Execute action through composio
            result = self.composio_toolset.execute_action(
                action=Action(name), params=kwargs, entity_id="sam-openai"
            )

            if result is None:
                return ToolResult(
                    error="No result returned",
                    system=f"Error executing {self.app} action: {name}",
                )

            return ToolResult(
                output=str(result),
                system=f"Successfully executed {self.app} action: {name}",
            )

        except Exception as e:
            return ToolResult(
                error=str(e), system=f"Exception during {self.app} execution"
            )
