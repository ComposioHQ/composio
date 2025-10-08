from composio_google_adk import GoogleAdkProvider
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from composio import Composio

# ADK config
model = "gemini-2.0-flash"
app_name = "weather_sentiment_agent"
session_id = "1234"
user_id = "user1234"

# Initialize composio tools
composio = Composio(provider=GoogleAdkProvider())
tools = composio.tools.get(user_id=user_id, toolkits=["GITHUB"])

# Agent
weather_sentiment_agent = Agent(
    name=app_name,
    model=model,
    instruction="You are a github utility agent with ability to interact with github APIs",
    tools=tools,
)

# Session and Runner
session_service = InMemorySessionService()
session = session_service.create_session_sync(
    app_name=app_name,
    user_id=user_id,
    session_id=session_id,
)
runner = Runner(
    agent=weather_sentiment_agent,
    app_name=app_name,
    session_service=session_service,
)


# Agent Interaction
content = types.Content(
    role="user",
    parts=[
        types.Part(
            text="Star github repository composiohq/composio",
        )
    ],
)
events = runner.run(
    user_id=user_id,
    session_id=session_id,
    new_message=content,
)
for event in events:
    if (
        event.is_final_response()
        and event.content is not None
        and event.content.parts
        and len(event.content.parts) > 0
    ):
        print("Agent Response: ", event.content.parts[0].text)
