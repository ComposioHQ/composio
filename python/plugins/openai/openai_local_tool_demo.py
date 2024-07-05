"""
OpenAI demo.
"""

import dotenv
from composio_openai import ComposioToolSet
from openai import OpenAI
from pydantic import BaseModel, Field

from composio.tools.local.base.decorators import action


class GitRepoRequest(BaseModel):
    """Git repo request."""


class GitRepoResponse(BaseModel):
    """Git repo response."""

    name: str = Field(..., description="Name of the repository.")
    author: str = Field(..., description="Name of the repository author.")


@action(toolname="git")
def get_git_repo(  # pylint: disable=unused-argument
    request_data: GitRepoRequest, metadata: dict
) -> GitRepoResponse:
    """Get git repo for working directory."""
    return GitRepoResponse(name="composio", author="ComposioHQ")


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Define task.
task = "Can you give me the name of the git repository working directory"

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_actions(actions=[get_git_repo])

# Get response from the LLM
response = openai_client.chat.completions.create(
    model="gpt-4-turbo-preview",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)

# Execute the function calls.
result = composio_toolset.handle_tool_calls(response)
print(f"{task=}")
print(f"{result=}")
