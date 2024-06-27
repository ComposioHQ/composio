import typing as t
from itertools import chain

from composio_llamaindex import Action, App, ComposioToolSet
from composio_swe.config.config_store import IssueConfig
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.tools import BaseTool

from .base_swe_agent import BaseSWEAgent, SWEArgs
from .prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL
from .utils import get_llama_llm, logger


class LlamaIndexAgent(BaseSWEAgent):
    def __init__(self, args: SWEArgs):
        super().__init__(args)

        # initialize composio toolset
        local_workspace_tool_set = ComposioToolSet().get_actions(
            actions=[Action.LOCALWORKSPACE_WORKSPACESTATUSACTION]
        )
        cmd_manager_tool_set = ComposioToolSet().get_tools(apps=[App.CMDMANAGERTOOL])
        history_keeper_tool_set = ComposioToolSet().get_tools(apps=[App.HISTORYKEEPER])
        self.composio_toolset: t.List[BaseTool] = list(
            chain(
                local_workspace_tool_set, cmd_manager_tool_set, history_keeper_tool_set
            )
        )

    def solve_issue(self, workspace_id: str, issue_config: IssueConfig):
        llm = get_llama_llm()
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

        prefix_messages = [
            ChatMessage(
                role=MessageRole.SYSTEM,
                content=(
                    "You are the best programmer. You think carefully and step by step take action. "
                    "Your goal is: Help fix the given issue / bug in the code. And make sure you get it working. Ask the reviewer agent to review the patch and submit it once they approve it."
                    f"{backstory_added_instruction}"
                ),
            )
        ]
        # TODO: Add callbacks to print logs.
        agent = FunctionCallingAgentWorker(
            tools=self.composio_toolset,
            llm=llm,
            prefix_messages=prefix_messages,
            max_function_calls=10,
            allow_parallel_tool_calls=False,
            verbose=True,
        ).as_agent()

        response = agent.chat(
            f"{issue_added_instruction}, Expected outcome: A patch should be generated which fixes the given issue"
        )

        logger.info("Agent response: %s", response)
        self.current_logs.append(
            {"agent_action": "agent_finish", "agent_output": str(response)}
        )
