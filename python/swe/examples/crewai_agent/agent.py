"""CrewAI SWE Agent"""

# isort: skip_file

import dotenv
import os
import typing as t
from composio_crewai import App, ComposioToolSet, WorkspaceType
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_community.chat_models import BedrockChat
from langchain_google_vertexai import ChatVertexAI
from prompts import BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT, GOAL, ROLE


# Load environment variables from .env
dotenv.load_dotenv()


# Initialize tool.
def get_langchain_llm() -> (
    t.Union[ChatOpenAI, AzureChatOpenAI, ChatAnthropic, ChatVertexAI]
):
    helicone_api_key = os.environ.get("HELICONE_API_KEY")
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        # if helicone_api_key:
        #     print("Using Google Vertex AI with Helicone")
        #     return ChatVertexAI(
        #         model_name="claude-3-5-sonnet@20240620",
        #         vertex_api_url="https://oai.helicone.ai/v1",
        #         default_headers={
        #             "Helicone-Auth": f"Bearer {helicone_api_key}",
        #         },
        #     )
        print("Using Google Vertex AI Claude")
        return ChatVertexAI(
            model_name="claude-3-5-sonnet@20240620",
            project="claude-composio",
            location="us-east5",
        )
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
    if os.path.exists(os.path.expanduser("~/.aws/credentials")):
        print("Using Amazon Bedrock")
        return BedrockChat(
            credentials_profile_name="default",
            model_id="anthropic.claude-3-5-sonnet-20240620-v1:0",
            streaming=True,
            region_name="us-east-1",
        )
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
tools = composio_toolset.get_tools(
    apps=[
        App.FILETOOL,
        App.SHELLTOOL,
    ]
)

# Define agent
agent = Agent(
    role=ROLE,
    goal=GOAL,
    backstory=BACKSTORY,
    llm=get_langchain_llm(),
    tools=tools,
    verbose=True,
    max_execution_time=10 * 60,  # 10 minutes
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
