# ruff: noqa: E402
"""
Tool compatibility tester for Composio providers — by tool name.

Usage:
    python test_tool_compat_composio_by_name.py <TOOL_NAME> [--provider PROVIDER]

Tests a tool via each Composio provider's tools.get() and reports
which providers can successfully wrap and use the tool schema.
"""

import argparse
import json
import os
import sys
import time

MAX_RETRIES = 3
RETRY_DELAY = 2
MAX_DETAIL_LENGTH = 250  # Max chars for detail column (0 for unlimited)

PROVIDER_CHOICES = ["openai", "anthropic", "gemini", "agents", "langchain", "crewai"]


def with_retries(fn, tool_name: str) -> dict:
    """Run a test function with retries for transient failures."""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(tool_name)
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            retryable = (
                "no function call" in err_str
                or "no tool call" in err_str
                or "tool was not called" in err_str
                or "connection error" in err_str
                or "timeout" in err_str
                or "rate limit" in err_str
            )
            if retryable and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            raise
    raise last_err


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
                "content": f"Call the {tool_name} tool with reasonable defaults.",
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
                "content": f"You MUST call the {tool_name} tool immediately with reasonable default arguments. Do not ask questions.",
            }
        ],
        tools=tools,
        tool_choice={"type": "any"},
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
    # Disable AFC to get raw function_call with exact args
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Call the {tool_name} tool with reasonable defaults.",
        config=types.GenerateContentConfig(
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(
                disable=True,
            ),
        ),
    )
    for part in resp.candidates[0].content.parts:
        if part.function_call:
            return {"args": json.dumps(dict(part.function_call.args))}
    raise RuntimeError("No function call in response")


def test_openai_agents_composio(tool_name: str) -> dict:
    from agents import Agent, Runner
    from agents.items import ToolCallItem
    from composio import Composio
    from composio_openai_agents import OpenAIAgentsProvider

    composio = Composio(provider=OpenAIAgentsProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    agent = Agent(
        name="test",
        instructions=f"You MUST call the {tool_name} tool with reasonable defaults.",
        tools=tools,
    )
    result = Runner.run_sync(
        starting_agent=agent,
        input=f"Call the {tool_name} tool with reasonable defaults.",
    )
    # Extract tool call args from run items
    for item in result.new_items:
        if isinstance(item, ToolCallItem):
            return {"args": item.raw_item.arguments}
    raise RuntimeError("No tool call in run items")


def test_langchain_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_langchain import LangchainProvider
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI

    composio = Composio(provider=LangchainProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    llm = ChatOpenAI(model="gpt-4.1", api_key=os.environ["OPENAI_API_KEY"])
    resp = llm.bind_tools(tools).invoke(
        [HumanMessage(content=f"Call the {tool_name} tool with reasonable defaults.")]
    )
    if not resp.tool_calls:
        raise RuntimeError("No tool call in response")
    return {"args": json.dumps(resp.tool_calls[0]["args"])}


def test_crewai_composio(tool_name: str) -> dict:
    from composio import Composio
    from composio_crewai import CrewAIProvider
    from crewai import Agent, Crew, Task

    composio = Composio(provider=CrewAIProvider())
    tools = composio.tools.get(user_id="default", tools=[tool_name])
    if not tools:
        raise RuntimeError("No tools returned")

    # Monkey-patch the tool's _run to capture args
    captured_args = []
    original_run = tools[0]._run

    def capturing_run(**kwargs):
        captured_args.append(kwargs)
        return original_run(**kwargs)

    tools[0]._run = capturing_run

    agent = Agent(
        role="Tool Tester",
        goal=f"Call the {tool_name} tool with reasonable default arguments.",
        backstory="You are a QA agent that tests tools by calling them.",
        tools=tools,
        llm="gpt-4.1",
        verbose=False,
    )
    task = Task(
        description=f"Call the {tool_name} tool with reasonable default arguments. You MUST use the tool.",
        expected_output="The result of calling the tool.",
        agent=agent,
    )
    crew = Crew(agents=[agent], tasks=[task], verbose=False)
    crew.kickoff()
    if captured_args:
        return {"args": json.dumps(captured_args[0], default=str)}
    raise RuntimeError("Tool was not called")


PROVIDERS = {
    "openai": ("OpenAI", test_openai_composio),
    "anthropic": ("Anthropic", test_anthropic_composio),
    "gemini": ("Google Gemini", test_gemini_composio),
    "agents": ("OpenAI Agents SDK", test_openai_agents_composio),
    "langchain": ("LangChain", test_langchain_composio),
    "crewai": ("CrewAI", test_crewai_composio),
}


def run_tests(tool_name: str, provider: str | None = None):
    print(f"Tool: {tool_name}")
    print()

    if provider:
        items = [(provider, PROVIDERS[provider])]
    else:
        items = list(PROVIDERS.items())

    results = []
    for key, (display_name, test_fn) in items:
        try:
            result = with_retries(test_fn, tool_name)
            detail = result.get("args") or result.get("output", "")
            if (
                MAX_DETAIL_LENGTH > 0
                and isinstance(detail, str)
                and len(detail) > MAX_DETAIL_LENGTH
            ):
                detail = detail[: MAX_DETAIL_LENGTH - 3] + "..."
            results.append((display_name, "OK", detail))
        except Exception as e:
            error_str = str(e)
            first_line = error_str.split("\n")[0]
            if MAX_DETAIL_LENGTH > 0 and len(first_line) > MAX_DETAIL_LENGTH:
                first_line = first_line[: MAX_DETAIL_LENGTH - 3] + "..."
            results.append((display_name, "FAILED", first_line))

    name_width = max(len(r[0]) for r in results)
    status_width = 6
    print(f"{'Provider':<{name_width}}  {'Status':<{status_width}}  Detail")
    print(f"{'-' * name_width}  {'-' * status_width}  {'-' * 60}")
    for pname, status, detail in results:
        print(f"{pname:<{name_width}}  {status:<{status_width}}  {detail}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test tool schema compatibility across Composio providers."
    )
    parser.add_argument(
        "tool_name", help="Composio tool name (e.g. SLACK_SEND_MESSAGE)"
    )
    parser.add_argument(
        "--provider",
        choices=PROVIDER_CHOICES,
        default=None,
        help="Test a single provider instead of all",
    )
    args = parser.parse_args()

    required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    run_tests(args.tool_name, args.provider)
