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

# --- LangChain direct ---
from json_schema_to_pydantic import create_model as create_pydantic_model
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

print("\n=== LangChain Direct (non-strict) ===")
try:
    langchain_tool_calls = []
    ArgsModel = create_pydantic_model(request_schema)

    def get_compliance_lc(**kwargs) -> str:
        langchain_tool_calls.append(kwargs)
        return json.dumps({"status": "ok", "data": [{"Name": "Site A", "Rank": 7}]})

    lc_tool = StructuredTool.from_function(
        func=get_compliance_lc,
        name="get_compliance",
        description="Retrieve compliance data.",
        args_schema=ArgsModel,
    )

    llm = ChatOpenAI(model="gpt-4.1", api_key=OPENAI_API_KEY)
    llm_with_tools = llm.bind_tools([lc_tool])
    resp = llm_with_tools.invoke(
        [
            HumanMessage(
                content="Use get_compliance with $filter set to 'Rank gt 5'. Only set the $filter parameter, nothing else."
            )
        ]
    )
    if resp.tool_calls:
        print("Status: OK")
        print(f"Args: {json.dumps(resp.tool_calls[0]['args'])}")
    else:
        print("Status: FAILED (no tool call)")
        print(f"Output: {resp.content[:200]}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- CrewAI direct ---
from crewai.tools import BaseTool as CrewAIBaseTool

print("\n=== CrewAI Direct (non-strict) ===")
try:
    crewai_tool_calls = []

    CrewAIArgsModel = create_pydantic_model(request_schema)

    class GetComplianceCrewAI(CrewAIBaseTool):
        name: str = "get_compliance"
        description: str = "Retrieve compliance data."
        args_schema: type = CrewAIArgsModel

        def _run(self, **kwargs) -> str:
            crewai_tool_calls.append(kwargs)
            return json.dumps({"status": "ok", "data": [{"Name": "Site A", "Rank": 7}]})

    crewai_tool = GetComplianceCrewAI()

    # CrewAI uses LLM underneath; test schema acceptance by invoking tool directly
    test_args = CrewAIArgsModel.model_validate({"$filter": "Rank gt 5"})
    result = crewai_tool._run(**test_args.model_dump(exclude_none=True))
    if crewai_tool_calls:
        print("Status: OK")
        print(f"Args: {json.dumps(crewai_tool_calls[0])}")
    else:
        print("Status: FAILED (tool was not called)")
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
