# ruff: noqa: E402
import json
import os

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

TOOL_NAME = "_21RISK_GET_COMPLIANCE"
PROMPT = "Get compliance records where Rank > 5"

# --- OpenAI via Composio ---
from composio import Composio
from composio_openai import OpenAIProvider
from openai import OpenAI

print("=== OpenAI via Composio ===")
try:
    composio_openai = Composio(provider=OpenAIProvider())
    tools = composio_openai.tools.get(user_id="default", tools=[TOOL_NAME])
    client = OpenAI(api_key=OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4.1",
        messages=[{"role": "user", "content": PROMPT}],
        tools=tools,
    )
    call = resp.choices[0].message.tool_calls[0]
    print("Status: OK")
    print(f"Args: {call.function.arguments}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Anthropic via Composio ---
from composio_anthropic import AnthropicProvider
import anthropic

print("\n=== Anthropic via Composio ===")
try:
    composio_anthropic = Composio(provider=AnthropicProvider())
    tools = composio_anthropic.tools.get(user_id="default", tools=[TOOL_NAME])
    anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    resp = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": PROMPT}],
        tools=tools,
    )
    tool_use = next(block for block in resp.content if block.type == "tool_use")
    print("Status: OK")
    print(f"Args: {json.dumps(tool_use.input)}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Google Gemini via Composio ---
from composio_gemini import GeminiProvider
from google import genai
from google.genai import types

print("\n=== Google Gemini via Composio ===")
try:
    composio_gemini = Composio(provider=GeminiProvider())
    tools = composio_gemini.tools.get(user_id="default", tools=[TOOL_NAME])
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    resp = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=PROMPT,
        config=types.GenerateContentConfig(tools=tools),
    )
    fc = resp.candidates[0].content.parts[0].function_call
    print("Status: OK")
    print(f"Args: {dict(fc.args)}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- OpenAI Agents SDK via Composio ---
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

print("\n=== OpenAI Agents SDK via Composio ===")
try:
    composio_agents = Composio(provider=OpenAIAgentsProvider())
    tools = composio_agents.tools.get(user_id="default", tools=[TOOL_NAME])
    agent = Agent(
        name="test_agent",
        instructions="You are a helpful assistant. Use the provided tools.",
        tools=tools,
    )
    result = Runner.run_sync(
        starting_agent=agent,
        input=PROMPT,
    )
    print("Status: OK")
    print(f"Output: {result.final_output[:200]}")
except Exception as e:
    print(f"Status: FAILED\nError: {e}")

# --- Google ADK via Composio ---
from composio_google_adk import GoogleAdkProvider
from google.adk.agents import Agent as AdkAgent
from google.adk.runners import Runner as AdkRunner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

print("\n=== Google ADK via Composio ===")
try:
    composio_adk = Composio(provider=GoogleAdkProvider())
    tools = composio_adk.tools.get(user_id="default", tools=[TOOL_NAME])
    adk_agent = AdkAgent(
        name="test_agent",
        model="gemini-2.0-flash",
        description="A helpful assistant.",
        instruction="Use the provided tools to help users.",
        tools=tools,
    )

    import asyncio

    async def run_adk():
        session_service = InMemorySessionService()
        adk_runner = AdkRunner(
            agent=adk_agent, app_name="test", session_service=session_service
        )
        session = await session_service.create_session(
            app_name="test", user_id="default"
        )

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=PROMPT)],
        )

        events = list(
            adk_runner.run(
                user_id="default", session_id=session.id, new_message=content
            )
        )
        final = events[-1] if events else None
        if final and final.content and final.content.parts:
            print("Status: OK")
            print(f"Output: {final.content.parts[0].text[:200]}")
        else:
            print("Status: OK (no text output)")
            print(f"Events: {len(events)}")

    asyncio.run(run_adk())
except Exception as e:
    print(f"Status: FAILED\nError: {e}")
