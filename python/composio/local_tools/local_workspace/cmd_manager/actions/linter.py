import json
import re

from pydantic import BaseModel, Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)

from .base_class import BaseAction, BaseRequest, BaseResponse


logger = get_logger()


def get_errors(output):
    # Regex pattern to find filenames and errors
    pattern = r"([^\s:]+\.py):(\d+):\d+: (\w+): (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, error_code, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(
            f"line_number: {line_number}, error: {error_message}"
        )

    return file_errors


def get_mypy_errors(output):
    # Regex pattern to find filenames and errors
    pattern = r"([^\s:]+\.py):(\d+): error: (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(
            f"line_number: {line_number}, error: {error_message}"
        )

    return file_errors


def get_flake8_errors(output):
    pattern = r"([^\s:]+\.py):(\d+):(\d+): (\w+) (.+)"
    matches = re.findall(pattern, output)
    file_errors = {}

    # Print the results
    for filename, line_number, column_number, error_code, error_message in matches:
        file_errors.setdefault(filename, [])
        file_errors[filename].append(
            f"line_number: {line_number}, column_number: {column_number}, error: {error_message}"
        )

    return file_errors


class LinterRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id for the linter to work")


class LinterResponse(BaseModel):
    lint_errors: str = Field(
        ...,
        description="its a json dump of errors in the format of {file_name: <list_of_errors>}",
    )


class LinterFileRequest(BaseRequest):
    workspace_id: str = Field(..., description="workspace-id for the linter to work")
    path: str = Field(
        ..., description="path of file or directory where linter has to run"
    )


class Autopep8Linter(BaseAction):
    """
    Runs autopep8 command on the code to format it according to PEP8 style guidelines.
    """

    _display_name = "Format Python code with Autopep8"
    _request_schema = LinterFileRequest
    _response_schema = BaseResponse

    @history_recorder()
    def execute(
        self, request_data: LinterFileRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        # Construct the command with autopep8
        cmd = f"autopep8 --r {request_data.path}"
        return_code = 0
        autopep8_output, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=45,
        )
        if return_code == 0:
            autopep8_output = (
                f"No issues detected by autopep8. autopep8 output: {autopep8_output}"
            )
        else:
            autopep8_output = autopep8_output
        return BaseResponse(output=autopep8_output, return_code=return_code)


class AutoFlakeLinterRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id for the linter to work")
    file_name: str = Field(
        ...,
        description="full path of the file, in which unused imports and unused varaibles have to be removed",
    )


class AutoflakeLinter(BaseAction):
    """
    Runs autoflake command on the code to remove unused imports and variables.
    """

    _display_name = "Remove unused imports and variables with Autoflake"
    _request_schema = AutoFlakeLinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(
        self, request_data: AutoFlakeLinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        # Construct the command with autoflake
        cmd = f"autoflake --in-place --remove-all-unused-imports --remove-unused-variables {request_data.file_name}"
        autoflake_output, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=45,
        )
        if return_code == 0:
            autoflake_output = (
                f"No issues detected by autoflake. autoflake output: {autoflake_output}"
            )
        return BaseResponse(output=autoflake_output, return_code=return_code)


class PylintLinter(BaseAction):
    """
    Runs pylint command on the code, and returns output in format like this
    {<file_name>: ["line_number": <>, "error": ""]}
    """

    _display_name = "Lint Python code with Pylint"
    _request_schema = LinterRequest
    _response_schema = LinterResponse

    @history_recorder()
    def execute(
        self, request_data: LinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e pylint"
        pylint_out, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=200,
        )
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
    def execute(
        self, request_data: LinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e flake8"
        flake8_out, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=70,
        )
        if return_code == 0:
            flake8_out = f"No errors detected by Flake8. tox output: {flake8_out}"
        else:
            flake8_errors = get_flake8_errors(flake8_out)
            for each_file in flake8_errors:
                autoflake_cmd = f"autoflake --in-place --remove-all-unused-imports --remove-unused-variables {each_file}"
                communicate(
                    self.container_process,
                    self.container_obj,
                    autoflake_cmd,
                    self.parent_pids,
                    timeout_duration=40,
                )
            flake8_out, return_code = communicate(
                self.container_process,
                self.container_obj,
                cmd,
                self.parent_pids,
                timeout_duration=70,
            )
            if return_code == 0:
                flake8_out = f"No errors detected by Flake8. tox output: {flake8_out}"
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
    def execute(
        self, request_data: LinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e black"
        black_output, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=45,
        )
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
    def execute(
        self, request_data: LinterRequest, authorisation_data: dict = {}
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "tox -e isort"
        isort_out, return_code = communicate(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            timeout_duration=45,
        )
        if return_code == 0:
            isort_out = f"No errors detected by isort. tox output: {isort_out}"
        else:
            isort_out = "\n".join(isort_out)
        return BaseResponse(output=isort_out, return_code=return_code)
