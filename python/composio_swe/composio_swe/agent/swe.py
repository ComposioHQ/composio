import datetime
import json
import typing as t
from itertools import chain
from pathlib import Path
from typing import Any, Dict, List

import langchain_core
from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Task
from pydantic import BaseModel, Field

from composio import Composio
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceResponse,
)
from composio_swe.composio_swe.config.prompts import (
    swe_agent_goal,
    swe_agent_role,
    swe_expected_output,
)
from python.composio_swe.composio_swe.config.config_store import IssueConfig

from .base_swe_agent import BaseSWEAgent
from .prompts import AGENT_BACKSTORY_TMPL, ISSUE_DESC_TMPL, REVIEWER_BACKSTORY_TMPL
from .utils import get_llm, logger


LOGS_DIR_NAME_PREFIX = "coder_agent_logs"
AGENT_LOGS_JSON_PATH = "agent_logs.json"


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
    reviewer_backstory_tmpl: str = Field(
        default=REVIEWER_BACKSTORY_TMPL,
        description="backstory template for the reviewer agent to work on",
    )
    issue_description_tmpl: str = Field(default=ISSUE_DESC_TMPL)
    agent_logs_dir: Path = Field(..., description="logs for agent")
    is_benchmark: bool = Field(default=False, description="is running for benchmark")


class CoderAgent(BaseSWEAgent):
    def __init__(self, args: CoderAgentArgs):
        # initialize logs and history logs path
        self.args = args

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
        self.composio_client = Composio()

        # initialize agent-related different prompts
        self.agent_role = self.args.agent_role
        self.agent_goal = self.args.agent_goal
        self.expected_output = self.args.task_expected_output
        self.agent_backstory_tmpl = args.agent_backstory_tmpl
        self.reviewer_backstory_tmpl = args.reviewer_backstory_tmpl
        self.issue_description_tmpl = args.issue_description_tmpl

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
                logger.info(
                    "type of step_output: %s", type(agent_action_with_tool_out[0])
                )
        else:
            logger.info("type is not list: %s", type(step_output))

    def run(self, issue_config: IssueConfig, workspace_id: t.Optional[str] = None):
        llm = get_llm()
        repo_name = issue_config.repo_name
        if not repo_name:
            raise ValueError("no repo-name configuration is found")
        if not issue_config.issue_id:
            raise ValueError("no git-issue configuration is found")

        if not workspace_id:
            start_time = datetime.datetime.now()
            workspace_create_resp = CreateWorkspaceResponse.model_validate(
                self.composio_client.actions.execute(
                    action=Action.LOCALWORKSPACE_CREATEWORKSPACEACTION, params={}
                )
            )
            workspace_id = workspace_create_resp.workspace_id
            workspace_creation_time = datetime.datetime.now() - start_time
            print(
                "workspace is created, workspace-id is: %s, creation time: %s",
                workspace_id,
                workspace_creation_time,
            )

            start_time = datetime.datetime.now()
            self.composio_client.actions.execute(
                action=Action.CMDMANAGERTOOL_GITHUBCLONECMD,
                params={
                    "workspace_id": workspace_id,
                    "repo_name": issue_config.repo_name,
                    "base_commit": issue_config.base_commit_id,
                },
            )
            git_clone_time = datetime.datetime.now() - start_time
            print("git clone completed, time taken: %s", git_clone_time)

        issue_added_instruction = self.issue_description_tmpl.format(
            issue=issue_config.issue_desc, issue_id=issue_config.issue_id
        )
        backstory_added_instruction = self.agent_backstory_tmpl.format(
            workspace_id=workspace_id,
            repo_name=repo_name,
            repo_name_dir="/" + repo_name.split("/")[-1].strip(),
            base_commit=issue_config.base_commit_id,
        )
        # reviewer_backstory_added_instruction = self.reviewer_backstory_tmpl.format(
        #     issue_id=issue_config.issue_id,
        #     issue=issue_config.issue_desc,
        #     repo_name=repo_name,
        #     repo_name_dir="/" + repo_name.split("/")[-1].strip(),
        # )

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
        print("Getting patch")
        get_patch_resp = self.composio_client.actions.execute(
            action=Action.CMDMANAGERTOOL_GETPATCHCMD,
            params={"workspace_id": workspace_id},
        )
        print(f"Final Patch: {get_patch_resp[0][1]}")
        self.current_logs.append(
            {
                "agent_action": "final_patch",
                "agent_output": get_patch_resp[0][1],
            }
        )
        self.save_history(issue_config.issue_id)
