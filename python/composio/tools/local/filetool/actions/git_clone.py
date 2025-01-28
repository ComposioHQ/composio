import os
import pathlib
import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


def git_reset_cmd(commit_id: str) -> str:
    """Commands to reset git repository state."""
    reset_commands = [
        "git remote get-url origin",
        f"git fetch --depth 1 origin {commit_id}",
        f"git reset --hard {commit_id}",
        "git status",
    ]
    return " && ".join(reset_commands)


def git_clone_cmd(
    repo: str,
    commit_id: str,
    github_access_token: t.Optional[str] = None,
) -> str:
    """Commands to clone github repository."""
    # repo is in the format of "composiohq/composio" or "django/django"
    repo_name = repo.split("/")[-1]
    github_access_token = (
        github_access_token or os.environ.get("GITHUB_ACCESS_TOKEN", "").strip()
    )

    if not github_access_token and os.environ.get("ALLOW_CLONE_WITHOUT_REPO") != "true":
        raise RuntimeError("Cannot clone github repository without github access token")

    clone_url = f"https://{github_access_token + '@' if github_access_token else ''}github.com/{repo}.git"
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


class GitCloneRequest(BaseFileRequest):
    """Request to clone a Git repository."""

    repo_name: str = Field(
        ...,
        description="""The Git repository to clone. For example: composiohq/composio or django/django.
        Please provide the owner/repo_name, not the full URL.""",
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


class GitClone(LocalAction[GitCloneRequest, GitCloneResponse]):
    """
    This action allows you to clone a Git repository to your local directory.
    You can specify the repository URL, destination directory, and optionally a specific branch or commit to clone.

    Usage examples:
    1. Clone a repository to the current directory:
       repo_url: "https://github.com/username/repo.git"
    2. Clone a repository to a specific directory:
       repo_url: "https://github.com/username/repo.git", destination: "/path/to/directory"
    3. Clone a specific commit of a repository:
       repo_url: "https://github.com/username/repo.git", commit_id: "as12sa"
    4. Reset an existing repository to a specific commit:
       repo_url: "https://github.com/username/repo.git", just_reset: True, commit_id: "as12sa"

    Raises:
        ValueError: If the repository URL is invalid.
        FileExistsError: If the destination directory is not empty.
        RuntimeError: If there's an issue with the command execution or GitHub token.
    """

    @include_cwd  # type: ignore
    def execute(self, request: GitCloneRequest, metadata: t.Dict) -> GitCloneResponse:
        filemanager = self.filemanagers.get(request.file_manager_id)
        repo_dir = request.repo_name.split("/")[-1]
        if request.destination:
            filemanager.chdir(request.destination)

        command = (
            git_reset_cmd(request.commit_id)
            if request.just_reset
            else git_clone_cmd(
                request.repo_name,
                request.commit_id,
                github_access_token=metadata.get(
                    "github-access-token",
                ),
            )
        )
        current_dir = filemanager.current_dir()
        if pathlib.Path(current_dir, ".git").exists() and not request.just_reset:
            return GitCloneResponse(
                success=False,
                message=f"The directory '{current_dir}' is already a git repository.",
            )

        if (
            pathlib.Path(current_dir, repo_dir, ".git").is_dir()
            and not request.just_reset
        ):
            filemanager.chdir(os.path.join(filemanager.current_dir(), repo_dir))
            return GitCloneResponse(
                success=False,
                message=f"The directory '{repo_dir}' is already a git repository.",
            )

        # Check if the directory is a git repository
        if pathlib.Path(current_dir, repo_dir).exists() and not request.just_reset:
            return GitCloneResponse(
                success=False,
                message=f"The directory '{repo_dir}' already exists. Clone failed.",
            )

        if not pathlib.Path(current_dir, ".git").exists() and request.just_reset:
            return GitCloneResponse(
                success=False,
                message=f"The directory '{current_dir}' is not a git repository. Reset failed.",
            )
        output, error = filemanager.execute_command(command)
        if error:
            return GitCloneResponse(success=False, error=error, message="")

        if pathlib.Path(current_dir, repo_dir).exists() and not request.just_reset:
            filemanager.chdir(os.path.join(filemanager.current_dir(), repo_dir))
            return GitCloneResponse(success=True, message=output)

        if pathlib.Path(current_dir, ".git").exists() and request.just_reset:
            return GitCloneResponse(success=True, message=output)

        return GitCloneResponse(
            success=False,
            message=f"After cloning, the directory '{repo_dir}' does not exist. Clone failed.",
        )
