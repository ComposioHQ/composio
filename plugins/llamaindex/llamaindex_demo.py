from llama_index.llms.openai import OpenAI
from llama_index.core.llms import ChatMessage
from llama_index.core.agent import FunctionCallingAgentWorker

import dotenv
from llama_index.core.tools import FunctionTool
from composio_llamaindex import App, Action, ComposioToolSet

# Load environment variables from .env
dotenv.load_dotenv()

# Get All the tools
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)

# print("******", tools[0].metadata)
from pydantic import Field
from llama_index.core.tools import FunctionTool


def star_repo(
    owner, #: str = Field(description="Owner of target repo"),
    repo, #: str = Field(description="name of  target repo"),
) -> dict:
    """
    Star a github repository
    """
    print("Triggered Github Tool", owner, repo)
    return {"executed": True}


tools = [FunctionTool.from_defaults(star_repo)]

print("******", tools[0].metadata)

llm = OpenAI(model="gpt-4o")

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
        ),
    )
]

worker = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
)

agent = worker.as_agent()
response = agent.chat("Hello! I would like to star a repo SamparkAI/docs on GitHub")
print(response)