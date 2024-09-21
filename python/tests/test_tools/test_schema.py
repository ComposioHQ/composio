"""
Test schema helpers.
"""

from composio.tools.schema import ClaudeSchema, OpenAISchema, SchemaType


def test_openai_schema() -> None:
    """Test `OpenAI` schema formatting."""

    assert SchemaType.OPENAI.format(  # type: ignore
        schema={
            "name": "method",
            "description": "Some method",
            "parameters": {
                "name": "str",
            },
        }
    ) == OpenAISchema(
        type="function",
        function={
            "name": "method",
            "description": "Some method",
            "parameters": {
                "name": "str",
            },
        },
    )


def test_claude_schema() -> None:
    """Test `Claude` schema formatting."""

    assert SchemaType.CLAUDE.format(  # type: ignore
        {
            "name": "method",
            "description": "Some method",
            "parameters": {
                "name": "str",
            },
        }
    ) == ClaudeSchema(
        name="method",
        description="Some method",
        input_schema={
            "name": "str",
        },
    )
