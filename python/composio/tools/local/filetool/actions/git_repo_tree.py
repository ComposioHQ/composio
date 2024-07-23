from pathlib import Path

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class GitRepoTreeRequest(BaseFileRequest):
    """Request to create a Git repository tree."""

    git_repo_path: str = Field(
        default=".",
        description="Relative path to the git repository. Default is current directory.",
    )


class GitRepoTreeResponse(BaseFileResponse):
    """Response to creating a Git repository tree."""

    success: bool = Field(False, description="Whether the tree creation was successful")
    message: str = Field("", description="Status message or error description")


def git_tree_cmd(repo_path: str) -> str:
    """Command for creating git tree."""
    return f"git -C {repo_path} ls-tree -r HEAD --name-only > {repo_path}/git_repo_tree.txt"


class GitRepoTree(BaseFileAction):
    """
    Creates a tree representation of the Git repository.

    This action generates a text file containing the tree structure of the current Git repository.
    It lists all files tracked by Git in the repository.

    Usage example:
    Provide the git_repo_path to generate the repository tree for that specific repository.
    If not provided, it will use the current directory.

    Raises:
        RuntimeError: If there's an issue with the Git command execution or if not in a Git repository.
    """

    _display_name = "Create Git Repository Tree"
    _request_schema = GitRepoTreeRequest
    _response_schema = GitRepoTreeResponse
    _output_text = "Git repository tree has been generated successfully."

    def execute_on_file_manager(
        self,
        file_manager: FileManager,
        request_data: GitRepoTreeRequest,  # type: ignore
    ) -> GitRepoTreeResponse:
        try:
            repo_path = Path(file_manager.working_dir) / request_data.git_repo_path

            if not (repo_path / ".git").is_dir():
                return GitRepoTreeResponse(
                    success=False,
                    message=f"Error: The directory '{repo_path}' is not the root of a git repository.",
                )

            original_dir = file_manager.working_dir
            file_manager.chdir(repo_path)

            command = git_tree_cmd(str(repo_path))
            output, error = file_manager.execute_command(command)

            if error:
                return GitRepoTreeResponse(success=False, error=error, message=output)

            tree_file_path = repo_path / "git_repo_tree.txt"
            if not tree_file_path.exists():
                return GitRepoTreeResponse(
                    success=False,
                    message="Error: Failed to create git_repo_tree.txt file.",
                )

            try:
                with open(tree_file_path, "r", encoding="utf-8") as f:
                    tree_content = f.read()
            except IOError as e:
                return GitRepoTreeResponse(
                    success=False, message=f"Error reading git_repo_tree.txt: {str(e)}"
                )

            if not tree_content.strip():
                return GitRepoTreeResponse(
                    success=False, message="The repository tree is empty."
                )

            # Change back to the original directory
            file_manager.chdir(original_dir)

            return GitRepoTreeResponse(
                success=True,
                message=f"{self._output_text} Check git_repo_tree.txt in the repository root for the results.",
            )
        except Exception as e:
            return GitRepoTreeResponse(
                success=False, message=f"Error creating repository tree: {str(e)}"
            )
