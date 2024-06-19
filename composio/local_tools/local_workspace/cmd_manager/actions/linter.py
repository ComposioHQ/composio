import json
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

import re

def get_errors(output):
    # Regex pattern to find filenames and errors
    pattern = r"([^\s:]+\.py):(\d+):\d+: (\w+): (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, error_code, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(f"line_number: {line_number}, error: {error_message}")

    return file_errors

def get_mypy_errors(output):
    # Regex pattern to find filenames and errors
    pattern = r"([^\s:]+\.py):(\d+): error: (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(f"line_number: {line_number}, error: {error_message}")

    return file_errors

def get_flake8_errors(output):
    pattern = r"([^\s:]+\.py):(\d+):(\d+): (\w+) (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, column_number, error_code, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(f"line_number: {line_number}, error: {error_message}")

    return file_errors


class LinterRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id for the linter to work")

class LinterResponse(BaseModel):
    lint_errors: str = Field(..., description="its a json dump of errors in the format of {file_name: <list_of_errors>}")


class PylintLinter(BaseAction):
    """
    Runs pylint command on the code, and returns output in format like this
    {<file_name>: ["line_number": <>, "error": ""]}
    """
    _display_name = "Lint Python code with Pylint"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(self, request_data: LinterRequest, authorisation_data: dict = {}) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e pylint"
        pylint_out, return_code = communicate(self.container_process, self.container_obj, cmd, self.parent_pids, timeout_duration=200)
        if return_code == 0:
            pylint_out = f"No errors detected by pylint. pylint output: {pylint_out}"
        else:
            pylint_out = json.dumps(get_errors(pylint_out))
        return BaseResponse(output=pylint_out, return_code=return_code)

class Flake8Linter(BaseAction):
    """
       Runs flake8 command on the code, and returns output in format like this
       {<file_name>: ["line_number": <>, "error": ""]}
       """
    _display_name = "Lint Python code with Flake8"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(self, request_data: LinterRequest, authorisation_data: dict = {}) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e flake8"
        flake8_out, return_code = communicate(self.container_process, self.container_obj, cmd, self.parent_pids, timeout_duration=70)
        if return_code == 0:
            flake8_out = f"No errors detected by Flake8. tox output: {flake8_out}"
        else:
            flake8_out = json.dumps(get_flake8_errors(flake8_out))
        return BaseResponse(output=flake8_out, return_code=return_code)


class BlackLinter(BaseAction):
    """
       Runs black command on the code, and also formats the file
    """
    _display_name = "Format Python code with Black"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(self, request_data: LinterRequest, authorisation_data: dict = {}) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e black"
        black_output, return_code =  communicate(self.container_process, self.container_obj, cmd, self.parent_pids, timeout_duration=45)
        if return_code == 0:
            black_output = f"No errors detected by black. tox output: {black_output}"
        else:
            black_output = "\n".join(black_output)
        return BaseResponse(output=black_output, return_code=return_code)


class IsortLinter(BaseAction):
    """
    Runs isort command on the code, and also formats the file
    """
    _display_name = "Sort imports in Python code with Isort"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(self, request_data: LinterRequest, authorisation_data: dict = {}) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e isort"
        isort_out, return_code = communicate(self.container_process, self.container_obj, cmd, self.parent_pids, timeout_duration=45)
        if return_code == 0:
            isort_out = f"No errors detected by isort. tox output: {isort_out}"
        else:
            isort_out = "\n".join(isort_out)
        return BaseResponse(output=isort_out, return_code=return_code)



