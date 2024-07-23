import os
import pathlib
import typing as t

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class GitCloneRequest(BaseFileRequest):
    """Request to clone a Git repository."""

    repo_name: str = Field(
        ...,
        description="The Git repository to clone. ex composiohq/composio or django/django",
    )
    destination: t.Optional[str] = Field(
        None,
        description="""The local directory to clone the repository into. If not provided, it will clone into the current working directory.
        For git reset, destination is the directory to reset""",
    )
    just_reset: bool = Field(
        False,
        description="If true, the repo will not be cloned. It will be assumed to exist. The repo will be cleaned and reset to the given commit-id",
    )
    commit_id: str = Field(
        "",
        description="After cloning the git repo, repo will be set to this commit-id. If commit-id is empty, default branch of the repo will be cloned",
    )


class GitCloneResponse(BaseFileResponse):
    """Response to cloning a Git repository."""

    success: bool = Field(False, description="Whether the clone was successful")
    message: str = Field("", description="Status message or error description")


def git_reset_cmd(commit_id: str) -> str:
    """Commands to reset git repository state."""
    reset_commands = [
        "git remote get-url origin",
        f"git fetch --depth 1 origin {commit_id}",
        f"git reset --hard {commit_id}",
        "git clean -fdx",
        "git status",
    ]
    return " && ".join(reset_commands)


def git_clone_cmd(repo: str, commit_id: str) -> str:
    """Commands to clone github repository."""
    # repo is in the format of "composiohq/composio" or "django/django"
    repo_name = repo.split("/")[-1]

    github_access_token = os.environ.get("GITHUB_ACCESS_TOKEN", "").strip()

    if not github_access_token and os.environ.get("ALLOW_CLONE_WITHOUT_REPO") != "true":
        raise RuntimeError("Cannot clone github repository without github access token")

    clone_url = f"https://{github_access_token+'@' if github_access_token else ''}github.com/{repo}.git"

    if commit_id:
        commands = [
            f"git clone --depth 1 {clone_url} -q",
            f"cd {repo_name}",
            f"git fetch --depth 1 origin {commit_id}",
            f"git checkout {commit_id}",
        ]
    else:
        commands = [
            f"git clone --depth 1 {clone_url} -q",
            f"cd {repo_name}",
        ]

    commands.append("git status")
    return " && ".join(commands)


class GitClone(BaseFileAction):
    """
    Clones a Git repository to a local directory.

    This action allows you to clone a Git repository to your local workspace.
    You can specify the repository URL, destination directory, and optionally a specific branch or commit to clone.

    Usage examples:
    1. Clone a repository to the current directory:
       repo_url: "https://github.com/username/repo.git"
    2. Clone a repository to a specific directory:
       repo_url: "https://github.com/username/repo.git", destination: "/path/to/directory"
    3. Clone a specific commit of a repository:
       repo_url: "https://github.com/username/repo.git", commit_id: "abcdef1234567890"
    4. Reset an existing repository to a specific commit:
       repo_url: "https://github.com/username/repo.git", just_reset: True, commit_id: "abcdef1234567890"

    Raises:
        ValueError: If the repository URL is invalid.
        FileExistsError: If the destination directory is not empty.
        PermissionError: If there's no permission to write to the destination directory.
        RuntimeError: If there's an issue with the Git command execution or missing GitHub access token.
    """

    _display_name = "Clone Git Repository"
    _request_schema = GitCloneRequest
    _response_schema = GitCloneResponse

    def execute_on_file_manager(
        self,
        file_manager: FileManager,
        request_data: GitCloneRequest,  # type: ignore
    ) -> GitCloneResponse:
        try:
            repo_dir = request_data.repo_name.split("/")[-1]
            if request_data.destination:
                file_manager.chdir(request_data.destination)
            if request_data.just_reset:
                command = git_reset_cmd(request_data.commit_id)
            else:
                command = git_clone_cmd(request_data.repo_name, request_data.commit_id)
            # Check if folder already exists
            current_dir = file_manager.current_dir()
            if pathlib.Path(current_dir, ".git").exists():
                return GitCloneResponse(
                    success=False,
                    message=f"The directory '{current_dir}' is already a git repository.",
                )

            if pathlib.Path(current_dir, repo_dir, ".git").is_dir():
                file_manager.chdir(os.path.join(file_manager.current_dir(), repo_dir))
                return GitCloneResponse(
                    success=False,
                    message=f"The directory '{repo_dir}' is already a git repository.",
                )

            if (
                pathlib.Path(current_dir, repo_dir).exists()
                and not request_data.just_reset
            ):
                # Check if the directory is a git repository
                raise FileExistsError(
                    f"The directory '{repo_dir}' already exists. Clone failed."
                )
            output, error = file_manager.execute_command(command)
            if error:
                return GitCloneResponse(success=False, error=error, message="")

            if (
                pathlib.Path(current_dir, repo_dir).exists()
                and not request_data.just_reset
            ):
                file_manager.chdir(os.path.join(file_manager.current_dir(), repo_dir))
                return GitCloneResponse(success=True, message=output)
            raise FileExistsError(
                f"After cloning, the directory '{repo_dir}' does not exist. Clone failed."
            )
        except Exception as e:
            return GitCloneResponse(
                success=False, message=f"Error cloning repository: {str(e)}"
            )
