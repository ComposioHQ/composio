"""CrewAI SWE Agent"""

import os
from enum import Enum
from crewai import LLM
import dotenv
import typing as t
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
from langchain_aws import ChatBedrock
from prompts import BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT, GOAL, ROLE

from composio_crewai import Action, App, ComposioToolSet, WorkspaceType


# Load environment variables from .env
dotenv.load_dotenv()

class Model(str, Enum):
    OPENAI = "openai"

model = Model.OPENAI

# Initialize tool.
if model == Model.OPENAI:
    client = ChatOpenAI(
        api_key=os.environ["OPENAI_API_KEY"],  # type: ignore
        model="gpt-4-1106-preview",
    )
else:
    raise ValueError(f"Invalid model: {model}")

def get_crew(repo_path: str, workspace_id: str):

    composio_toolset = ComposioToolSet(
        workspace_config=WorkspaceType.Docker(),
        metadata={
            App.CODE_ANALYSIS_TOOL: {
                "dir_to_index_path": repo_path,
            }
        },
    )
    if workspace_id:
        composio_toolset.set_workspace_id(workspace_id)

    # Get required tools
    tools = [
        *composio_toolset.get_tools(
            apps=[
                App.FILETOOL,
                App.SHELLTOOL,
                App.CODE_ANALYSIS_TOOL,
            ]
        ),
    ]

    # Define agent
    agent = Agent(
        role=ROLE,
        goal=GOAL,
        backstory=BACKSTORY,
        llm=client,
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
        verbose=True,
        cache=False,
        memory=True,
    )
    return crew, composio_toolset
