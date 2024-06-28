

from swe.composio_swe.agent.base_swe_agent import SWEArgs
from swe.composio_swe.config.config_store import IssueConfig
from swe.composio_swe.agent.crewai_agent import CrewaiAgent
from swe.composio_swe.config.context import Context, set_context


if __name__ == "__main__":
    issue = IssueConfig(
        repo_name="ComposioHQ/composio",
        issue_id="123",
        issue_desc="we have a workspace concept, you can check code in python/composio/workspace folder. Currently it supports"
                  "local docker container. The actions that are supported by on container is defined in python/composio/local_tools/local_workspace."
                  "Can you generate code to handle a simple workspace which runs on current machine with "
                  "a given path as workspace-path and starts the environment there and is able to perform all actions that can be performed on "
                  "local docker container.",
    )
    ctx = Context()
    ctx.issue_config = issue
    set_context(ctx)

    args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)  # type: ignore
    c_agent = CrewaiAgent(args)

    patch = c_agent.setup_and_solve(issue_config=ctx.issue_config)
    print(patch)
