import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ShellExecResponse,
    ShellRequest,
)
from composio.utils.logging import get as get_logger


LONG_TIMEOUT = 200
logger = get_logger("workspace")


class GetPatchRequest(ShellRequest):
    new_file_path: t.List[str] = Field(
        default=[],
        description="Paths of the files newly created to be included in the patch.",
    )


class GetPatchResponse(ShellExecResponse):
    pass


class GetPatchCmd(LocalAction[GetPatchRequest, GetPatchResponse]):
    """
    Get the patch from the current working directory. The patch is present in
    the output field of the response. The patch is in the format of a proper diff
    format. It incorporates any new files specified in the request, thereby
    excluding irrelevant installation files. It includes deleted files by default.
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

    def execute(self, request: GetPatchRequest, metadata: t.Dict) -> GetPatchResponse:
        new_files = " ".join(request.new_file_path)
        cmd = ["git add -u"]
        if len(request.new_file_path) > 0:
            cmd = [f"git add {new_files}", "git add -u"]
        output = self.shells.get(request.shell_id).exec(cmd=" && ".join(cmd))
        return GetPatchResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
