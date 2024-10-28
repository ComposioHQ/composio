import re
import typing as t
from pathlib import Path
import os

from composio import App, Action, ComposioToolSet


InputType = t.TypeVar("InputType")
workspace_dir = "/Users/shrey/trial_repos/"
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
    # owner, name = read_user_input(
    #     prompt="Enter github repository name",
    #     metavar="github repository name",
    #     validator=_github_repository_name_validator,
    # )
    # owner, name = "pallets", "flask"
    owner, name = "shreysingla11", "Aip-projecct"

    # base_commit = read_user_input(
    #     prompt="Enter base commit id, leave empty for default branch",
    #     metavar="base commit id",
    #     validator=lambda x: x,
    # )

    # base_commit = "7ee9ceb71e868944a46e1ff00b506772a53a4f1d"
    base_commit = ""

    composio_toolset.execute_action(
        action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
        params={"path": workspace_dir},
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
        str(Path(workspace_dir) / name),
        # read_user_input(
        #     prompt="Enter github issue ID or description or path to the file containing description",
        #     metavar="github issue",
        #     validator=_create_github_issue_validator(
        #         owner=owner,
        #         name=name,
        #     ),
        # ),
        # "Require a non-empty name for Blueprints Things do not work correctly if a Blueprint is given an empty name (e.g. #4944). It would be helpful if a `ValueError` was raised when trying to do that."
        "In the file `code_base/classify_base_on_features.py`, improve the implementation of the 'classify_n_features' function."
    )
