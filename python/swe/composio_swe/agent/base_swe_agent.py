import datetime
import json
import typing as t
from abc import ABC, abstractmethod
from pathlib import Path

from composio_swe.config.config_store import IssueConfig
from composio.workspace.workspace_factory import WorkspaceType, WorkspaceFactory
from composio.workspace.docker_workspace import LocalDockerArgumentsModel
from pydantic import BaseModel, Field

from composio import Action, Composio
from composio.utils.logging import WithLogger


AGENT_LOGS_JSON_PATH = "agent_logs.json"
LOGS_DIR_NAME_PREFIX = "coder_agent_logs"


class SWEArgs(BaseModel):
    agent_logs_dir: Path = Field(..., description="logs for agent")


class BaseSWEAgent(ABC, WithLogger):
    def __init__(self, args: SWEArgs):
        super().__init__()
        self.agent_logs_dir = args.agent_logs_dir
        self.composio_client = Composio()
        # initialize agent logs and history dict
        self.agent_logs_dir = args.agent_logs_dir
        self.task_output_logs = self.agent_logs_dir / Path(
            AGENT_LOGS_JSON_PATH + datetime.datetime.now().strftime("%m_%d_%Y_%H_%M_%S")
        )
        self.agent_logs: t.Dict[str, t.Any] = {}
        self.current_logs: t.List[t.Any] = []

    def create_and_setup_workspace(self, repo_name: str, base_commit_id: str) -> str:
        start_time = datetime.datetime.now()
        workspace_id = WorkspaceFactory.get_instance().create_workspace(workspace_type=WorkspaceType.DOCKER,
                                                         local_docker_args=LocalDockerArgumentsModel(image_name="sweagent/swe-agent"))
        workspace_creation_time = datetime.datetime.now() - start_time
        print(
            "workspace is created, workspace-id is: %s, creation time: %s",
            workspace_id,
            workspace_creation_time,
        )

        start_time = datetime.datetime.now()
        action_response = self.composio_client.actions.execute(
            action=Action.CMDMANAGERTOOL_GITHUBCLONECMD,
            params={
                "workspace_id": workspace_id,
                "repo_name": repo_name,
                "commit_id": base_commit_id,
            },
        )
        if isinstance(action_response, dict) and action_response["status"] == "failure":
            raise RuntimeError(action_response["details"])
        self.logger.info("git clone completed, response: %s", action_response)
        git_clone_time = datetime.datetime.now() - start_time
        self.logger.info("git clone completed, time taken: %s", git_clone_time)
        return workspace_id

    @abstractmethod
    def solve_issue(self, workspace_id: str, issue_config: IssueConfig):
        pass

    def save_history(self, instance_id):
        self.agent_logs[instance_id] = self.current_logs
        with open(self.task_output_logs, "w", encoding="utf-8") as f:
            f.write(json.dumps(self.agent_logs))

    def setup_and_solve(
        self, issue_config: IssueConfig, workspace_id: t.Optional[str] = None
    ) -> str:
        if workspace_id is None:
            assert (
                issue_config.repo_name is not None
            ), "repo_name should be provided"
            workspace_id = self.create_and_setup_workspace(
                issue_config.repo_name, issue_config.base_commit_id
            )
        self.solve_issue(workspace_id, issue_config)
        print("Getting patch")
        get_patch_resp = self.composio_client.actions.execute(
            action=Action.CMDMANAGERTOOL_GETPATCHCMD,
            params={"workspace_id": workspace_id},
        )
        patch = get_patch_resp[0][1]
        print(f"Final Patch: {patch}")
        self.current_logs.append(
            {
                "agent_action": "final_patch",
                "agent_output": patch,
            }
        )
        self.save_history(issue_config.issue_id)
        return patch
