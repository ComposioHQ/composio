from composio_swe.agent.base_swe_agent import SWEArgs
from composio_swe.agent.crewai import CrewaiAgent
from composio_swe.config.context import Context, set_context


if __name__ == "__main__":
    issue_config = {
        "repo_name": "ComposioHQ/composio",
        "issue_id": "123",
        "base_commit_id": "abc",
        "issue_desc": "Add a local tool do terminal commands locally",
    }
    ctx = Context()
    ctx.issue_config = issue_config  # type: ignore
    set_context(ctx)

    args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)  # type: ignore
    c_agent = CrewaiAgent(args)

    patch = c_agent.setup_and_solve(issue_config=ctx.issue_config)
    print(patch)
