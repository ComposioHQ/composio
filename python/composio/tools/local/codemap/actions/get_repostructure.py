import ast
from pathlib import Path
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.grep_utils import get_files_excluding_gitignore


class GetRepoStructureRequest(BaseModel):
    code_directory: str = Field(
        ...,
        description="Absolute path to the root directory of the repository or codebase.",
        examples=[
            "/home/user/projects/my-repo",
            "/Users/username/Documents/my-project",
            "/project",
        ],
    )
    include_content: bool = Field(
        default=False,
        description="Whether to include the content of files in the repository structure.",
    )


class GetRepoStructureResponse(BaseModel):
    repository_structure: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Generated repository structure as a JSON object, containing a structured view of important code elements",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Detailed error message if an error occurred during structure generation",
    )


def parse_python_file(file_path, file_content=None, include_content=False):
    """Parse a Python file to extract class and function definitions with their line numbers.
    :param file_path: Path to the Python file.
    :return: Class names, function names, and file contents
    """
    if file_content is None:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
                file_content = file.read()
                parsed_data = ast.parse(file_content)
        except Exception:  # Catch all types of exceptions
            return [], [], ""
    else:
        try:
            parsed_data = ast.parse(file_content)
        except Exception:  # Catch all types of exceptions
            return [], [], ""

    class_info = []
    function_names = []
    class_methods = set()

    for node in ast.walk(parsed_data):
        if isinstance(node, ast.ClassDef):
            methods = []
            for n in node.body:
                if isinstance(n, ast.FunctionDef):
                    method_info = {
                        "name": n.name,
                        "start:end_line": f"{n.lineno}:{n.end_lineno}",
                    }
                    if include_content:
                        method_info["text"] = file_content.splitlines()[
                            n.lineno - 1 : n.end_lineno  # noqa: E203
                        ]
                    methods.append(method_info)
                    class_methods.add(n.name)
            class_info_dict = {
                "name": node.name,
                "start:end_line": f"{node.lineno}:{node.end_lineno}",
                "methods": methods,
            }
            if include_content:
                class_info_dict["text"] = file_content.splitlines()[
                    node.lineno - 1 : node.end_lineno  # noqa: E203
                ]
            class_info.append(class_info_dict)
        elif isinstance(node, ast.FunctionDef) and not isinstance(
            node, ast.AsyncFunctionDef
        ):
            if node.name not in class_methods:
                function_names.append(
                    {
                        "name": node.name,
                        "start:end_line": f"{node.lineno}:{node.end_lineno}",
                        "text": file_content.splitlines()[
                            node.lineno - 1 : node.end_lineno  # noqa: E203
                        ],
                    }
                )

    return class_info, function_names, file_content.splitlines()


class GetRepoStructure(LocalAction[GetRepoStructureRequest, GetRepoStructureResponse]):
    """
    Generates a comprehensive repository structure for all files within a given repository.

    This action analyzes the repository structure, focusing on all files in the repository.
    It provides a structured view of important code elements, helping software agents understand
    the layout and key components of the codebase.
    """

    display_name = "Generate Repository Structure"
    _request_schema: Type[GetRepoStructureRequest] = GetRepoStructureRequest
    _response_schema: Type[GetRepoStructureResponse] = GetRepoStructureResponse
    _tags = ["repository", "code-structure", "analysis"]
    _tool_name = "codemap"

    def execute(
        self, request: GetRepoStructureRequest, metadata: dict = {}
    ) -> GetRepoStructureResponse:
        repo_root = Path(request.code_directory).resolve()
        include_content = request.include_content

        if not repo_root.exists():
            error_message = (
                f"Repository root path '{repo_root}' does not exist or is inaccessible."
            )
            return GetRepoStructureResponse(error_message=error_message)

        try:
            repo_structure = {}  # type: ignore
            all_repository_files = get_files_excluding_gitignore(repo_root)
            for file_path in all_repository_files:
                file_path = Path(file_path)  # Ensure file_path is a Path object
                relative_path = file_path.relative_to(repo_root)

                # Check file size
                file_size = file_path.stat().st_size
                if file_size > 1_000_000:  # Skip files larger than 1MB
                    continue

                current_node = repo_structure
                for part in relative_path.parts[:-1]:
                    if part not in current_node:
                        current_node[part] = {}
                    current_node = current_node[part]

                file_name = relative_path.parts[-1]
                if file_path.suffix == ".py":
                    class_info, function_names, file_content = parse_python_file(
                        file_path
                    )

                    # Check for large number of classes or functions
                    if len(class_info) > 500 or len(function_names) > 1000:
                        current_node[file_name] = {
                            "type": "file",
                            "content": ["Large file: Content not included"],
                            "classes_count": len(class_info),
                            "functions_count": len(function_names),
                        }
                    else:
                        current_node[file_name] = {
                            "type": "file",
                            "classes": class_info,
                            "functions": function_names,
                        }
                        if include_content:
                            current_node[file_name]["content"] = file_content

            return GetRepoStructureResponse(
                repository_structure=repo_structure,
            )

        except Exception as e:
            error_message = f"An error occurred while generating the repository structure: {str(e)}. Please ensure all paths are correct and you have necessary permissions."
            return GetRepoStructureResponse(
                error_message=error_message,
            )
