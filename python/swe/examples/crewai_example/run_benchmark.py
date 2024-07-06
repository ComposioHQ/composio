from agent import composio_toolset, crew
from composio_swe.config.store import IssueConfig

from swe.benchmark.run_evaluation import run_and_get_scores


def agent_func(workspace_id: str, issue_config: IssueConfig) -> str:
    # Set the workspace for the tools to run.
    composio_toolset.set_workspace_id(workspace_id)
    # kick off the crew on the issue.
    return crew.kickoff(
        {
            "issue_id": issue_config.issue_id,
            "issue": issue_config.issue_desc,
        }
    )


def main() -> None:
    # Run the benchmark.
    print("Running benchmark...")
    run_and_get_scores(agent_func, test_split="1:2")


if __name__ == "__main__":
    main()
