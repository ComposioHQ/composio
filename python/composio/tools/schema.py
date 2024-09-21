"""
Tool schema helpers
"""

import typing as t
from enum import Enum

from pydantic import BaseModel


class OpenAISchema(BaseModel):
    type: str
    function: t.Dict[str, t.Any]


class ClaudeSchema(BaseModel):
    name: str
    description: str
    input_schema: t.Dict[str, t.Any]


class SchemaType(Enum):
    """Schema type."""

    CLAUDE = "claude"
    OPENAI = "openai"
    DEFAULT = "default"

    def format(
        self,
        schema: t.Dict,
    ) -> t.Union[t.Dict[str, t.Any], OpenAISchema, ClaudeSchema]:
        """Format action schema."""
        if self == SchemaType.OPENAI:
            return OpenAISchema(
                type="function",
                function={
                    "name": schema["name"],
                    "description": schema.get("description", ""),
                    "parameters": schema.get("parameters", {}),
                },
            )

        if self == SchemaType.CLAUDE:
            return ClaudeSchema(
                name=schema["name"],
                description=schema.get("description", ""),
                input_schema=schema.get("parameters", {}),
            )

        return schema
