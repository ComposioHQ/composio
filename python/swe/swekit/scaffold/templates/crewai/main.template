from inputs import from_github

from agent import composio_toolset, crew
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
        action=Action.FILETOOL_GIT_PATCH,
        params={},
    )
    data = response.get("data", {})
    if data.get("error") and len(data["error"]) > 0:
        print("Error:", data["error"])
    elif data.get("patch"):
        print("=== Generated Patch ===\n" + data["patch"])
    else:
        print("No output available")


if __name__ == "__main__":
    main()
