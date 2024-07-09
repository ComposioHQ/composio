from composio_llamaindex import Action, App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage, MessageRole
from swekit.agents.base import BaseSWEAgent, SWEArgs
from swekit.agents.utils import get_llama_llm
from swekit.config.store import IssueConfig

from swe.examples.prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL


class LlamaIndexAgent(BaseSWEAgent):
    def __init__(self, args: SWEArgs):
        super().__init__(args)
        self.toolset = ComposioToolSet()
        self.tools = [
            *self.toolset.get_actions(
                actions=[Action.LOCALWORKSPACE_WORKSPACESTATUSACTION]
            ),
            *self.toolset.get_tools(apps=[App.CMDMANAGERTOOL]),
            *self.toolset.get_tools(apps=[App.HISTORYKEEPER]),
        ]

    def solve(self, workspace_id: str, issue_config: IssueConfig):
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
                    "You are the best programmer. You think carefully and step "
                    "by step take action. Your goal is: Help fix the given issue "
                    "/ bug in the code. And make sure you get it working. Ask the "
                    "reviewer agent to review the patch and submit it once they "
                    f"approve it. {backstory_added_instruction}"
                ),
            )
        ]

        # TODO: Add callbacks to print logs.
        agent = FunctionCallingAgentWorker(
            tools=self.tools,  # type: ignore
            llm=llm,
            prefix_messages=prefix_messages,
            max_function_calls=10,
            allow_parallel_tool_calls=False,
            verbose=True,
        ).as_agent()

        response = agent.chat(
            f"{issue_added_instruction}, Expected outcome: A patch should be "
            "generated which fixes the given issue"
        )
        self.logger.info("Agent response: %s", response)
        self.current_logs.append(
            {"agent_action": "agent_finish", "agent_output": str(response)}
        )
