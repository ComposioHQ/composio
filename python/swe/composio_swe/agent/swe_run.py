from composio_swe.agent.base_swe_agent import SWEArgs
from composio_swe.agent.crewai_agent import CrewaiAgent
from composio_swe.config.config_store import IssueConfig
from composio_swe.config.context import Context, set_context


if __name__ == "__main__":
    issue_config = IssueConfig(
        repo_name="ComposioHQ/composio",
        issue_id="123",
        base_commit_id="abc",
        issue_desc="""Composio Client should be able to run without API Key. It should err to the user only if local tools are not used.
        In case of local tools are being used, then it should not err if the API Key is not provided.
        Main change should happen only in python/composio/client/__init__.py""",
    )
    ctx = Context()
    ctx.issue_config = issue_config
    set_context(ctx)

    args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)  # type: ignore
    c_agent = CrewaiAgent(args)

    patch = c_agent.setup_and_solve(issue_config=ctx.issue_config)
    print(patch)
