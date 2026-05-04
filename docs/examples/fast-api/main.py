# region setup
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from fastapi import FastAPI
from pydantic import BaseModel

composio = Composio(provider=OpenAIAgentsProvider())

app = FastAPI()
# endregion setup


# region chat
class ChatRequest(BaseModel):
    user_id: str
    message: str


@app.post("/chat")
def chat(request: ChatRequest):
    """Send a message to an AI agent with access to all tools."""
    session = composio.create(user_id=request.user_id)
    tools = session.tools()

    agent = Agent(
        name="Assistant",
        instructions="You are a helpful assistant. Use tools to help the user.",
        tools=tools,
    )

    result = Runner.run_sync(starting_agent=agent, input=request.message)
    return {"response": result.final_output}
# endregion chat


# region list-connections
@app.get("/connections/{user_id}")
def list_connections(user_id: str):
    """List all toolkits and their connection status for a user."""
    session = composio.create(user_id=user_id)
    toolkits = session.toolkits()
    return [
        {"toolkit": t.slug, "connected": t.connection.is_active if t.connection else False}
        for t in toolkits.items
    ]
# endregion list-connections


# region check-connection
@app.get("/connections/{user_id}/{toolkit}")
def check_connection(user_id: str, toolkit: str):
    """Check if a specific toolkit is connected for a user."""
    session = composio.create(user_id=user_id, toolkits=[toolkit])
    toolkits = session.toolkits()
    for t in toolkits.items:
        if t.slug == toolkit:
            return {"toolkit": toolkit, "connected": t.connection.is_active if t.connection else False}
    return {"toolkit": toolkit, "connected": False}
# endregion check-connection


# region connect
class ConnectRequest(BaseModel):
    user_id: str


@app.post("/connect/{toolkit}")
def connect_toolkit(toolkit: str, request: ConnectRequest):
    """Start OAuth for a toolkit. Returns a URL to redirect the user to."""
    session = composio.create(user_id=request.user_id, toolkits=[toolkit])
    connection_request = session.authorize(toolkit)
    return {"redirect_url": connection_request.redirect_url}
# endregion connect
