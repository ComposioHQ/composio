import logging
import io
import os
import tarfile
from pathlib import Path
from rich.logging import RichHandler

from pydantic.v1 import BaseModel, Field

from tools.services.swelib.command_manager import CommandManager
from tools.services.swelib.local_workspace.command_runner_args import AgentConfig

from utils import (communicate,
                   get_container_by_container_name,
                   copy_file_to_container,
                   communicate_with_handling)

LOGGER_NAME = "composio_logger"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


class DockerSetupEnvRequest(BaseModel):
    container_name: str = Field(..., description="locally running docker-container name")
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    image_name: str


class DockerSetupManager(CommandManager):
    def __init__(self, args: DockerSetupEnvRequest):
        super().__init__()
        self.args = args
        self.image_name = args.image_name
        self.container_name = args.container_name
        self.container_obj = self.get_container_by_container_name()
        self.return_code = None
        self.logger = logger
        self.container_process = None
        self.parent_pids = None
        self.config = None
        self.config_file_path = Path("config/default.yaml")
        self.load_config_from_path()
        if not self.container_obj:
                raise Exception(f"container-name {self.container_name} is not a valid docker-container")

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(self.container_name, self.image_name)
        return container_obj

    def load_config_from_path(self):
        if not self.config and self.config_file_path is not None:
            # If unassigned, we load the config from the file to store its contents with the overall arguments
            config = AgentConfig.load_yaml(self.config_file_path)
            object.__setattr__(self, "config", config)
        assert self.config is not None  # mypy

    def copy_to_container(self):
        host_path = "./repo"
        container_path = "./"
        # Create a tarfile with the file to copy
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as tar:
            tar.add(host_path, arcname=os.path.basename(host_path))
        stream.seek(0)

        # Copy tarfile to container
        self.container_obj.put_archive(os.path.dirname(container_path), stream.read())

    def set_env_variables(self):
        commands_to_execute = (
                [self.config.state_command.code]
                +
                [f"{k}={v}" for k, v in self.config.env_variables.items()]
        )
        commands = "\n".join(commands_to_execute)
        return_code = 0
        output = None
        try:
            output, return_code = communicate(self.container_process, self.container_obj, commands, self.parent_pids)
        except KeyboardInterrupt:
            if return_code != 0:
                raise RuntimeError(
                    f"Nonzero return code: {return_code}\nOutput: {output}"
                )
            raise
        except Exception as e:
            logger.warning("Failed to set environment variables")
            raise e
        command_files = list()
        for file in self.config.command_files:
            datum = dict()
            contents = open(file, "r").read()
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
            copy_file_to_container(self.container_obj, contents, f"/root/commands/{name}")
            if command['type'] == "source_file":
                communicate_with_handling(self.container_process, self.container_obj,
                    f"source /root/commands/{name}", self.parent_pids,
                        error_msg=(f"Failed to source {name}. If you meant to make a script "
                                   f"start the file with a shebang (e.g. #!/usr/bin/env python)." )
                 )
            elif command['type'] == "script":
                communicate_with_handling(self.container_process, self.container_obj,
                    f"chmod +x /root/commands/{name}", self.parent_pids,
                    error_msg=f"Failed to chmod {name}",
                )
            elif command['type'] == "utility":
                # nothing to do for utility scripts
                pass
            else:
                raise ValueError(f"Invalid command type: {command['type']}")

    def set_container_process(self, container_process, parent_pids):
        self.container_process = container_process
        self.parent_pids = parent_pids


def execute_docker_setup_env(args: DockerSetupEnvRequest, container_process, parent_pids):
    c = DockerSetupManager(args)
    c.set_container_process(container_process, parent_pids)
    c.set_env_variables()
    env_vars = "\n".join(c.config.env_variables)
    return {"message": f"environment is set with variables: {env_vars}"}
