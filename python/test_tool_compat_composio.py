# ruff: noqa: E402
"""
Tool compatibility tester for Composio providers.

Usage:
    python test_tool_compat_composio.py <path_to_action.py>

Tests a mercury Action via each Composio provider's tools.get() and reports
which providers can successfully wrap and use the tool schema.
"""

import json
import os
import sys
from pathlib import Path

from mercury.tools.base import Action


def derive_tool_name(action_path: str) -> tuple[str, str, str]:
    """Derive Composio tool name, action slug, and description from action path."""
    p = Path(action_path)
    # Find the 'actions' segment to get app name
    parts = p.parts
    actions_idx = parts.index("actions")
    app_name = parts[actions_idx - 1].upper()

    action = Action.from_file(p.resolve())
    slug = action.slug
    tool_name = f"{app_name}_{slug}"
    description = action.description or f"Execute {slug}"
    return tool_name, slug, description


def test_openai_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_openai import OpenAIProvider
    from openai import OpenAI

    composio = Composio(provider=OpenAIProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    resp = client.chat.completions.create(
        model="gpt-4.1",
        messages=[
            {
                "role": "user",
                "content": f"Call the {tool_name} tool with reasonable default arguments.",
            }
        ],
        tools=tools,
    )
    call = resp.choices[0].message.tool_calls[0]
    return {"args": call.function.arguments}


def test_anthropic_composio(tool_name: str) -> dict:
    import anthropic
    from composio import Composio
    from composio_anthropic import AnthropicProvider

    composio = Composio(provider=AnthropicProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"Call the {tool_name} tool with reasonable default arguments.",
            }
        ],
        tools=tools,
    )
    tool_use = next(block for block in resp.content if block.type == "tool_use")
    return {"args": json.dumps(tool_use.input)}


def test_gemini_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_gemini import GeminiProvider
    from google import genai
    from google.genai import types

    composio = Composio(provider=GeminiProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Call the {tool_name} tool with reasonable default arguments.",
        config=types.GenerateContentConfig(tools=tools),
    )
    fc = resp.candidates[0].content.parts[0].function_call
    return {"args": json.dumps(dict(fc.args))}


def test_openai_agents_composio(tool_name: str) -> dict:
    from agents import Agent, Runner
    from composio import Composio
    from composio_openai_agents import OpenAIAgentsProvider

    composio = Composio(provider=OpenAIAgentsProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    agent = Agent(
        name="test",
        instructions=f"You MUST call the {tool_name} tool with reasonable default arguments.",
        tools=tools,
    )
    result = Runner.run_sync(
        starting_agent=agent,
        input=f"Call the {tool_name} tool with reasonable default arguments.",
    )
    return {"output": result.final_output[:200]}


def test_langchain_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_langchain import LangchainProvider
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI

    composio = Composio(provider=LangchainProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    llm = ChatOpenAI(model="gpt-4.1", api_key=os.environ["OPENAI_API_KEY"])
    resp = llm.bind_tools(tools).invoke(
        [
            HumanMessage(
                content=f"Call the {tool_name} tool with reasonable default arguments."
            )
        ]
    )
    if not resp.tool_calls:
        raise RuntimeError("No tool call in response")
    return {"args": json.dumps(resp.tool_calls[0]["args"])}


def test_crewai_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_crewai import CrewAIProvider

    composio = Composio(provider=CrewAIProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    # CrewAI tools are BaseTool instances; verify they were created successfully
    if not tools:
        raise RuntimeError("No tools returned")
    # Validate schema roundtrip by checking the tool's args_schema
    tool = tools[0]
    schema = tool.args_schema.model_json_schema() if tool.args_schema else {}
    return {
        "args": json.dumps({"schema_props": list(schema.get("properties", {}).keys())})
    }


PROVIDERS = [
    ("OpenAI", test_openai_composio),
    ("Anthropic", test_anthropic_composio),
    ("Google Gemini", test_gemini_composio),
    ("OpenAI Agents SDK", test_openai_agents_composio),
    ("LangChain", test_langchain_composio),
    ("CrewAI", test_crewai_composio),
]


def run_tests(action_path: str):
    tool_name, slug, description = derive_tool_name(action_path)

    print(f"Tool: {tool_name} ({action_path})")
    print(f"Composio tool name: {tool_name}")
    print()

    results = []
    for provider_name, test_fn in PROVIDERS:
        try:
            result = test_fn(tool_name)
            detail = result.get("args") or result.get("output", "")
            results.append((provider_name, "OK", detail))
        except Exception as e:
            error_str = str(e)
            first_line = error_str.split("\n")[0]
            if len(first_line) > 120:
                first_line = first_line[:117] + "..."
            results.append((provider_name, "FAILED", first_line))

    # Print table
    name_width = max(len(r[0]) for r in results)
    status_width = 6
    print(f"{'Provider':<{name_width}}  {'Status':<{status_width}}  Detail")
    print(f"{'-' * name_width}  {'-' * status_width}  {'-' * 60}")
    for pname, status, detail in results:
        print(f"{pname:<{name_width}}  {status:<{status_width}}  {detail}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path_to_action.py>")
        sys.exit(1)

    required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    run_tests(sys.argv[1])
