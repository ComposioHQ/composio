"""
This module contains the base class for the SWE agent.
"""

import datetime
import json
import typing as t
from abc import ABC, abstractmethod
from pathlib import Path

from composio_crewai import ComposioToolSet
from pydantic import BaseModel, Field
from swekit.config.store import IssueConfig
from swekit.exceptions import SWEKitError

from composio import Action
from composio.utils import logging


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
        self.agent_logs_dir = args.agent_logs_dir
        self.task_output_logs = self.agent_logs_dir / (
            AGENT_LOGS_JSON_PATH + datetime.datetime.now().strftime("%m_%d_%Y_%H_%M_%S")
        )
        self.agent_logs: t.Dict[str, t.Any] = {}
        self.current_logs: t.List[t.Any] = []

    def save(self, instance_id: str) -> None:
        """Save current history state."""
        self.agent_logs[instance_id] = self.current_logs
        with open(self.task_output_logs, "w", encoding="utf-8") as f:
            self.logger.info(f"Saving logs to {self.task_output_logs}")
            f.write(json.dumps(self.agent_logs))

    def setup_and_solve(
        self,
        workspace_id: str,
        issue_config: IssueConfig,
    ) -> str:
        self.logger.info("Starting the agent")
        self.solve(issue_config)
        composio_toolset = ComposioToolSet(workspace_id=workspace_id)

        self.logger.info("Getting patch")
        get_patch_resp = composio_toolset.execute_action(
            action=Action.GITCMDTOOL_GET_PATCH_CMD,
            params={},
        )
        if (
            isinstance(get_patch_resp, dict)
            and get_patch_resp.get("status") == "failure"
        ):
            raise SWEKitError(get_patch_resp["details"])
        self.logger.info(f"Get patch response: {get_patch_resp}")
        patch = get_patch_resp.get("stdout")  # type: ignore
        self.logger.info(f"Final Patch: {patch}")
        self.current_logs.append(
            {
                "agent_action": "final_patch",
                "agent_output": patch,
            }
        )
        self.save(t.cast(str, issue_config.issue_id))
        return str(patch)

    @abstractmethod
    def solve(self, issue_config: IssueConfig):
        """Solve the issue in the workspace."""
