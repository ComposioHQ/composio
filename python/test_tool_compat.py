# ruff: noqa: E402
"""
Tool compatibility tester for direct AI providers.

Usage:
    python test_tool_compat.py <path_to_action.py>

Tests a mercury Action's JSON schema against each provider's tool-calling API
and reports which providers accept or reject it.
"""

import json
import os
import sys
from pathlib import Path

from mercury.tools.base import Action


def load_action(path: str) -> Action:
    return Action.from_file(Path(path).resolve())


def test_openai_direct(schema: dict, name: str, description: str) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    tool_def = {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": schema,
        },
    }
    resp = client.chat.completions.create(
        model="gpt-4.1",
        messages=[
            {
                "role": "user",
                "content": f"Call the {name} tool with reasonable default arguments.",
            }
        ],
        tools=[tool_def],
    )
    call = resp.choices[0].message.tool_calls[0]
    return {"args": call.function.arguments}


def test_anthropic_direct(schema: dict, name: str, description: str) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"Call the {name} tool with reasonable default arguments.",
            }
        ],
        tools=[
            {
                "name": name,
                "description": description,
                "input_schema": schema,
            }
        ],
    )
    tool_use = next(block for block in resp.content if block.type == "tool_use")
    return {"args": json.dumps(tool_use.input)}


def test_gemini_direct(schema: dict, name: str, description: str) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    tool = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=name,
                description=description,
                parameters=schema,
            )
        ]
    )
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Call the {name} tool with reasonable default arguments.",
        config=types.GenerateContentConfig(tools=[tool]),
    )
    fc = resp.candidates[0].content.parts[0].function_call
    return {"args": json.dumps(dict(fc.args))}


def test_openai_agents_direct(schema: dict, name: str, description: str) -> dict:
    from agents import Agent, FunctionTool, Runner

    captured = []

    async def handler(ctx, args):
        captured.append(args)
        return json.dumps({"status": "ok"})

    tool = FunctionTool(
        name=name,
        description=description,
        params_json_schema=schema,
        on_invoke_tool=handler,
        strict_json_schema=False,
    )
    agent = Agent(
        name="test",
        instructions=f"You MUST call the {name} tool with reasonable default arguments.",
        tools=[tool],
    )
    Runner.run_sync(
        starting_agent=agent,
        input=f"Call the {name} tool with reasonable default arguments.",
    )
    if not captured:
        raise RuntimeError("Tool was not called by the agent")
    return {"args": captured[0]}


def test_langchain_direct(schema: dict, name: str, description: str) -> dict:
    from json_schema_to_pydantic import create_model as create_pydantic_model
    from langchain_core.messages import HumanMessage
    from langchain_core.tools import StructuredTool
    from langchain_openai import ChatOpenAI

    args_model = create_pydantic_model(schema)

    def noop(**kwargs) -> str:
        return json.dumps({"status": "ok"})

    tool = StructuredTool.from_function(
        func=noop,
        name=name,
        description=description,
        args_schema=args_model,
    )
    llm = ChatOpenAI(model="gpt-4.1", api_key=os.environ["OPENAI_API_KEY"])
    resp = llm.bind_tools([tool]).invoke(
        [
            HumanMessage(
                content=f"Call the {name} tool with reasonable default arguments. Only use parameters with $ prefix if they exist."
            )
        ]
    )
    if not resp.tool_calls:
        raise RuntimeError("No tool call in response")
    return {"args": json.dumps(resp.tool_calls[0]["args"])}


def test_crewai_direct(schema: dict, name: str, description: str) -> dict:
    from json_schema_to_pydantic import create_model as create_pydantic_model
    from crewai.tools import BaseTool as CrewAIBaseTool

    args_model = create_pydantic_model(schema)
    captured = []
    _name = name
    _description = description

    class DynamicTool(CrewAIBaseTool):
        name: str = _name
        description: str = _description
        args_schema: type = args_model

        def _run(self, **kwargs) -> str:
            captured.append(kwargs)
            return json.dumps({"status": "ok"})

    tool = DynamicTool()
    # Test schema round-trip: validate sample args through Pydantic, then invoke
    first_prop = next(iter(schema.get("properties", {})), None)
    sample = {first_prop: "test"} if first_prop else {}
    validated = args_model.model_validate(sample)
    tool._run(**validated.model_dump(exclude_none=True))
    if not captured:
        raise RuntimeError("Tool was not called")
    return {"args": json.dumps(captured[0])}


PROVIDERS = [
    ("OpenAI", test_openai_direct),
    ("Anthropic", test_anthropic_direct),
    ("Google Gemini", test_gemini_direct),
    ("OpenAI Agents SDK", test_openai_agents_direct),
    ("LangChain", test_langchain_direct),
    ("CrewAI", test_crewai_direct),
]


def run_tests(action_path: str):
    action = load_action(action_path)
    schema = action.request.schema()
    name = action.name
    description = action.description or f"Execute {name}"

    print(f"Tool: {action.slug} ({action_path})")
    print(f"Schema properties: {list(schema.get('properties', {}).keys())}")
    print()

    results = []
    for provider_name, test_fn in PROVIDERS:
        try:
            result = test_fn(schema, name, description)
            results.append((provider_name, "OK", result.get("args", "")))
        except Exception as e:
            error_str = str(e)
            # Truncate long errors to first line
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

    # Check env vars
    required = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        sys.exit(1)

    run_tests(sys.argv[1])
