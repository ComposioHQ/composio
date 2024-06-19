from typing import Optional
from pydantic import BaseModel

from pydantic import Field

from .base_class import BaseAction, BaseResponse

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)

logger = get_logger()


class LinterRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id for the linter to work")
    file_name: str = Field(default="", description="file_name or directory where linter has to run")


class LinterResponse(BaseModel):
    lint_errors: str = Field(..., description="list of lint errors")


class Linter(BaseAction):
    """
    runs linter commands on the given file-name or directory
    """

    _history_maintains = True
    _display_name = "Lint Python code"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(
            self, request_data: LinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        if request_data.file_name:
            rel_fname = request_data.file_name
        else:
            rel_fname = "."

        black_output, return_code = self.lint_black(rel_fname)
        isort_out, return_code = self.lint_isort(rel_fname)
        pylint_out, return_code = self.lint_pylint(rel_fname)
        flake8_out, return_code = self.lint_flake8(rel_fname)

        results = [
            black_output, isort_out, pylint_out, flake8_out
        ]
        return BaseResponse(output="\n".join(results), return_code=return_code)

    def run_cmd(self, cmd):
        output, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
        )
        return output, return_code

    def lint_black(self, fname):
        cmd = ["black", "--check", fname]
        return self.run_cmd(cmd)

    def lint_isort(self, fname):
        cmd = ["isort", "--check-only", fname]
        return self.run_cmd(cmd)

    def lint_pylint(self, fname):
        cmd = ["pylint", fname]
        return self.run_cmd(cmd)

    def lint_flake8(self, fname):
        cmd = ["flake8", fname]
        return self.run_cmd(cmd)


