import os


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
