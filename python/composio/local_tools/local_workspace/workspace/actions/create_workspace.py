from pathlib import Path

from pydantic import Field

from composio.local_tools.local_workspace.commons.command_runner_model import (
    AgentConfig,
)
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    LocalDockerArgumentsModel,
    get_container_process,
    get_workspace_meta_from_manager,
)
from composio.local_tools.local_workspace.commons.utils import (
    communicate,
    communicate_with_handling,
    copy_file_to_container,
    get_container_by_container_name,
)

from .base_workspace_action import (
    BaseWorkspaceAction,
    BaseWorkspaceRequest,
    BaseWorkspaceResponse,
)


logger = get_logger()
STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"

script_path = Path(__file__).resolve()
script_dir = script_path.parent


class CreateWorkspaceRequest(BaseWorkspaceRequest):
    image_name: str = Field(
        default="sweagent/swe-agent:latest",
        description="""The workspace is a docker container.
        Use docker image sweagent/swe-agent:latest it works for most use cases.
        Only use a different docker image if you have a good reason.
        Ex. image names ubuntu:22.04
        """,
        examples=["sweagent/swe-agent:latest", "ubuntu:22.04"],
    )


class CreateWorkspaceResponse(BaseWorkspaceResponse):
    workspace_id: str = Field(..., description="workspace-id for the created workspace")


class CreateWorkspaceAction(BaseWorkspaceAction):
    """
    Creates a workspace, and returns workspace-id
    """

    _display_name = "Create workspace"
    _request_schema = CreateWorkspaceRequest
    _response_schema = CreateWorkspaceResponse

    def execute(
        self, request_data: CreateWorkspaceRequest, authorisation_data: dict
    ) -> CreateWorkspaceResponse:
        if self.workspace_factory is None:
            raise ValueError("Workspace factory is not set")

        if request_data.image_name == "":
            request_data.image_name = "sweagent/swe-agent:latest"

        args: LocalDockerArgumentsModel = LocalDockerArgumentsModel(
            image_name=request_data.image_name
        )
        print(f"Creating workspace with image name: {request_data.image_name}")
        workspace_id = self.workspace_factory.get_workspace_manager(args)
        print(f"workspace-id: {workspace_id}")
        self.workspace_id = workspace_id
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
        self.container_obj = get_container_by_container_name(
            self.container_name, self.image_name
        )
        self.return_code = None
        self.logger = logger
        self.config_file_path = script_dir / Path("../../config/default.yaml")
        self.config = AgentConfig.load_yaml(self.config_file_path)
        if not self.container_obj:
            raise ValueError(
                f"container-name {self.container_name} is not a valid docker-container"
            )
        self.set_env_variables()
        env_vars = "\n".join(self.config.env_variables)
        print(f"environment is set with variables: {env_vars}")
        return CreateWorkspaceResponse(workspace_id=workspace_id)

    def set_env_variables(self):
        commands_to_execute = (
            [self.config.state_command.code]
            + ["pip install flake8"]
            + [f"{k}={v}" for k, v in self.config.env_variables.items()]
        )
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
            with open(full_file_path, "r", encoding="utf-8") as f:
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
