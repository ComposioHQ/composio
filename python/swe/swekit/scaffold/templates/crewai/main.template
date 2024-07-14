from agent import composio_toolset, crew
from inputs import from_github

from composio import Action


def main() -> None:
    """Run the agent."""
    repo, issue = from_github()
    crew.kickoff(
        inputs={
            "repo": repo,
            "issue": issue,
        }
    )
    response = composio_toolset.execute_action(
        action=Action.GITCMDTOOL_GET_PATCH_CMD,
        params={},
    )
    if response.get("stderr") and len(response["stderr"]) > 0:
        print("Error:", response["stderr"])
    elif response.get("stdout"):
        print("=== Generated Patch ===\n" + response["stdout"])
    else:
        print("No output available")


if __name__ == "__main__":
    main()
