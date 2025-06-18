import pytest


@pytest.mark.openai
def test_openai_get_tools():
    """we can get tools with the OpenAIProvider"""
    from composio_openai import OpenAIProvider

    from composio.core import Composio

    composio = Composio(provider=OpenAIProvider())
    # Get GitHub tools that are pre-configured
    tools = composio.tools.get(user_id="default", filters={"toolkits": ["GITHUB"]})
    assert isinstance(tools, list)
    assert "function" in tools[0]
    assert "type" in tools[0]
    assert tools[0].get("type") == "function"


@pytest.mark.openai
def test_openai_get_multiple_tools():
    """We can get multiple tools with the OpenAIProvider"""
    from composio_openai import OpenAIProvider

    from composio.core import Composio

    composio_openai_provider = OpenAIProvider()
    composio = Composio(provider=composio_openai_provider)
    tools = composio.tools.get(
        user_id="default", filters={"category": "search", "limit": 10}
    )
    print(tools)


@pytest.mark.openai
def test_openai_handle_tool_calls():
    """Handles tool calls after getting tools"""
    from composio_openai import OpenAIProvider
    from openai import OpenAI

    from composio.core import Composio

    # Initialize tools.
    openai_client = OpenAI()
    composio = Composio(provider=OpenAIProvider())

    # Get GitHub tools that are pre-configured
    tools = composio.tools.get(user_id="default", filters={"toolkits": ["HACKERNEWS"]})
    # Get response from the LLM
    response = openai_client.chat.completions.create(
        model="gpt-4-turbo-preview",
        tools=tools,
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {
                "role": "user",
                "content": "Get the user details for `dang` on Hackernews.",
            },
        ],
    )
    # Execute the function calls.
    result = composio.provider.handle_tool_calls(response=response, user_id="default")
    assert result[0].data["response_data"]["username"] == "dang"
    print(result)
