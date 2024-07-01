"""
This module contains the base class for the SWE agent.
"""

import datetime
import json
import typing as t
from abc import ABC, abstractmethod
from pathlib import Path

from composio_swe.config.store import IssueConfig
from composio_swe.exceptions import ComposioSWEError
from pydantic import BaseModel, Field

from composio import Action, Composio
from composio.utils import logging
from composio.workspace.docker_workspace import LocalDockerArgumentsModel
from composio.workspace.workspace_factory import WorkspaceFactory, WorkspaceType


AGENT_LOGS_JSON_PATH = "agent_logs.json"
LOGS_DIR_NAME_PREFIX = "coder_agent_logs"


class SWEArgs(BaseModel):
    """Arguments for the SWE agent."""

    agent_logs_dir: Path = Field(..., description="logs for agent")
    """The directory to store the agent logs."""


class BaseSWEAgent(ABC, logging.WithLogger):
    """
    BaseSWEAgent is an abstract base class for the SWE agent. It provides the basic
    structure and functionalities required for a SWE agent, including logging,
    workspace creation, and issue solving.

    Example:
        ```python
        class MySWEAgent(BaseSWEAgent):
            def solve(self, workspace_id: str, issue_config: IssueConfig):
                # Implementation of issue solving logic
                pass

        args = SWEArgs(agent_logs_dir=Path("/path/to/logs"))
        agent = MySWEAgent(args)
        workspace_id = agent.create_and_setup_workspace("repo_name", "commit_id")
        agent.solve(workspace_id, issue_config)
        agent.save_history("instance_id")
        ```
    """

    def __init__(self, args: SWEArgs) -> None:
        """Initialize the SWE agent."""
        logging.WithLogger.__init__(self)
        self.composio_client = Composio()
        self.agent_logs_dir = args.agent_logs_dir
        self.task_output_logs = self.agent_logs_dir / (
            AGENT_LOGS_JSON_PATH + datetime.datetime.now().strftime("%m_%d_%Y_%H_%M_%S")
        )
        self.agent_logs: t.Dict[str, t.Any] = {}
        self.current_logs: t.List[t.Any] = []

    def _create_workspace(self) -> str:
        """Create the workspace."""
        start_time = datetime.datetime.now()
        workspace_id = WorkspaceFactory.get_instance().create_workspace(
            workspace_type=WorkspaceType.DOCKER,
            local_docker_args=LocalDockerArgumentsModel(
                image_name="sweagent/swe-agent"
            ),
        )
        self.logger.info(
            "workspace is created, workspace-id is: %s, creation time: %s",
            workspace_id,
            datetime.datetime.now() - start_time,
        )
        return workspace_id

    def _clone_repository(
        self, workspace_id: str, repo_name: str, base_commit_id: str
    ) -> None:
        """Clone repository to the workspace."""
        start_time = datetime.datetime.now()
        action_response = self.composio_client.actions.execute(
            action=Action.GITCMDTOOL_GITHUBCLONECMD,
            params={
                "workspace_id": workspace_id,
                "repo_name": repo_name,
                "commit_id": base_commit_id,
            },
        )
        if isinstance(action_response, dict) and action_response["status"] == "failure":
            raise ComposioSWEError(action_response["details"])
        self.logger.info("git clone completed, response: %s", action_response)
        self.logger.info(
            "git clone completed, time taken: %s", datetime.datetime.now() - start_time
        )

    def create_and_setup_workspace(self, repo_name: str, base_commit_id: str) -> str:
        """Create and setup the workspace."""
        workspace_id = self._create_workspace()
        self._clone_repository(
            workspace_id=workspace_id,
            repo_name=repo_name,
            base_commit_id=base_commit_id,
        )
        return workspace_id

    def save(self, instance_id: str) -> None:
        """Save current history state."""
        self.agent_logs[instance_id] = self.current_logs
        with open(self.task_output_logs, "w", encoding="utf-8") as f:
            f.write(json.dumps(self.agent_logs))

    def setup_and_solve(
        self,
        issue_config: IssueConfig,
        workspace_id: t.Optional[str] = None,
    ) -> str:
        if workspace_id is None:
            if issue_config.repo_name is None:
                raise ValueError("`repo_name` should be provided")
            workspace_id = self.create_and_setup_workspace(
                issue_config.repo_name,
                t.cast(str, issue_config.base_commit_id),
            )

        self.logger.info("Starting the agent")
        self.solve(workspace_id, issue_config)

        self.logger.info("Getting patch")
        get_patch_resp = self.composio_client.actions.execute(
            action=Action.CMDMANAGERTOOL_GETPATCHCMD,
            params={"workspace_id": workspace_id},
        )
        if isinstance(get_patch_resp, dict) and get_patch_resp["status"] == "failure":
            raise ComposioSWEError(get_patch_resp["details"])
        patch = get_patch_resp.output  # type: ignore
        self.logger.info(f"Final Patch: {patch}")
        self.current_logs.append(
            {
                "agent_action": "final_patch",
                "agent_output": patch,
            }
        )
        self.save(t.cast(str, issue_config.issue_id))
        return patch

    @abstractmethod
    def solve(self, workspace_id: str, issue_config: IssueConfig):
        """Solve the issue in the workspace."""
