from composio_swe.benchmark.run_evaluation import run_and_get_scores
from composio_swe.config.store import IssueConfig

from agent import composio_toolset, crew


def bench(workspace_id: str, issue_config: IssueConfig) -> str:
    """Run benchmark on the agent."""

    # Set the workspace for the tools to run.
    composio_toolset.set_workspace_id(workspace_id)

    # kick off the crew on the issue.
    return crew.kickoff(
        inputs={
            "repo": issue_config.repo_name,
            "issue": issue_config.issue_desc,
        }
    )


if __name__ == "__main__":
    run_and_get_scores(bench, test_split="21:22")
