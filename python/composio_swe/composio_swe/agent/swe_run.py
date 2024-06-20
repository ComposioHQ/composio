from composio_swe.composio_swe.config.context import Context, set_context
from composio_swe.composio_swe.agent.swe import CoderAgent, CoderAgentArgs

if __name__ == "__main__":
    issue_config = {
        "repo_name": "ComposioHQ/composio",
        "issue_id": "123",
        "base_commit_id": "abc",
        "issue_desc": "Fix all the mypy issues in the codebase.",
    }
    ctx = Context()
    ctx.issue_config = issue_config
    set_context(ctx)

    args = CoderAgentArgs(
        agent_logs_dir=ctx.agent_logs_dir, issue_config=ctx.issue_config
    )
    c_agent = CoderAgent(args)

    c_agent.run()