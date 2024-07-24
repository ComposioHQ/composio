from llama_agents import (
    AgentService,
    AgentOrchestrator,
    ControlPlaneServer,
    SimpleMessageQueue,
    LocalLauncher
)

from llama_index.core.agent import ReActAgent
from llama_index.llms.openai import OpenAI
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from composio_llamaindex import App, ComposioToolSet, WorkspaceType
from prompts import BACKSTORY, GOAL, ROLE


composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Docker())
tools = composio_toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])

agent = ReActAgent.from_tools(
    list(tools), 
    llm=OpenAI(model="gpt-4-turbo"), 
    chat_history=[ChatMessage(role=MessageRole.SYSTEM, content=f"Your role is {ROLE}\n Your backstory: {BACKSTORY}\n Your goal is: {GOAL}")],
)

# create our multi-agent framework components
message_queue = SimpleMessageQueue(port=8000)
control_plane = ControlPlaneServer(
    message_queue=message_queue,
    orchestrator=AgentOrchestrator(llm=OpenAI(model="gpt-4-turbo")),
    port=8001,
)

agent_server = AgentService(
    agent=agent,
    message_queue=message_queue,
    service_name="software_engineer", #Expected a string that matches the pattern '^[a-zA-Z0-9_-]+$'."
    port=8002,
)

launcher = LocalLauncher(
    [agent_server],
    control_plane,
    message_queue,
)
