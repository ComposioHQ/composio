import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

import langchain_core
from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from pydantic import BaseModel, Field
from rich.logging import RichHandler

from composio import Composio
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceResponse,
)
from composio_swe.composio_swe.config.config_store import IssueConfig
from composio_swe.composio_swe.config.prompts import (
    swe_agent_goal,
    swe_agent_role,
    swe_expected_output,
)

from .prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL


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
        self.composio_client = Composio()

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
            self.composio_client.actions.execute(
                action=Action.LOCALWORKSPACE_CREATEWORKSPACEACTION, params={}
            )
        )
        workspace_id = workspace_create_resp.workspace_id
        logger.info("workspace is created, workspace-id is: %s", workspace_id)
        git_clone_response = self.composio_client.actions.execute(
            action=Action.CMDMANAGERTOOL_GITHUBCLONECMD,
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

        coding_task.execute()
        self.save_history(self.issue_config.issue_id)
