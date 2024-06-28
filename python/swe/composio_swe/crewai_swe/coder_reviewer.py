import typing as t
from composio_swe.config.config_store import IssueConfig

from swe.composio_swe.agent.base_swe_agent import BaseSWEAgent, SWEArgs


class CoderReviewer(BaseSWEAgent):
    def __init__(self, args: SWEArgs) -> None:
        super().__init__(args)

    def solve_issue(self, workspace_id: str, issue_config: IssueConfig) -> None:
        pass


if __name__ == "__main__":
    issue_config = IssueConfig(
        repo_name="ComposioHQ/composio",
        issue_id="123",
        issue_desc="""Composio Client should be able to run without API Key. It should err to the user only if local tools are not used.
        In case of local tools are being used, then it should not err if the API Key is not provided.
        Main change should happen only in python/composio/client/__init__.py""",
    )

    args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)  # type: ignore
    c_agent = CoderReviewer(args)

    patch = c_agent.setup_and_solve(issue_config=issue_config)
    print(patch)
