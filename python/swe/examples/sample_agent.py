"""
Agent implementation template.
"""

import pathlib

from composio_swe.agents.base import BaseSWEAgent, SWEArgs
from composio_swe.config.store import IssueConfig


class SampleAgent(BaseSWEAgent):
    """Sample agent implementation."""

    def solve(self, workspace_id: str, issue_config: IssueConfig):
        """
        Solve the issue in the workspace defined by workspace ID.
        Just change the code to solve the issue in the workspace.
        Assume you are in the repo directory.
        """


def main() -> None:
    """Run CrewAI agent example."""
    issue_config = IssueConfig(
        repo_name="Repo name",  # Example: ComposioHQ/composio
        issue_desc="Issue description",  # Example: Refactor the code to make it more readable.
    )
    agent = SampleAgent(SWEArgs(agent_logs_dir=pathlib.Path("/...")))
    patch = agent.setup_and_solve(issue_config=issue_config)
    print(patch)


if __name__ == "__main__":
    main()
