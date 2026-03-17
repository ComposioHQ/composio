# ruff: noqa: E402
"""
Tool compatibility tester — Composio providers + direct API calls.

Usage:
    python test_tool_compat_composio_by_name.py <FILE_PATH> [--provider PROVIDER]

Tests a tool via:
  1. Composio provider wrappers (tools.get() → SDK call)
  2. Raw HTTP API calls using schema loaded locally from file via Action.from_file()
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

MAX_RETRIES = 3
RETRY_DELAY = 1
MAX_DETAIL_LENGTH = 250  # Max chars for detail column (0 for unlimited)

MERCURY_PATH = Path.home() / "mercury"

PROVIDER_CHOICES = [
    "openai",
    "anthropic",
    "gemini",
    "agents",
    "langchain",
    "crewai",
    "openai_direct",
    "anthropic_direct",
    "gemini_direct",
    "gemini_stripped",
]


def load_schema(file_path: str) -> tuple[dict, str, str]:
    """Load tool schema from a local action file.

    Returns (schema, description, tool_enum).
    """
    from mercury.tools.base import Action

    action = Action.from_file(Path(file_path).resolve(), root=MERCURY_PATH)
    schema = action.request.schema()
    description = action.description or f"Execute {action.slug}"
    # Derive the full tool enum (e.g. _21RISK_GET_COMPLIANCE) from the action
    # The file path encodes the app name: apps/<app_name>/actions/<action>.py
    parts = Path(file_path).parts
    app_idx = parts.index("apps") if "apps" in parts else None
    if app_idx is not None:
        app_name = parts[app_idx + 1].upper()
        enum = action.enum if hasattr(action, "enum") else action.slug
        if not enum.startswith(app_name):
            enum = f"{app_name}_{enum}"
    else:
        enum = action.slug
    return schema, description, enum


# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------


def with_retries(fn, *args) -> dict:
    """Run a test function with retries for transient failures."""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args)
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


# ---------------------------------------------------------------------------
# Composio provider tests (use composio.tools.get() → provider SDK)
# ---------------------------------------------------------------------------


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
                "content": f"You MUST call the {tool_name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions.",
            }
        ],
        tools=tools,
        tool_choice="required",
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
        contents=f"You MUST call the {tool_name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions.",
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
        input=f"You MUST call the {tool_name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions.",
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
        [
            HumanMessage(
                content=f"You MUST call the {tool_name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions."
            )
        ]
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


# ---------------------------------------------------------------------------
# Direct API tests (raw HTTP calls using local schema from file)
# ---------------------------------------------------------------------------


def test_openai_direct(schema: dict, name: str, description: str) -> dict:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1",
            "messages": [
                {
                    "role": "user",
                    "content": f"You MUST call the {name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions.",
                }
            ],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": description,
                        "parameters": schema,
                    },
                }
            ],
            "tool_choice": "required",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    call = data["choices"][0]["message"]["tool_calls"][0]
    return {"args": call["function"]["arguments"]}


def test_anthropic_direct(schema: dict, name: str, description: str) -> dict:
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": f"You MUST call the {name} tool immediately with reasonable default arguments. Do not ask questions.",
                }
            ],
            "tools": [
                {"name": name, "description": description, "input_schema": schema}
            ],
            "tool_choice": {"type": "any"},
        },
    )
    resp.raise_for_status()
    data = resp.json()
    tool_use = next(block for block in data["content"] if block["type"] == "tool_use")
    return {"args": json.dumps(tool_use["input"])}


GEMINI_UNSUPPORTED_FIELDS = {
    "examples",
    "title",
    "human_parameter_description",
    "human_parameter_name",
    "const",
    "additionalProperties",
}


def _strip_unsupported_fields(obj: dict) -> dict:
    """Recursively strip fields that Gemini's REST API rejects."""
    import copy

    obj = copy.deepcopy(obj)

    def _clean(d):
        if not isinstance(d, dict):
            return
        for key in list(d.keys()):
            if key in GEMINI_UNSUPPORTED_FIELDS:
                del d[key]
            elif isinstance(d[key], dict):
                _clean(d[key])
            elif isinstance(d[key], list):
                for item in d[key]:
                    if isinstance(item, dict):
                        _clean(item)

    _clean(obj)
    return obj


def _call_gemini(
    schema: dict, name: str, description: str, *, force_tool_call: bool = False
) -> dict:
    """Send a tool-calling request to Gemini REST API."""
    api_key = os.environ["GOOGLE_API_KEY"]
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"You MUST call the {name} tool immediately with reasonable default arguments. Use placeholder values like 'test@example.com' for emails, '12345' for IDs, etc. Do not ask questions."
                    }
                ],
            }
        ],
        "tools": [
            {
                "function_declarations": [
                    {
                        "name": name,
                        "description": description,
                        "parameters": schema,
                    }
                ]
            }
        ],
    }
    if force_tool_call:
        body["tool_config"] = {"function_calling_config": {"mode": "ANY"}}
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        headers={"Content-Type": "application/json"},
        json=body,
    )
    resp.raise_for_status()
    data = resp.json()
    for part in data["candidates"][0]["content"]["parts"]:
        if "functionCall" in part:
            return {"args": json.dumps(part["functionCall"]["args"])}
    raise RuntimeError("No function call in response")


def test_gemini_direct(schema: dict, name: str, description: str) -> dict:
    return _call_gemini(schema, name, description)


def test_gemini_stripped(schema: dict, name: str, description: str) -> dict:
    return _call_gemini(
        _strip_unsupported_fields(schema), name, description, force_tool_call=True
    )


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

# "composio" providers take (tool_name: str)
# "direct" providers take (schema: dict, name: str, description: str)
COMPOSIO_PROVIDERS = {
    "openai": ("OpenAI (Composio)", test_openai_composio),
    "anthropic": ("Anthropic (Composio)", test_anthropic_composio),
    "gemini": ("Gemini (Composio)", test_gemini_composio),
    "agents": ("Agents SDK (Composio)", test_openai_agents_composio),
    "langchain": ("LangChain (Composio)", test_langchain_composio),
    "crewai": ("CrewAI (Composio)", test_crewai_composio),
}

DIRECT_PROVIDERS = {
    "openai_direct": ("OpenAI (Direct)", test_openai_direct),
    "anthropic_direct": ("Anthropic (Direct)", test_anthropic_direct),
    "gemini_direct": ("Gemini (Direct)", test_gemini_direct),
    "gemini_stripped": ("Gemini (Stripped)", test_gemini_stripped),
}


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------


def run_tests(
    tool_name: str,
    schema: dict,
    description: str,
    file_path: str,
    provider: str | None = None,
):
    fn_name = tool_name.lower()[:64]

    props = list(schema.get("properties", {}).keys())
    print(f"Tool: {tool_name}")
    print(f"File: {file_path}")
    print(
        f"Schema properties ({len(props)}): {props[:10]}{'...' if len(props) > 10 else ''}"
    )
    print()

    results = []

    # Build unified list of (key, display_name, test_fn)
    all_providers = {**COMPOSIO_PROVIDERS, **DIRECT_PROVIDERS}
    if provider:
        items = [(provider, all_providers[provider])]
    else:
        items = list(all_providers.items())

    def _run_one(key, display_name, test_fn):
        # Ensure each thread has an event loop (needed by Agents SDK's Runner.run_sync)
        import asyncio

        try:
            asyncio.get_event_loop()
        except RuntimeError:
            asyncio.set_event_loop(asyncio.new_event_loop())

        is_direct = key in DIRECT_PROVIDERS
        args = (schema, fn_name, description) if is_direct else (tool_name,)
        try:
            result = with_retries(test_fn, *args)
            detail = result.get("args") or result.get("output", "")
            if (
                MAX_DETAIL_LENGTH > 0
                and isinstance(detail, str)
                and len(detail) > MAX_DETAIL_LENGTH
            ):
                detail = detail[: MAX_DETAIL_LENGTH - 3] + "..."
            return (display_name, "OK", detail)
        except Exception as e:
            error_str = str(e)
            first_line = error_str.split("\n")[0]
            if MAX_DETAIL_LENGTH > 0 and len(first_line) > MAX_DETAIL_LENGTH:
                first_line = first_line[: MAX_DETAIL_LENGTH - 3] + "..."
            return (display_name, "FAILED", first_line)

    # Run all providers concurrently, preserve original order
    order = {key: i for i, (key, _) in enumerate(items)}
    indexed_results: list[tuple[int, tuple]] = []
    with ThreadPoolExecutor(max_workers=len(items)) as pool:
        futures = {
            pool.submit(_run_one, key, dname, fn): key for key, (dname, fn) in items
        }
        for future in as_completed(futures):
            key = futures[future]
            indexed_results.append((order[key], future.result()))
    indexed_results.sort(key=lambda x: x[0])
    results = [r for _, r in indexed_results]

    name_width = max(len(r[0]) for r in results)
    status_width = 6
    print(f"{'Provider':<{name_width}}  {'Status':<{status_width}}  Detail")
    print(f"{'-' * name_width}  {'-' * status_width}  {'-' * 60}")
    for pname, status, detail in results:
        print(f"{pname:<{name_width}}  {status:<{status_width}}  {detail}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test tool schema compatibility across Composio providers and direct API calls."
    )
    parser.add_argument(
        "file_path",
        help="Path to the local action file (e.g. apps/_21risk/actions/get_compliance.py)",
    )
    parser.add_argument(
        "--provider",
        choices=PROVIDER_CHOICES,
        default=None,
        help="Test a single provider instead of all",
    )
    args = parser.parse_args()

    if not (MERCURY_PATH / args.file_path).exists():
        print(f"File not found: {MERCURY_PATH / args.file_path}")
        sys.exit(1)

    required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    schema, description, tool_name = load_schema(str(MERCURY_PATH / args.file_path))
    run_tests(tool_name, schema, description, args.file_path, args.provider)
