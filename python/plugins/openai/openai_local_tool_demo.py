"""
OpenAI demo.
"""

from pathlib import Path

import dotenv
from openai import OpenAI
from pydantic import BaseModel, Field

from composio import Shell, WorkspaceType, action

from composio_openai import ComposioToolSet


class GitRepoRequest(BaseModel):
    """Git repo request."""

    working_directory: str = Field(
        default="./",
        description="Path to the git repo.",
    )


class GitRepoResponse(BaseModel):
    """Git repo response."""

    name: str = Field(..., description="Name of the repository.")
    author: str = Field(..., description="Name of the repository author.")


@action(toolname="git", runs_on_shell=True)
def get_git_repo(request: GitRepoRequest, metadata: dict) -> GitRepoResponse:
    """Get git repo for working directory."""
    shell = metadata["workspace"].shells.recent
    shell.exec(f"cd {request.working_directory}")
    output = (
        shell.exec("git config --get remote.origin.url").get("stdout").lstrip().rstrip()
    )
    _, repo = output.split(":")
    *_, author, name = repo.split("/")
    return GitRepoResponse(name=name, author=author)


@action(toolname="git")
def create_git_tree(shell: Shell, working_directory: str = "./") -> str:
    """
    Write the git tree of the provided working directory and returns the filename.

    :param working_directory: Path to the directory for which the tree will be generated
    :return file_path: Path to file containing git tree information
    """
    outfile = Path(working_directory, "tree.txt")
    shell.exec(f"cd {working_directory}")
    shell.exec(f"git ls-tree -r HEAD --name-only > {outfile}")
    return str(outfile)


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())

# Define task.
task = "Can you give me the name of the git repository working directory"

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_actions(actions=[create_git_tree, get_git_repo])

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
