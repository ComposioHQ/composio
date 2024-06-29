import subprocess

from composio.workspace.workspace_clients import E2BClient

from .base_workspace import BaseCmdResponse, Command, Workspace, WorkspaceEnv


class E2BWorkspace(Workspace):
    def __init__(self, args, client: E2BClient):
        super().__init__()
        self.sandbox_id = None
        self.sandbox = None
        self.args = args
        self.client = client

    def setup(self, env: WorkspaceEnv, **kwargs):
        # Setup the E2B sandbox environment
        pass

    def reset(self):
        # Reset the sandbox to its initial state
        pass

    def communicate(self, cmd: Command, timeout: int = 25) -> BaseCmdResponse:
        if self.sandbox is None:
            raise ValueError("Sandbox is None")
        result = subprocess.run(
            ["e2b-sandbox-cli", "exec", self.sandbox_id, cmd.get_cmd_str()],
            capture_output=True,
            text=True,
            check=False,
        )
        return BaseCmdResponse(output=result.stdout, retunr_code=result.returncode)

    def get_state(self) -> dict:
        state_result = subprocess.run(
            ["e2b-sandbox-cli", "state", self.sandbox_id],
            capture_output=True,
            text=True,
            check=False,
        )
        return {"sandbox_id": self.sandbox_id, "state": state_result.stdout}

    def get_running_status(self):
        return {}

    def close(self):
        # Close the sandbox
        pass
