from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ExecuteCommand,
    ShellExecRequest,
    ShellExecResponse,
    ShellRequest,
)


class GetCurrentDirRequest(ShellRequest):
    """Get current directory request."""


class GetCurrentDirResponse(ShellExecResponse):
    """Get current directory response."""


class GetCurrentDirectory(ExecuteCommand):
    """
    Gets the current directory. This is equivalent to running 'pwd' in the terminal.
    """

    _display_name = "Get Current Directory Action"
    _tool_name = "shell_cmd"
    _request_schema = GetCurrentDirRequest
    _response_schema = GetCurrentDirResponse

    def execute(
        self,
        request_data: ShellExecRequest,
        authorisation_data: dict,
    ) -> GetCurrentDirResponse:
        response = super().execute(
            request_data=ShellExecRequest(
                cmd="pwd",
                shell_id=request_data.shell_id,
            ),
            authorisation_data=authorisation_data,
        )
        return GetCurrentDirResponse(
            stdout=response.stdout,
            stderr=response.stderr,
        )
