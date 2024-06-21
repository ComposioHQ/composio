import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

import langchain_core

from composio_swe.composio_swe.config.prompts import (
    swe_agent_goal, swe_agent_role, AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL, swe_expected_output
)
from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Crew, Task
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from pydantic import BaseModel, Field
from rich.logging import RichHandler

from composio import Composio

from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceResponse,
)
from composio_swe.composio_swe.config.config_store import IssueConfig


LOGS_DIR_NAME_PREFIX = "coder_agent_logs"
AGENT_LOGS_JSON_PATH = "agent_logs.json"


def setup_logger():
    handler = RichHandler(show_time=False, show_path=False)
    handler.setLevel(logging.DEBUG)
    logger = logging.getLogger("local_workspace")
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.propagate = False
    return logger


logger = setup_logger()


class CoderAgentArgs(BaseModel):
    agent_role: str = Field(
        default=swe_agent_role,
        description="role of the agent",
    )
    agent_goal: str = Field(
        default=swe_agent_goal,
        description="goal for the agent",
    )
    task_expected_output: str = Field(
        default=swe_expected_output,
        description="expected output of the agent task",
    )
    agent_backstory_tmpl: str = Field(
        default=AGENT_BACKSTORY_TMPL,
        description="backstory template for the agent to work on",
    )
    issue_description_tmpl: str = Field(default=ISSUE_DESC_TMPL)
    issue_config: IssueConfig = Field(
        ..., description="issue config, with issue description, repo-name"
    )
    agent_logs_dir: Path = Field(..., description="logs for agent")
    is_benchmark: bool = Field(default=False, description="is running for benchmark")


class CoderAgent:
    def __init__(self, args: CoderAgentArgs):
        # initialize logs and history logs path
        self.args = args
        self.issue_config = args.issue_config
        self.repo_name = self.issue_config.repo_name
        if not self.issue_config.issue_id:
            raise ValueError("no git-issue configuration is found")

        # initialize composio toolset
        tool_set = ComposioToolSet()
        self.composio_toolset = tool_set.get_tools(
            apps=[
                App.LOCALWORKSPACE,
                App.CMDMANAGERTOOL,
                App.HISTORYKEEPER,
                App.SUBMITPATCHTOOL,
            ]
        )
        composio_client = Composio()
        self.entity = composio_client.get_entity("swe-agent")
        # initialize composio client
        self.composio_entity = self.get_composio_entity()

        # initialize agent-related different prompts
        self.agent_role = self.args.agent_role
        self.agent_goal = self.args.agent_goal
        self.expected_output = self.args.task_expected_output
        self.agent_backstory_tmpl = args.agent_backstory_tmpl
        self.issue_description_tmpl = args.issue_description_tmpl
        # initialize logger
        self.logger = logger
        # initialize agent logs and history dict
        self.agent_logs_dir = args.agent_logs_dir
        self.task_output_logs = self.agent_logs_dir / Path(
            AGENT_LOGS_JSON_PATH + datetime.datetime.now().strftime("%m_%d_%Y_%H_%M_%S")
        )
        self.agent_logs: Dict[str, Any] = {}
        self.current_logs: List[Any] = []
        self.is_benchmark = args.is_benchmark

    def get_composio_entity(self):
        client = Composio()
        entity = client.get_entity("SWE-Agent-Client")
        return entity

    def save_history(self, instance_id):
        self.agent_logs[instance_id] = self.current_logs
        with open(self.task_output_logs, "w", encoding="utf-8") as f:
            f.write(json.dumps(self.agent_logs))

    def add_in_logs(self, step_output):
        if isinstance(step_output, langchain_core.agents.AgentFinish):
            self.current_logs.append(
                {
                    "agent_action": "agent_finish",
                    "agent_output": step_output.return_values,
                }
            )
        if isinstance(step_output, list) and step_output:
            agent_action_with_tool_out = step_output[0]
            if isinstance(
                agent_action_with_tool_out[0], langchain_core.agents.AgentAction
            ):
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

    def get_llm(self):
        if os.environ.get("OPENAI_API_KEY"):
            return ChatOpenAI(model="gpt-4-turbo")
        if os.environ.get("AZURE_API_KEY"):
            return AzureChatOpenAI(model="test")
        raise ValueError("no model is found")

    def run(self):
        llm = self.get_llm()

        workspace_create_resp = CreateWorkspaceResponse.model_validate(
            self.entity.execute(Action.LOCALWORKSPACE_CREATEWORKSPACEACTION, {})
        )
        workspace_id = workspace_create_resp.workspace_id
        logger.info("workspace is created, workspace-id is: %s", workspace_id)
        git_clone_response = self.entity.execute(
            Action.CMDMANAGERTOOL_GITHUBCLONECMD,
            params={
                "workspace_id": workspace_id,
                "repo_name": self.issue_config.repo_name,
                "branch_name": self.issue_config.base_commit_id,
            },
        )
        issue_added_instruction = self.issue_description_tmpl.format(
            issue=self.issue_config.issue_desc,
            issue_id=self.issue_config.issue_id,
            repo_name_dir="/" + self.repo_name.split("/")[-1].strip(),
        )
        backstory_added_instruction = self.agent_backstory_tmpl.format(
            workspace_id=workspace_id,
            repo_name=self.repo_name,
            repo_name_dir="/" + self.repo_name.split("/")[-1].strip(),
            base_commit=self.issue_config.base_commit_id,
        )
        logger.info("git clone response: %s", git_clone_response)

        swe_agent = Agent(
            role=self.agent_role,
            goal=self.agent_goal,
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
            expected_output=self.expected_output,
        )

        reviewer_agent = Agent(
            role="You are the best reviewer. You think carefully and step by step take action.",
            goal="Review the patch and make sure it fixes the issue.",
            backstory="An AI Agent tries to solve an issue and submits a patch to the repo. "
            "You can assume the AI agent operates as a junior developer and has limited knowledge of the codebase."
            "It's your job to review the patch and make sure it fixes the issue."
            "The patch might be incomplete. In that case point out the missing parts and ask the AI agent to add them."
            "The patch might have some compilation issues/typo. Point out those and ask the AI agent to fix them."
            "The patch might have some logical issues. Point out those and ask the AI agent to fix them."
            "Once the patch is ready, approve it and ask the AI agent to submit it."
            "It is fine to have multiple iterations of the review. Keep iterating until the patch is ready to be submitted."
            "The are the best reviewer. You think carefully and step by step take action.",
            verbose=True,
            llm=llm,
            tools=self.composio_toolset,
            step_callback=self.add_in_logs,
            memory=True,
            allow_delegation=True,
        )

        review_task = Task(
            description="Review the patch and make sure it fixes the issue.",
            agent=reviewer_agent,
            context=[coding_task],
            expected_output="The patch is ready to be submitted to the repo.",
        )

        # crew = Crew(
        #     agents=[swe_agent],
        #     tasks=[coding_task],
        #     memory=True,
        # )
        #
        # crew.kickoff()
        coding_task.execute()
        self.save_history(self.issue_config.issue_id)


if __name__ == "__main__":
    from composio_swe.composio_swe.config.context import Context, set_context

    issue_config = {
        "repo_name": "ComposioHQ/composio",
        "issue_id": "123",
        "base_commit_id": "shubhra/linter",
        "issue_desc": ISSUE_DESC_TMPL,
    }
    ctx = Context()
    ctx.issue_config = issue_config
    set_context(ctx)

    args = CoderAgentArgs(
        agent_logs_dir=ctx.agent_logs_dir, issue_config=ctx.issue_config
    )
    c_agent = CoderAgent(args)

    c_agent.run()
