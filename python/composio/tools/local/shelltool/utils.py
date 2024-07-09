import os


SCRIPT_CURSOR_DEFAULT = "/root/commands/defaults.sh"
SCRIPT_EDIT_LINTING = "/root/commands/edit_linting.sh"
SCRIPT_SEARCH = "/root/commands/search.sh"


def git_reset_cmd(commit_id) -> str:
    """Commands to reset git repository state."""
    reset_commands = [
        "git remote get-url origin",
        "git fetch --all",
        f"git reset --hard {commit_id}",
        "git clean -fdx",
    ]
    return " && ".join(reset_commands)


def git_clone_cmd(request_data):
    """Commands to clone github repository."""
    *_, reponame = request_data.repo_name.lstrip().rstrip().split("/")
    github_access_token = os.environ.get("GITHUB_ACCESS_TOKEN")
    if not github_access_token or not github_access_token.strip():
        if os.environ.get("ALLOW_CLONE_WITHOUT_REPO") != "true":
            raise RuntimeError(
                "Cannot clone github repository without github access token"
            )
        commands = [
            f"git clone --progress https://github.com/{request_data.repo_name}.git",
            f"cd {reponame}",
        ]
    else:
        commands = [
            f"git clone --progress https://{github_access_token}@github.com/{request_data.repo_name}.git",
            f"cd {reponame}",
        ]
    if request_data.commit_id:
        commands.append(f"git reset --hard {request_data.commit_id}")
    return " && ".join(commands)


def git_tree_cmd() -> str:
    """Command for creating git tree."""
    return "git ls-tree -r HEAD --name-only > ./git_repo_tree.txt"
