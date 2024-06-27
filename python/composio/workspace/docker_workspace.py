import subprocess
from .base_workspace import *


class DockerWorkspace(Workspace):
    def __init__(self, workspace_id: str):
        self.container_id = workspace_id
        self.container = None
        self.container_obj = None
        self.parent_pids = None

    def setup(self, env: WorkspaceEnv, **kwargs):
        # todo implement this to setup underline container process
        return

    def reset(self):
        # todo implement this to reset to initial state
        return

    def communicate(self, cmd: Command, timeout: int) -> BaseCmdResponse:
        if self.container is None:
            raise ValueError("Container is None")
        output, return_code = communicate(
            self.container,
            self.container_obj,
            cmd.get_cmd_str(),
            list(self.parent_pids),
            timeout,
        )
        output, return_code = process_output(output, return_code)
        return BaseCmdResponse(output=output, return_code=return_code)

    def get_state(self) -> dict:
        return {"container_id": self.container_id}

    def close(self):
        # todo implement this to close the container
        return