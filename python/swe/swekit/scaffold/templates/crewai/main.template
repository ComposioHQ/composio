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
    print(response["stderr"] if len(response["stderr"]) > 0 else response["stdout"])


if __name__ == "__main__":
    main()
