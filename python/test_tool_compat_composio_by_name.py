# ruff: noqa: E402
"""
Tool compatibility tester for Composio providers — by tool name.

Usage:
    python test_tool_compat_composio_by_name.py <TOOL_NAME>

Tests a tool via each Composio provider's tools.get() and reports
which providers can successfully wrap and use the tool schema.
"""

import json
import os
import sys


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
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Call the {tool_name} tool with reasonable defaults.",
        config=types.GenerateContentConfig(tools=tools),
    )
    # Gemini provider uses AFC — check for function_call, fall back to text
    for part in resp.candidates[0].content.parts:
        if part.function_call:
            return {"args": json.dumps(dict(part.function_call.args))}
    text = resp.candidates[0].content.parts[0].text or ""
    return {"output": f"(AFC) {text[:150]}"}


def test_openai_agents_composio(tool_name: str) -> dict:
    from agents import Agent, Runner
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
    result = crew.kickoff()
    return {"output": str(result)[:200]}


PROVIDERS = [
    ("OpenAI", test_openai_composio),
    ("Anthropic", test_anthropic_composio),
    ("Google Gemini", test_gemini_composio),
    ("OpenAI Agents SDK", test_openai_agents_composio),
    ("LangChain", test_langchain_composio),
    ("CrewAI", test_crewai_composio),
]


def run_tests(tool_name: str):
    print(f"Tool: {tool_name}")
    print()

    results = []
    for provider_name, test_fn in PROVIDERS:
        try:
            result = test_fn(tool_name)
            detail = result.get("args") or result.get("output", "")
            if isinstance(detail, str) and len(detail) > 120:
                detail = detail[:117] + "..."
            results.append((provider_name, "OK", detail))
        except Exception as e:
            error_str = str(e)
            first_line = error_str.split("\n")[0]
            if len(first_line) > 120:
                first_line = first_line[:117] + "..."
            results.append((provider_name, "FAILED", first_line))

    name_width = max(len(r[0]) for r in results)
    status_width = 6
    print(f"{'Provider':<{name_width}}  {'Status':<{status_width}}  Detail")
    print(f"{'-' * name_width}  {'-' * status_width}  {'-' * 60}")
    for pname, status, detail in results:
        print(f"{pname:<{name_width}}  {status:<{status_width}}  {detail}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <TOOL_NAME>")
        sys.exit(1)

    required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    run_tests(sys.argv[1])
