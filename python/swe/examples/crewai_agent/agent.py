"""CrewAI SWE Agent"""

# isort: skip_file

import dotenv
import os
import typing as t
from composio_crewai import App, Action, ComposioToolSet, WorkspaceType
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain_anthropic import ChatAnthropic
from prompts import BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT, GOAL, ROLE
from tools import calculate_operation

from composio_crewai import App, ComposioToolSet, WorkspaceType


# Load environment variables from .env
dotenv.load_dotenv()


# Initialize tool.
def get_langchain_llm() -> t.Union[ChatOpenAI, AzureChatOpenAI, ChatAnthropic]:
    helicone_api_key = os.environ.get("HELICONE_API_KEY")
    if os.environ.get("ANTHROPIC_API_KEY"):
        if helicone_api_key:
            print("Using Anthropic with Helicone")
            return ChatAnthropic(
                model_name="claude-3-5-sonnet-20240620",
                anthropic_api_url="https://anthropic.helicone.ai/",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )  # type: ignore
        print("Using Anthropic without Helicone")
        return ChatAnthropic(model_name="claude-3-5-sonnet-20240620")  # type: ignore
    if os.environ.get("OPENAI_API_KEY"):
        if helicone_api_key:
            print("Using OpenAI with Helicone")
            return ChatOpenAI(
                model="gpt-4-turbo",
                base_url="https://oai.helicone.ai/v1",
                default_headers={
                    "Helicone-Auth": f"Bearer {helicone_api_key}",
                },
            )
        print("Using OpenAI without Helicone")
        return ChatOpenAI(model="gpt-4-turbo")
    if os.environ.get("AZURE_OPENAI_API_KEY"):
        print("Using Azure OpenAI")
        return AzureChatOpenAI(model="test")

    raise RuntimeError(
        "Could not find API key for any supported LLM models, "
        "please export either `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` "
        "or `AZURE_OPENAI_API_KEY`"
    )


composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Docker())

# Get required tools
tools = [
    *composio_toolset.get_tools(
        apps=[
            App.FILETOOL,
            App.SEARCHTOOL,
        ]
    ),
    *composio_toolset.get_actions(
        actions=[
            Action.SHELL_EXEC_COMMAND,
        ]
    ),
]

tools.append(*composio_toolset.get_actions(actions=[calculate_operation]))

# Define agent
agent = Agent(
    role=ROLE,
    goal=GOAL,
    backstory=BACKSTORY,
    llm=get_langchain_llm(),
    tools=tools,
    verbose=True,
)

task = Task(
    description=DESCRIPTION,
    expected_output=EXPECTED_OUTPUT,
    agent=agent,
)

crew = Crew(
    agents=[agent],
    tasks=[task],
    process=Process.sequential,
    full_output=True,
    verbose=True,
    cache=False,
    memory=True,
)
