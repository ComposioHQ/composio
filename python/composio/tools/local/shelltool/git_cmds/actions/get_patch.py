import typing as t

from pydantic import Field

from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)
from composio.tools.local.shelltool.utils import get_logger


LONG_TIMEOUT = 200
logger = get_logger("workspace")


class GetPatchRequest(ShellRequest):
    new_file_path: t.List[str] = Field(
        default=[],
        description="Paths of the files newly created to be included in the patch.",
    )


class GetPatchResponse(ShellExecResponse):
    pass


class GetPatchCmd(BaseExecCommand):
    """
    Get the patch from the current working directory. The patch is present in the output field of the response.
    The patch is in the format of a proper diff format.
    It incorporates any new files specified in the request, thereby excluding irrelevant installation files.
    It includes deleted files by default.
    You should run it after all the changes are made to git add and check the result.
    Example:
    diff --git a/repo/example.py b/repo/example.py
    index 1234567..89abcde 100644
    --- a/repo/example.py
    +++ b/repo/example.py
    @@ -1 +1 @@
    -Hello, World!
    +Hello, Composio!
    """

    _tool_name = "gitcmdtool"
    _display_name = "Get Patch Action"
    _request_schema = GetPatchRequest
    _response_schema = GetPatchResponse

    def execute(
        self, request_data: ShellRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        get_patch_request = t.cast(GetPatchRequest, request_data)
        new_files = " ".join(get_patch_request.new_file_path)
        cmd_list = ["git add -u"]
        if len(get_patch_request.new_file_path) > 0:
            cmd_list = [f"git add {new_files}", "git add -u"]
        cmd_list.append("git diff --cached")
        output = exec_cmd(
            cmd=" && ".join(cmd_list),
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return ShellExecResponse(stdout=output["stdout"], stderr=output["stderr"])
