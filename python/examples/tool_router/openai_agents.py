import os

from agents import Agent, HostedMCPTool, Runner

from composio import Composio

composio = Composio()
session = composio.create(
    # A user with a connected Gmail account (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    # mcp=True surfaces session.mcp on the returned type
    mcp=True,
)

print(session.mcp)

composio_mcp = HostedMCPTool(
    tool_config={
        "type": "mcp",
        "server_label": "tool_router",
        "server_url": session.mcp.url,
        "require_approval": "never",
        "headers": session.mcp.headers,  # type: ignore[typeddict-item]  # headers is typed Dict[str, Optional[str]]; the SDK always populates it with str values
    }
)

agent = Agent(
    name="My Agent",
    instructions="You are a helpful assistant that can use the tools provided to you.",
    tools=[composio_mcp],
)

result = Runner.run_sync(
    starting_agent=agent,
    input="Find my last email and summarize it.",
)

print(result.final_output)
