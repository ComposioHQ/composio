import re
import typing as t
from pathlib import Path

from composio import Action, ComposioToolSet


InputType = t.TypeVar("InputType")
workspace_dir = Path.home() / "swe-agent"
if not workspace_dir.exists():
    workspace_dir.mkdir(parents=True)

composio_toolset = ComposioToolSet()

def read_user_input(
    prompt: str,
    metavar: str,
    validator: t.Callable[[str], InputType],
) -> InputType:
    """Read user input."""
    while True:
        value = input(f"{prompt} > ")
        try:
            return validator(value)
        except Exception as e:
            print(f"Invalid value for `{metavar}` error parsing `{value}`; {e}")


def _github_repository_name_validator(name: str) -> t.Tuple[str, str]:
    """Validate github repository name."""
    if " " in name:
        raise ValueError()
    owner, name = name.split("/")
    return owner, name


def _create_github_issue_validator(owner: str, name: str) -> t.Callable[[str], str]:
    """Create a github issue validator."""

    def _github_issue_validator(value: str) -> str:
        """Validate github issue."""
        if Path(value).resolve().exists():
            return Path(value).read_text(encoding="utf-8")

        if re.match(r"^\d+$", value):
            response_data = composio_toolset.execute_action(
                action=Action.GITHUB_GET_AN_ISSUE,
                params={
                    "owner": owner,
                    "repo": name,
                    "issue_number": int(value),
                },
            ).get("response_data")
            return response_data["body"]

        return value

    return _github_issue_validator


def set_workspace() -> t.Tuple[str, str, str]:
    """Take input from github."""
    owner, name = read_user_input(
        prompt="Enter github repository name",
        metavar="github repository name",
        validator=_github_repository_name_validator,
    )

    base_commit = read_user_input(
        prompt="Enter base commit id, leave empty for default branch",
        metavar="base commit id",
        validator=lambda x: x,
    )

    issue_description = read_user_input(
        prompt="Enter github issue ID or description or path to the file containing description",
        metavar="github issue",
        validator=_create_github_issue_validator(
            owner=owner,
            name=name,
        ),
    )

    composio_toolset.execute_action(
        action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
        params={"path": str(workspace_dir)},
    )

    composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_CLONE,
        params={
            "repo_name": f"{owner}/{name}",
            "commit_id": base_commit,
        },
    )
    
    return (
        f"{owner}/{name}",
        str(workspace_dir / name),
        issue_description,
    )
