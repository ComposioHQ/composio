from itertools import chain

from composio_crewai import Action, App, ComposioToolSet
from composio_swe.config.config_store import IssueConfig
from crewai import Agent, Task
from langchain_core.agents import AgentAction, AgentFinish

from .base_swe_agent import BaseSWEAgent, SWEArgs
from .prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL
from .utils import get_langchain_llm, logger


class CrewaiAgent(BaseSWEAgent):
    def __init__(self, args: SWEArgs):
        super().__init__(args)
        # initialize composio toolset
        local_workspace_tool_set = ComposioToolSet().get_actions(
            actions=[Action.LOCALWORKSPACE_WORKSPACESTATUSACTION]
        )
        cmd_manager_tool_set = ComposioToolSet().get_tools(apps=[App.CMDMANAGERTOOL])
        history_keeper_tool_set = ComposioToolSet().get_tools(apps=[App.HISTORYKEEPER])
        self.composio_toolset = list(
            chain(
                local_workspace_tool_set, cmd_manager_tool_set, history_keeper_tool_set
            )
        )

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
                logger.info(
                    "type of step_output: %s", type(agent_action_with_tool_out[0])
                )
        else:
            logger.info("type is not list: %s", type(step_output))

    def solve_issue(self, workspace_id: str, issue_config: IssueConfig):
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
            role="You are the best programmer. You think carefully and step by step take action.",
            goal="Help fix the given issue / bug in the code. And make sure you get it working. Ask the reviewer agent to review the patch and submit it once they approve it.",
            backstory=backstory_added_instruction,
            verbose=True,
            tools=self.composio_toolset,
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
