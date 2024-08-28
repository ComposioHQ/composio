import subprocess
from pathlib import Path
from typing import List, Optional, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class CodeFormatRequest(BaseModel):
    path: str = Field(
        ...,
        description="The file path or directory path to format and check.",
        examples=["/path/to/file.py", "/path/to/directory"],
    )


class FormatResult(BaseModel):
    file_path: str
    format_changes: List[str]
    errors: List[str]


class CodeFormatResponse(BaseModel):
    results: List[FormatResult] = Field(
        ...,
        description="A list of formatting results, each containing the file path, formatting changes, and errors.",
    )
    error: Optional[str] = Field(
        default=None,
        description="An error message describing any issues encountered during the formatting process. This field is None if the process was successful.",
    )


class FormatAndLintCodebase(LocalAction[CodeFormatRequest, CodeFormatResponse]):
    """
    Performs code formatting and linting using ruff, addressing style issues and checking for errors.

    This action is ideal for:
    - Applying consistent code formatting across Python files
    - Identifying and fixing style issues
    - Detecting potential errors and code quality problems
    - Maintaining a uniform code style across a project or codebase

    The formatting and linting are performed efficiently and can handle both single files and entire directories.

    This action provides a comprehensive tool for code quality improvement and standardization.
    """

    display_name = "Format and Lint Codebase"
    _request_schema: Type[CodeFormatRequest] = CodeFormatRequest
    _response_schema: Type[CodeFormatResponse] = CodeFormatResponse
    _tags = ["formatting"]
    _tool_name = "codeformat"

    def execute(self, request: CodeFormatRequest, metadata: dict) -> CodeFormatResponse:
        results = []
        path = Path(request.path)
        if not path.exists():
            return CodeFormatResponse(
                results=[],
                error=f"The specified path '{request.path}' does not exist or is not accessible.",
            )

        files_to_process = [path] if path.is_file() else list(path.rglob("*.py"))
        for file in files_to_process:
            format_changes = self._run_ruff_format(file)
            errors = self._run_ruff_check(file)
            results.append(
                FormatResult(
                    file_path=str(file),
                    format_changes=format_changes,
                    errors=errors,
                )
            )

        return CodeFormatResponse(results=results)

    def _run_ruff_format(self, file_path: Path) -> List[str]:
        return self._run_ruff_command(file_path, "format")

    def _run_ruff_check(self, file_path: Path) -> List[str]:
        return self._run_ruff_command(file_path, "check")

    def _run_ruff_command(self, file_path: Path, command: str) -> List[str]:
        try:
            result = subprocess.run(
                ["ruff", command, str(file_path)],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.splitlines()
        except subprocess.CalledProcessError as e:
            return [f"Error running ruff {command}: {e.stderr}"]
