"""
CrewAI agent implementation.
"""


from composio_crewai import Action, App, ComposioToolSet
from composio_swe.agents.base import BaseSWEAgent, SWEArgs
from composio_swe.agents.utils import get_langchain_llm
from composio_swe.config.context import get_context
from composio_swe.config.store import IssueConfig
from crewai import Agent, Task
from langchain_core.agents import AgentAction, AgentFinish

from examples.prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL


class CrewaiAgent(BaseSWEAgent):
    """CrewAI agent implementation."""

    def __init__(self, args: SWEArgs) -> None:
        """Initialize the CrewAI agent."""
        super().__init__(args)
        self.toolset = ComposioToolSet()
        self.tools = [
            *self.toolset.get_actions(
                actions=[
                    Action.WORKSPACETOOL_WORKSPACESTATUSACTION,
                ]
            ),
            *self.toolset.get_tools(
                apps=[
                    App.SEARCHTOOL,
                    App.GITCMDTOOL,
                    App.SHELLCMDTOOL,
                    App.FILETOOL,
                    App.HISTORYFETCHERTOOL,
                ]
            ),
        ]

    def add_in_logs(self, step_output):
        if isinstance(step_output, AgentFinish):
            self.current_logs.append(
                {
                    "agent_action": "agent_finish",
                    "agent_output": step_output.return_values,
                }
            )
        if isinstance(step_output, list) and step_output:
            agent_action_with_tool_out = step_output[0]
            if isinstance(agent_action_with_tool_out[0], AgentAction):
                agent_action = agent_action_with_tool_out[0]
                tool_out = (
                    agent_action_with_tool_out[1]
                    if len(agent_action_with_tool_out) > 1
                    else None
                )
                self.current_logs.append(
                    {"agent_action": agent_action.json(), "tool_output": tool_out}
                )
            else:
                self.logger.info(
                    "type of step_output: %s", type(agent_action_with_tool_out[0])
                )
        else:
            self.logger.info("type is not list: %s", type(step_output))

    def solve(self, workspace_id: str, issue_config: IssueConfig):
        llm = get_langchain_llm()
        repo_name = issue_config.repo_name
        if not repo_name:
            raise ValueError("no repo-name configuration is found")
        if not issue_config.issue_id:
            raise ValueError("no git-issue configuration is found")

        issue_added_instruction = ISSUE_DESC_TMPL.format(
            issue=issue_config.issue_desc, issue_id=issue_config.issue_id
        )
        backstory_added_instruction = AGENT_BACKSTORY_TMPL.format(
            workspace_id=workspace_id,
            repo_name=repo_name,
            repo_name_dir="/" + repo_name.split("/")[-1].strip(),
            base_commit=issue_config.base_commit_id,
        )
        swe_agent = Agent(
            role=(
                "You are the best programmer. You think carefully and step by "
                "step take action."
            ),
            goal=(
                "Help fix the given issue / bug in the code. And make sure you "
                "get it working. Ask the reviewer agent to review the patch and "
                "submit it once they approve it."
            ),
            backstory=backstory_added_instruction,
            verbose=True,
            tools=self.tools,
            llm=llm,
            memory=True,
            cache=False,
            step_callback=self.add_in_logs,
        )

        coding_task = Task(
            description=issue_added_instruction,
            agent=swe_agent,
            expected_output="A patch should be generated which fixes the given issue",
        )

        coding_task.execute()


def main() -> None:
    """Run CrewAI agent example."""
    issue_config = IssueConfig(
        repo_name="ComposioHQ/composio",
        issue_id="123",
        issue_desc="""Composio Client should be able to run without API Key.
        It should err to the user only if local tools are not used. In case of
        local tools are being used, then it should not err if the API Key is
        not provided. Main change should happen only in python/composio/client/__init__.py
        """,
    )
    ctx = get_context()
    args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)
    agent = CrewaiAgent(args)
    patch = agent.setup_and_solve(issue_config=issue_config)
    print(patch)


if __name__ == "__main__":
    main()
