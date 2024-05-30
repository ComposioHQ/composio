# flake8: noqa

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.command_runner_model import (
    AgentConfig,
)
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    WorkspaceManagerFactory,
    communicate,
    get_container_process,
    get_workspace_meta_from_manager,
)
from composio.local_tools.local_workspace.commons.utils import (
    close_container,
    get_container_by_container_name,
    interrupt_container,
)


logger = get_logger()

script_path = Path(__file__).resolve()
script_dir = script_path.parent
CONFIG_FILE_PATH = script_dir / Path("../../config/default.yaml")


@dataclass(frozen=True)
class RunCommandOnWorkspaceRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    input_cmd: str = Field(
        ..., description="github repo-name for which issue needs to be solved"
    )


class RunCommandOnWorkspaceResponse(BaseModel):
    observation: str = Field(..., description="output of the command")
    info: dict = Field(..., description="information")


class RunCommandOnWorkspace(Action):
    """
    runs a command on the given workspace
    """

    _display_name = "Run command on workspace"
    _request_schema = RunCommandOnWorkspaceRequest
    _response_schema = RunCommandOnWorkspaceResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.name = "agent"
        self.logger = logger
        self.config_file_path = ""
        self.args = None
        self.workspace_id = ""
        # set self.command --> it is used by history-processor to record the command as part of history
        self.command = ""
        self.image_name = ""
        self.container_name = ""
        self.container_process = None
        self.parent_pids = []
        self.container_obj = None
        self.return_code = None
        self.config = None
        self.command_patterns = None
        self.subroutine_patterns = None

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def _setup(self, args: RunCommandOnWorkspaceRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.config_file_path = Path(CONFIG_FILE_PATH)
        # set self.command --> it is used by history-processor to record the command as part of history
        self.command = args.input_cmd
        workspace_meta = get_workspace_meta_from_manager(
            self.workspace_factory, self.workspace_id
        )
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = get_container_process(
            workspace_meta[KEY_WORKSPACE_MANAGER]
        )
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = self.get_container_by_container_name()
        if not self.container_obj:
            raise ValueError(
                f"container-name {self.container_name} is not a valid docker-container"
            )
        self.return_code = None
        self.config = None
        self.load_config_from_path()
        self._parse_command_patterns()

    @history_recorder()
    def execute(
        self, request_data: RunCommandOnWorkspaceRequest, authorisation_data: dict = {}
    ):
        self._setup(request_data)
        obs, _, done, info = self.run_incoming_action(request_data.input_cmd)
        logger.info("returned from process: %s", done)
        return RunCommandOnWorkspaceResponse(observation=obs, info=info)

    def load_config_from_path(self):
        if not self.config and self.config_file_path is not None:
            # If unassigned, we load the config from the file to store its contents with the overall arguments
            config = AgentConfig.load_yaml(self.config_file_path)
            object.__setattr__(self, "config", config)
            multi_line_command_endings = {
                command.name: command.end_name
                for command in [*config._commands]
                if command.end_name is not None
            }
            object.__setattr__(
                config, "multi_line_command_endings", multi_line_command_endings
            )
        assert self.config is not None  # mypy

    def _parse_command_patterns(self):
        assert self.config is not None  # mypy
        self.command_patterns = {}
        for command in self.config._commands:
            if command.end_name is not None:
                pat = re.compile(
                    rf"^\s*({command.name})\s*(.*?)^({command.end_name})\s*$",
                    re.DOTALL | re.MULTILINE,
                )
                self.command_patterns[command.name] = pat
            else:
                pat = re.compile(rf"^\s*({command.name})\s*(.*?)$", re.MULTILINE)
                self.command_patterns[command.name] = pat
        self.subroutine_patterns = {}
        for _, subroutine in self.config._subroutines.items():
            if subroutine.end_name is None:
                pat = re.compile(rf"^\s*({subroutine.name})\s*(.*?)$", re.MULTILINE)
                self.subroutine_patterns[subroutine.name,] = pat
            else:
                pat = re.compile(
                    rf"^\s*({subroutine.name})\s*(.*?)^({subroutine.end_name})\s*$",
                    re.DOTALL | re.MULTILINE,
                )
                self.subroutine_patterns[subroutine.name] = pat
        if hasattr(self.config, "submit_command_end_name"):
            submit_pat = re.compile(
                rf"^\s*({self.config.submit_command})\s*(.*?)^({self.config.submit_command_end_name})\s*$",
                re.DOTALL | re.MULTILINE,
            )
        else:
            submit_pat = re.compile(
                rf"^\s*({self.config.submit_command})(\s*)$", re.MULTILINE
            )  # group 2 is nothing
        self.subroutine_patterns[self.config.submit_command] = submit_pat
        self.command_patterns[self.config.submit_command] = submit_pat

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(
            self.container_name, self.image_name
        )
        return container_obj

    def _get_first_match(self, action: str, pattern_type: str) -> Optional[re.Match]:
        """Return the first match of a command pattern in the action string."""
        assert self.config is not None  # mypy
        if pattern_type == "subroutine":
            patterns = {k: v for k, v in self.subroutine_patterns.items()}
        elif pattern_type == "multi_line":
            patterns = {
                k: v
                for k, v in self.command_patterns.items()
                if k in self.config.multi_line_command_endings
                or k == self.config.submit_command
            }
            patterns.update(
                {
                    k: v
                    for k, v in self.subroutine_patterns.items()
                    if k in self.config.multi_line_command_endings
                }
            )
        elif pattern_type == "multi_line_no_subroutines":
            patterns = {
                k: v
                for k, v in self.command_patterns.items()
                if k in self.config.multi_line_command_endings
            }
        else:
            raise ValueError(f"Unknown pattern type: {pattern_type}")
        matches = []
        for name, pat in patterns.items():
            match = pat.search(action)
            if match:
                matches.append(match)
        if len(matches) == 0:
            return None
        matches = sorted(matches, key=lambda x: x.start())
        return matches[0]

    def _guard_multiline_input(self, action: str) -> str:
        """Split action by multiline commands, then append the first line in each multiline command with "<< '{end_name}'".
        Multiline commands (which are specified by an end_name) are commands that span multiple lines and are terminated by a specific end_name.

        Their multi-line argument is sent using a heredoc, which is a way to send a multi-line string to a command in bash.
        """
        parsed_action = []
        rem_action = action
        while rem_action.strip():
            first_match = self._get_first_match(rem_action, "multi_line_no_subroutines")
            if first_match:
                pre_action = rem_action[: first_match.start()]
                match_action = rem_action[first_match.start() : first_match.end()]
                rem_action = rem_action[first_match.end() :]
                if pre_action.strip():
                    parsed_action.append(pre_action)
                if match_action.strip():
                    eof = first_match.group(3).strip()
                    if not match_action.split("\n")[0].strip().endswith(f"<< '{eof}'"):
                        guarded_command = match_action[first_match.start() :]
                        first_line = guarded_command.split("\n")[0]
                        guarded_command = guarded_command.replace(
                            first_line, first_line + f" << '{eof}'", 1
                        )
                        parsed_action.append(guarded_command)
                    else:
                        parsed_action.append(match_action)
            else:
                parsed_action.append(rem_action)
                rem_action = ""
        return "\n".join(parsed_action)

    def get_environment_vars(self):
        assert self.config is not None  # mypy
        env_vars = {}
        for var in self.config.env_variables:
            observation, return_code = communicate(
                self.container_process,
                self.container_obj,
                f"echo ${var}",
                parent_pids=self.parent_pids,
            )
            if return_code == 0:
                env_vars[var] = observation.strip()
        return env_vars

    def split_actions(
        self, action: str, pattern_type="subroutine"
    ) -> List[Dict[str, Any]]:
        """Split an action into a list of actions in a greedy manner,
        each of which is a subroutine call or a single command."""
        parsed_action = []
        rem_action = action
        while rem_action.strip():
            first_match = self._get_first_match(rem_action, pattern_type)
            if first_match:
                pre_action = rem_action[: first_match.start()]
                match_action = rem_action[first_match.start() : first_match.end()]
                rem_action = rem_action[first_match.end() :]
                if pre_action.strip():
                    parsed_action.append(
                        {"agent": self.name, "action": pre_action, "cmd_name": None}
                    )
                if match_action.strip():
                    if match_action.split()[0] == self.config.submit_command:
                        parsed_action.append(
                            {
                                "agent": self.name,
                                "action": match_action,
                                "cmd_name": first_match.group(1),
                            }
                        )  # submit command is not a subroutine
                    else:
                        parsed_action.append(
                            {
                                "agent": first_match.group(1),
                                "args": first_match.group(2),
                                "action": match_action,
                                "cmd_name": first_match.group(1),
                            }
                        )
            else:
                parsed_action.append(
                    {"agent": self.name, "action": rem_action, "cmd_name": None}
                )
                rem_action = ""
        return parsed_action

    def run_incoming_action(self, action: str):
        observations = []
        run_action = self._guard_multiline_input(action)
        info = None
        for sub_action in self.split_actions(run_action):
            if (
                sub_action["agent"] == self.name
                or sub_action["cmd_name"] == self.config.submit_command
            ):
                obs, _, done, info = self.step(sub_action["action"])
                observations.append(obs)
                if sub_action["cmd_name"] == self.config.submit_command:
                    done = True
                if done:
                    break
            else:
                raise ValueError(f"sub-command not supported {sub_action}")
                # agent_name = sub_action["agent"]
                # sub_agent_output = self.call_subroutine(agent_name, sub_action)
                # observations.append(sub_agent_output)

        observation = "\n".join([obs for obs in observations if obs is not None])
        return observation, 0, False, info

    def step(self, action: str) -> Tuple[Optional[str], int, bool, dict]:
        """
        Runs given action in environment and returns corresponding output

        Args:
            action (`str`) - command to run in bash shell

        Returns:
            observation (`str`) - output from container
            reward (`float`) - value between 0 and 1 quantifying correctness of output + environment state
            done (`bool`) - whether task is over
            info (`dict`) - additional information (e.g. debugging information)
        """
        info = {}

        # Handle special actions
        if action.strip() == "skip":
            observation = "Skipped"
            info["exit_status"] = "skipped"
            return observation, 0, True, info
        if action in {
            "exit_context",
            "exit_cost",
            "exit_error",
            "exit_format",
            "exit_api",
        }:
            try:
                observation, return_code = communicate(
                    self.container_process,
                    self.container_obj,
                    "submit",
                    parent_pids=self.parent_pids,
                )
                submission = self.get_submission("submit", observation)
                assert (
                    submission is not None and submission.strip() != ""
                ), AssertionError("No submission found.")
                self.logger.info(
                    f"Found submission: {submission}, return-code: {return_code}"
                )
                info["exit_status"] = f"submitted ({action})"
                info["submission"] = submission
                observation = "Exited (autosubmitted)"
                logger.info("Exiting with autosubmission")
                return observation, 0, True, info
            except KeyboardInterrupt:
                logger.info("got keyboard interrupt")
                raise
            except Exception as e:
                logger.error(f"exiting cmd, exception: {e}")
                observation = "Exited"
                info["exit_status"] = action
                return observation, 0, True, info

        # Attempt to run action in container
        observation = ""
        try:
            observation, return_code = communicate(
                self.container_process,
                self.container_obj,
                action,
                parent_pids=self.parent_pids,
                timeout_duration=25,
            )
        except TimeoutError:
            try:
                self.interrupt()
                observation += "\nEXECUTION TIMED OUT"
            except RuntimeError as e:
                observation += (
                    "\nEXECUTION TIMED OUT AND INTERRUPT FAILED. RESTARTING PROCESS."
                )
                info["exit_status"] = "early_exit"
                logger.warning(
                    f"Failed to interrupt container: {e}\nRESTARTING PROCESS."
                )
                self.close_container()
                return observation, 0, True, info
        except RuntimeError as e:
            observation += "\nCOMMAND FAILED TO EXECUTE. RESTARTING PROCESS."
            info["exit_status"] = "early_exit"
            logger.warning(f"Failed to execute command: {e}\nRESTARTING PROCESS.")
            self.close_container()
            return observation, 0, True, info
        except BrokenPipeError as e:
            observation += "\nBROKEN PIPE ERROR. RESTARTING PROCESS."
            info["exit_status"] = "early_exit"
            logger.error(f"Broken pipe error: {e}\nRESTARTING PROCESS.")
            self.close_container()
            return observation, 0, True, info
        except Exception as e:
            logger.error(f"cmd failed with exception: {e}")
            observation += "\nEXECUTION FAILED OR COMMAND MALFORMED"

        # Record submission and end episode if `submit` keyword found
        submission = self.get_submission(action, observation)
        if submission is not None:
            self.logger.info(f"Found submission: {submission}")
            info["exit_status"] = "submitted"
            info["submission"] = submission if submission.strip() != "" else None  # type: ignore
            observation = submission if submission.strip() != "" else None  # type: ignore
            return observation, 0, True, info
        return observation, 0, False, info

    def get_submission(self, action, output: str) -> str:
        """
        Function for extracting diff patch submission at the end of an episode.

        Args:
            output (`str`) - `submit` observation
        Returns:
            submission (`str`) - diff patch submission
        """
        pattern = r"\<\<SUBMISSION\|\|(.*)\|\|SUBMISSION\>\>"
        match = re.search(pattern, output, re.DOTALL)
        if match is None:
            return ""
        return match.group(1)

    def close_container(self) -> None:
        """
        called when a command failed to run on the local docker container.
        NOTE: this works here, as its a local container workspace,
              for docker on cloud, handle it appropriately
        """
        self.close()
        self.container_process = None
        self.container_obj = None

    def reset_container(self) -> None:
        self.close()
        self.container_process = None
        self.container_obj = None

    def close(self):
        close_container(self.container_process, self.container_obj)

    def interrupt(self):
        interrupt_container(self.container_process, self.container_obj)
