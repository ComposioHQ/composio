# isort: skip_file

import asyncio
from inputs import from_github

from agent import composio_toolset, launcher
from prompts import DESCRIPTION
from composio import Action


def main() -> None:
    """Run the agent."""
    repo, issue = from_github()
    asyncio.run(launcher.run(
        input=DESCRIPTION.format(repo=repo, issue=issue)
    ))
    response = composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_PATCH,
        params={},
    )
    if response.get("error") and len(response["error"]) > 0:
        print("Error:", response["error"])
    elif response.get("patch"):
        print("=== Generated Patch ===\n" + response["patch"])
    else:
        print("No output available")


if __name__ == "__main__":
    main()
