import logging
from pathlib import Path

from pydantic import BaseModel, Field
from rich.logging import RichHandler

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.command_runner_model import (
    AgentConfig,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    WorkspaceManagerFactory,
    get_container_process,
    get_workspace_meta_from_manager,
)
from composio.local_tools.local_workspace.commons.utils import (
    communicate,
    communicate_with_handling,
    copy_file_to_container,
    get_container_by_container_name,
)


LOGGER_NAME = "composio_logger"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False

STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"

script_path = Path(__file__).resolve()
script_dir = script_path.parent


class WorkspaceSetupRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id will be used to get status of the workspace"
    )


class WorkspaceSetupResponse(BaseModel):
    workspace_status: str = Field(
        ..., description="status of the workspace given in request"
    )


class SetupWorkspace(Action):
    """
    setsup workspace with the environment variables, scripts.
    sets the path, and sources necessary scripts
    """

    _display_name = "Setup workspace"
    _request_schema = WorkspaceSetupRequest
    _response_schema = WorkspaceSetupResponse
    _tags = ["workspace"]
    _tool_name = "localworkspace"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.container_name = ""
        self.image_name = ""
        self.container_process = None
        self.parent_pids = []
        self.container_obj = None
        self.return_code = None
        self.logger = logger
        self.config = None
        self.config_file_path = None

    def _setup(self, args: WorkspaceSetupRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        workspace_meta = get_workspace_meta_from_manager(
            self.workspace_factory, self.workspace_id
        )
        if not workspace_meta:
            raise ValueError(
                f"workspace not found, invalid workspace-id: {self.workspace_id}"
            )
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_process = get_container_process(
            workspace_meta[KEY_WORKSPACE_MANAGER]
        )
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = self.get_container_by_container_name()
        self.return_code = None
        self.logger = logger
        self.config = None
        self.config_file_path = script_dir / Path("../../config/default.yaml")
        self.load_config_from_path()
        if not self.container_obj:
            raise ValueError(
                f"container-name {self.container_name} is not a valid docker-container"
            )

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def execute(
        self, request_data: WorkspaceSetupRequest, authorisation_data: dict = {}
    ):
        self._setup(request_data)
        self.set_env_variables()
        env_vars = "\n".join(self.config.env_variables)
        return {"message": f"environment is set with variables: {env_vars}"}

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(
            self.container_name, self.image_name
        )
        return container_obj

    def load_config_from_path(self):
        if not self.config and self.config_file_path is not None:
            # If unassigned, we load the config from the file to store its contents with the overall arguments
            config = AgentConfig.load_yaml(self.config_file_path)
            object.__setattr__(self, "config", config)
        assert self.config is not None  # mypy

    def set_env_variables(self):
        commands_to_execute = [self.config.state_command.code] + [
            f"{k}={v}" for k, v in self.config.env_variables.items()
        ]
        commands = "\n".join(commands_to_execute)
        return_code = 0
        output = None
        try:
            output, return_code = communicate(
                self.container_process, self.container_obj, commands, self.parent_pids
            )
        except KeyboardInterrupt as exc:
            if return_code != 0:
                raise RuntimeError(
                    f"Nonzero return code: {return_code}\nOutput: {output}"
                ) from exc
            raise
        except Exception as e:
            logger.warning("Failed to set environment variables")
            raise e
        command_files = []
        for file in self.config.command_files:
            full_file_path = script_dir / Path("../../") / Path(file)
            datum = {}
            contents = ""
            with open(full_file_path, "r") as f:
                contents = f.read()
            datum["contents"] = contents
            filename = Path(file).name
            if not contents.strip().startswith("#!"):
                if filename.endswith(".sh"):
                    # files are sourced, so they are not executable
                    datum["name"] = Path(file).name
                    datum["type"] = "source_file"
                elif filename.startswith("_"):
                    # files are sourced, so they are not executable
                    datum["name"] = Path(file).name
                    datum["type"] = "utility"
                else:
                    raise ValueError(
                        (
                            f"Non-shell script file {file} does not start with shebang.\n"
                            "Either add a shebang (#!) or change the file extension to .sh if you want to source it.\n"
                            "You can override this behavior by adding an underscore to the file name (e.g. _utils.py)."
                        )
                    )
            else:
                # scripts are made executable
                datum["name"] = Path(file).name.rsplit(".", 1)[0]
                datum["type"] = "script"
            command_files.append(datum)
        self.add_commands(command_files)

    def add_commands(self, commands: list[dict]) -> None:
        """
        Adds custom commands to container
        """
        for command in commands:
            name = command["name"]
            contents = command["contents"]
            copy_file_to_container(
                self.container_obj, contents, f"/root/commands/{name}"
            )
            if command["type"] == "source_file":
                communicate_with_handling(
                    self.container_process,
                    self.container_obj,
                    f"source /root/commands/{name}",
                    self.parent_pids,
                    error_msg=(
                        f"Failed to source {name}. If you meant to make a script "
                        f"start the file with a shebang (e.g. #!/usr/bin/env python)."
                    ),
                )
            elif command["type"] == "script":
                communicate_with_handling(
                    self.container_process,
                    self.container_obj,
                    f"chmod +x /root/commands/{name}",
                    self.parent_pids,
                    error_msg=f"Failed to chmod {name}",
                )
            elif command["type"] == "utility":
                # nothing to do for utility scripts
                pass
            else:
                raise ValueError(f"Invalid command type: {command['type']}")
