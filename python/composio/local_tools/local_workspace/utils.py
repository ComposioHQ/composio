import logging
import os
from typing import Optional

from rich.logging import RichHandler


SCRIPT_CURSOR_DEFAULT = "/root/commands/defaults.sh"
SCRIPT_EDIT_LINTING = "/root/commands/edit_linting.sh"
SCRIPT_SEARCH = "/root/commands/search.sh"


def git_reset_cmd(commit_id) -> str:
    reset_commands = [
        "git remote get-url origin",
        "git fetch --all",
        f"git reset --hard {commit_id}",
        "git clean -fdx",
    ]
    return " && ".join(reset_commands)


def git_clone_cmd(request_data):
    git_token = os.environ.get("GITHUB_ACCESS_TOKEN")
    if not git_token or not git_token.strip():
        raise ValueError("github_token can not be null")
    repo_dir = request_data.repo_name.split("/")[-1].strip()
    command_list = [
        f"git clone https://{git_token}@github.com/{request_data.repo_name}.git",
        f"cd {repo_dir}",
    ]
    if request_data.commit_id:
        command_list.append(f"git reset --hard {request_data.commit_id}")
    return " && ".join(command_list)


def git_tree_cmd():
    return "git ls-tree -r HEAD --name-only > ./git_repo_tree.txt"


def process_output(output: str, return_code: Optional[int]):
    if return_code is None:
        return_code = 1
        output = "Exception: " + output
    return output, return_code


def get_logger(logger_name):
    handler = RichHandler(show_time=False, show_path=False)
    handler.setLevel(logging.DEBUG)
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
