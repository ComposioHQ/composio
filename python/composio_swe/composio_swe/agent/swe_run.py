from python.composio_swe.composio_swe.agent.swe import CoderAgent, CoderAgentArgs
from python.composio_swe.composio_swe.config.context import Context, set_context


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

    args = CoderAgentArgs(agent_logs_dir=ctx.agent_logs_dir)  # type: ignore
    c_agent = CoderAgent(args)

    c_agent.run(ctx.issue_config)
