# ruff: noqa: E402
import json
import os
from pathlib import Path
from mercury.tools.base import Action


OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

missing = [
    k
    for k, v in {
        "OPENAI_API_KEY": OPENAI_API_KEY,
        "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
        "GOOGLE_API_KEY": GOOGLE_API_KEY,
    }.items()
    if not v
]
if missing:
    raise KeyError(f"Missing required environment variables: {', '.join(missing)}")

request_schema = Action.from_file(
    Path("apps/_21risk/actions/get_compliance.py").resolve()
).request.schema()
print("=== Raw Schema ===")
print(json.dumps(request_schema, indent=2))

# --- OpenAI direct (non-strict) ---
from openai import OpenAI

client = OpenAI(api_key=OPENAI_API_KEY)
function_def = {
    "type": "function",
    "function": {
        "name": "get_compliance",
        "description": "Retrieve compliance data.",
        "parameters": request_schema,
    },
}

print("\n=== OpenAI Direct (non-strict) ===")
try:
    resp = client.chat.completions.create(
        model="gpt-4.1",
        messages=[{"role": "user", "content": "Get compliance records where Rank > 5"}],
        tools=[function_def],
    )
    call = resp.choices[0].message.tool_calls[0]
    print("Status: OK")
    print(f"Args: {call.function.arguments}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Anthropic direct (non-strict) ---
import anthropic

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

print("\n=== Anthropic Direct (non-strict) ===")
try:
    resp = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Get compliance records where Rank > 5"}],
        tools=[
            {
                "name": "get_compliance",
                "description": "Retrieve compliance data.",
                "input_schema": request_schema,
            }
        ],
    )
    tool_use = next(block for block in resp.content if block.type == "tool_use")
    print("Status: OK")
    print(f"Args: {json.dumps(tool_use.input)}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Google Gemini direct (non-strict) ---
from google import genai
from google.genai import types

print("\n=== Google Gemini Direct (non-strict) ===")
try:
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    # Convert JSON schema to Gemini FunctionDeclaration
    gemini_tool = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="get_compliance",
                description="Retrieve compliance data.",
                parameters=request_schema,
            )
        ]
    )

    resp = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Get compliance records where Rank > 5",
        config=types.GenerateContentConfig(tools=[gemini_tool]),
    )
    fc = resp.candidates[0].content.parts[0].function_call
    print("Status: OK")
    print(f"Args: {dict(fc.args)}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- OpenAI Agents SDK direct ---
from agents import Agent, FunctionTool, Runner

print("\n=== OpenAI Agents SDK Direct (non-strict) ===")
try:
    agents_sdk_tool_calls = []

    async def handle_tool_call(ctx, args):
        agents_sdk_tool_calls.append(args)
        return json.dumps({"status": "ok", "data": [{"Name": "Site A", "Rank": 7}]})

    agent_tool = FunctionTool(
        name="get_compliance",
        description="Retrieve compliance data.",
        params_json_schema=request_schema,
        on_invoke_tool=handle_tool_call,
        strict_json_schema=False,
    )

    agent = Agent(
        name="test_agent",
        instructions="You are a helpful assistant. Use the provided tools.",
        tools=[agent_tool],
    )

    result = Runner.run_sync(
        starting_agent=agent,
        input="Get compliance records where Rank > 5",
    )
    if agents_sdk_tool_calls:
        print("Status: OK")
        print(f"Args: {agents_sdk_tool_calls[0]}")
    else:
        print("Status: FAILED (tool was not called)")
        print(f"Output: {result.final_output[:200]}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Google ADK direct ---

print("\n=== Google ADK Direct (non-strict) ===")
print("Status: SKIPPED")
print(
    "Reason: Google ADK only accepts Python callables (Callable | BaseTool | BaseToolset) as tools."
)
print(
    "  It cannot consume a raw JSON schema directly. A dynamic function with a matching signature"
)
print(
    "  must be constructed from the schema, which is what the Composio provider handles."
)
