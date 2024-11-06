from inputs import from_github
from composio import Action
import uuid
from agent import composio_toolset, assistant, user_proxy

def main() -> None:
    """Run the agent."""
    repo, issue = from_github()
    owner, repo_name = repo.split("/")
    # Initiate the chat
    user_proxy.initiate_chat(
        assistant,
        message=f"Solve the following issue in the repository {repo}: {issue}"
    )
    composio_toolset.execute_action(
        action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
        params={"path": f"/home/user/{repo_name}"},
    )
    # Get the patch after the chat is complete
    response = composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_PATCH,
        params={},
    )
    branch_name = "test-branch-" + str(uuid.uuid4())[:4]
    git_commands = [
        f"checkout -b {branch_name}",
        "add -u",
        "config --global user.email 'random@gmail.com'",
        "config --global user.name 'random'",
        f"commit -m '{issue}'",
        f"push --set-upstream origin {branch_name}",
    ]
    for command in git_commands:
        composio_toolset.execute_action(
            action=Action.FILETOOL_GIT_CUSTOM,
            params={"cmd": command},
        )
    composio_toolset.execute_action(
        action=Action.GITHUB_CREATE_A_PULL_REQUEST,
        params={
            "owner": owner,
            "repo": repo_name,
            "head": branch_name,
            "base": "master",
            "title": "Test-Title",
        },
    )

    data = response.get("data")
    if data.get("error") and len(data["error"]) > 0:
        print("Error:", response["error"])
    elif data.get("patch"):
        print("=== Generated Patch ===\n" + data["patch"])
    else:
        print("No output available")

if __name__ == "__main__":
    main()
