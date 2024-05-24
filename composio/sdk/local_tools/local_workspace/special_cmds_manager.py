from typing import List, Optional
import requests
from pydantic import BaseModel, Field


class EditFileRequest(BaseModel):
    shell_id: str = Field(
        ..., description="The identifier of the shell where the file edit will occur."
    )
    start_line: int = Field(
        ..., description="The line number at which the file edit will start."
    )
    end_line: int = Field(
        ..., description="The line number at which the file edit will end (inclusive)."
    )
    replacement_text: str = Field(
        ...,
        description="The text that will replace the specified line range in the file.",
    )


class EditFileResponse(BaseModel):
    success: bool = Field(
        ...,
        description="True if the file lines were successfully replaced; otherwise, False.",
    )
    output: str = Field(
        ..., description="Any output or errors that occurred during the file edit."
    )


class EditFileAction:
    """
    replaces lines <start_line> through <end_line> (inclusive) with the given text in the open file.
    The replacement text is terminated by a line with only end_of_edit on it.
    All of the <replacement text> will be entered, so make sure your indentation is formatted properly.
    Python files will be checked for syntax errors after the edit.
    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message and modify the edit command you issue accordingly.
    Issuing the same command a second time will just lead to the same error message again.
    """

    @property
    def display_name(self) -> str:
        return "Edit File Action"

    @property
    def request_schema(self) -> BaseModel:
        return EditFileRequest

    @property
    def response_schema(self) -> BaseModel:
        return EditFileResponse

    def execute(self, req: EditFileRequest, authorisation_data: dict):
        # Send the initial edit command
        command = f"edit {req.start_line}:{req.end_line}\n"
        command += "\n".join(req.replacement_text.split("\n")) + "\n"
        command += "end_of_edit\n"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)
        output = resp.get("result", "")
        return {
            "execution_details": {"executed": True},
            "result": EditFileResponse(success=True, output=output).json(),
        }


class GotoLineRequest(BaseModel):
    shell_id: str = Field(..., description="The identifier of the shell session.")
    line_number: int = Field(
        ..., description="The line number to which the view should be moved."
    )


class GotoLineResponse(BaseModel):
    success: bool = Field(
        ...,
        description="True if the view was successfully moved to the specified line number; otherwise, False.",
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the operation."
    )
    output: str = Field(
        ..., description="Any output that occurred during the operation."
    )


class GotoLineAction(Action):
    """
    Moves the view to a specified line number in an open file within a shell session.
    Example:
        - To move the view, provide the shell ID and the line number. The response will indicate whether the operation was successful and include any output or errors.
    """

    @property
    def display_name(self) -> str:
        return "Goto Line Action"

    @property
    def request_schema(self) -> BaseModel:
        return GotoLineRequest

    @property
    def response_schema(self) -> BaseModel:
        return GotoLineResponse

    def execute(self, req: GotoLineRequest, authorisation_data: dict):
        command = f"goto {req.line_number}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)
        return GotoLineResponse(success=True, errors="", output=resp.get("result", ""))


class OpenFileRequest(BaseModel):
    shell_id: str = Field(
        ...,
        description="The identifier of the shell session where the file will be opened.",
    )
    file_name: str = Field(..., description="The name of the file to be opened.")
    line_number: str = Field(
        default=1, description="The line number to display after opening the file."
    )


class OpenFileResponse(BaseModel):
    success: bool = Field(
        ..., description="True if the file was successfully opened; otherwise, False."
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the file opening process."
    )
    output: str = Field(..., description="The output from the file opening process.")


class OpenFileAction(Action):
    """
    Opens a specified file in a shell session and optionally moves the view to a specified line number.
    Example:
        - To open a file, provide the shell ID, file name, and an optional line number. The response will indicate whether the file was opened successfully and list any errors.
    """

    @property
    def display_name(self) -> str:
        return "Open File Action"

    @property
    def request_schema(self) -> BaseModel:
        return OpenFileRequest

    @property
    def response_schema(self) -> BaseModel:
        return OpenFileResponse

    def execute(self, req: OpenFileRequest, authorisation_data: dict):
        command = f"open {req.file_name} {req.line_number}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)
        output = resp.get("result", "")
        return {
            "execution_details": {"executed": True},
            "response": OpenFileResponse(success=True, errors="", output=output).json(),
        }


class ScrollRequest(BaseModel):
    shell_id: str = Field(..., description="The identifier of the shell session.")
    direction: str = Field(
        ...,
        description="The direction to scroll within the shell session, either 'up' or 'down'.",
    )


class ScrollResponse(BaseModel):
    success: bool = Field(
        ...,
        description="True if the scroll operation was successful; otherwise, False.",
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the scroll operation."
    )
    output: str = Field(..., description="The output from the scroll operation.")


class ScrollAction(Action):
    """
    Scrolls the view within a shell session either up or down.
    Example:
        - To scroll the view, provide the shell ID and the direction ('up' or 'down'). The response will indicate whether the scroll was successful and list any errors.
    """

    @property
    def display_name(self) -> str:
        return "Scroll Action"

    @property
    def request_schema(self) -> BaseModel:
        return ScrollRequest

    @property
    def response_schema(self) -> BaseModel:
        return ScrollResponse

    def execute(self, req: ScrollRequest, authorisation_data: dict):
        command = f"scroll_{req.direction}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)

        return {
            "response": ScrollResponse(
                success=True, errors="", output=resp.get("result", "")
            ).json()
        }


class CreateFileRequest(BaseModel):
    shell_id: str = Field(
        ...,
        description="The identifier of the shell session where the file will be created.",
    )
    file_name: str = Field(
        ...,
        description="The name of the new file to be created within the shell session.",
    )


class CreateFileResponse(BaseModel):
    success: bool = Field(
        ..., description="True if the file was successfully created; otherwise, False."
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the file creation process."
    )
    output: str = Field(..., description="The output from the file creation process.")


class CreateFileAction(Action):
    """
    Creates a new file within a shell session.
    Example:
        - To create a file, provide the shell ID and the name of the new file. The response will indicate whether the file was created successfully and list any errors.
    """

    @property
    def display_name(self) -> str:
        return "Create File Action"

    @property
    def request_schema(self) -> BaseModel:
        return CreateFileRequest

    @property
    def response_schema(self) -> BaseModel:
        return CreateFileResponse

    def execute(self, req: CreateFileRequest, authorisation_data: dict):
        command = f"create {req.file_name}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)

        return {
            "execution_details": {"executed": True},
            "result": CreateFileResponse(
                success=True, errors="", output=resp.get("result", "")
            ).json(),
        }


class FindFileRequest(BaseModel):
    file_name: str = Field(
        ...,
        description="The name of the file to be searched for within the specified directory or the current directory if none is specified.",
    )
    dir: str = Field(
        default=None,
        description="The directory within which to search for the file. If not provided, the search will default to the current directory.",
    )
    shell_id: str = Field(
        ..., description="The identifier of the shell session used for the file search."
    )


class FindFileResponse(BaseModel):
    success: bool = Field(
        ..., description="True if the file search was successful; otherwise, False."
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the file search process."
    )
    output: str = Field(..., description="The output resulting from the file search.")


class FindFileAction(Action):
    """
    Searches for files by name within a specified directory or the current directory if none is specified.
    Example:
        - To find a file, provide the shell ID, the file name, and optionally a directory. The response will list any files found and indicate whether the search was successful.
    """

    @property
    def display_name(self) -> str:
        return "Find File Action"

    @property
    def request_schema(self) -> BaseModel:
        return FindFileRequest

    @property
    def response_schema(self) -> BaseModel:
        return FindFileResponse

    def execute(self, req: FindFileRequest, authorisation_data: dict):
        directory = req.dir if req.dir else "./"
        command = f"find_file {req.file_name} {directory}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)

        return {
            "execution_details": {"executed": True},
            "result": FindFileResponse(
                success=True, output=resp.get("result", {}), errors=""
            ).json(),
        }


class SearchFileRequest(BaseModel):
    shell_id: str = Field(
        ..., description="The identifier of the shell session used for the file search."
    )
    search_term: str = Field(
        ...,
        description="The term to be searched for within the specified file or the current open file if none is specified.",
    )
    file: str = Field(
        None,
        description="The specific file within which to search for the term. If not provided, the search will default to the current open file.",
    )


class SearchFileResponse(BaseModel):
    success: bool = Field(
        ..., description="True if the search was successful; otherwise, False."
    )
    output: str = Field(
        ...,
        description="A list of lines containing the search term found during the file search.",
    )
    errors: str = Field(
        ..., description="Any errors that occurred during the file search process."
    )


class SearchFileAction(Action):
    """
    Searches for a specified term within a specified file or the current open file if none is specified.
    Example:
        - To search within a file, provide the shell ID, the search term, and optionally a specific file. The response will list any matching lines and indicate whether the search was successful.
    """

    @property
    def display_name(self) -> str:
        return "Search File Action"

    @property
    def request_schema(self) -> BaseModel:
        return SearchFileRequest

    @property
    def response_schema(self) -> BaseModel:
        return SearchFileResponse

    def execute(self, req: SearchFileRequest, authorisation_data: dict):
        command = f"search_file {req.search_term} {req.file}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        resp = run_command_action.execute(run_command_request, authorisation_data)

        return {
            "execution_details": {"executed": True},
            "result": SearchFileResponse(
                success=True, errors="", output=resp.get("result", "")
            ).json(),
        }


class SearchDirRequest(BaseModel):
    shell_id: str = Field(..., description="The ID of the shell to use for searching")
    search_term: str = Field(..., description="The term to search for")
    dir: Optional[str] = Field(
        None,
        description="The directory to search in (if not provided, searches in the current directory)",
    )


class SearchDirResponse(BaseModel):
    success: bool = Field(
        ..., description="Indicates whether the search was successful"
    )
    output: str = Field(
        ..., description="List of matching files and their match counts"
    )
    errors: str = Field(..., description="The errors that occurred during the search")


class SearchDirAction(Action):
    """
    Searches for search_term in all files in dir. If dir is not provided, searches in the current directory.
    """

    @property
    def display_name(self) -> str:
        return "Search Directory Action"

    @property
    def request_schema(self) -> BaseModel:
        return SearchDirRequest

    @property
    def response_schema(self) -> BaseModel:
        return SearchDirResponse

    def execute(self, req: SearchDirRequest, authorisation_data: dict):
        command = f"search_dir {req.search_term} {req.dir}"
        run_command_request = RunCommandRequest(shell_id=req.shell_id, command=command)
        run_command_action = RunCommandAction()
        run_command_response = run_command_action.execute(
            run_command_request, authorisation_data
        )
        resp = run_command_response
        return {
            "execution_details": {"executed": True},
            "result": SearchDirResponse(
                success=True, errors="", output=resp.get("result", "")
            ).json(),
        }


class GitSSHKeyRequest(BaseModel):
    shell_id: str = Field(
        ..., description="The ID of the shell to use for adding the SSH key"
    )
    email: str = Field(
        default="dev@composio.dev",
        description="The email address associated with the SSH key",
    )
    name: str = Field(
        default="composiodev",
        description="The name of the user for whom the SSH key is being added",
    )


class GitSSHKeyResponse(BaseModel):
    success: bool = Field(
        ..., description="Indicates whether the SSH key was added successfully"
    )
    output: Optional[str] = Field(
        None,
        description="The public part of the SSH key to be added to GitHub or any errors that occurred during the operation",
    )


class GithubSSHKeyAction(Action):
    """
    Generates an SSH key in the specified shell, adds it to the system, and returns the public key in the output.
    """

    @property
    def display_name(self) -> str:
        return "GitHub SSH Key Action"

    @property
    def request_schema(self) -> BaseModel:
        return GitSSHKeyRequest

    @property
    def response_schema(self) -> BaseModel:
        return GitSSHKeyResponse

    def execute(self, req: GitSSHKeyRequest, authorisation_data: dict):
        pid = int(req.shell_id)
        url, key = get_api_and_url(str(pid))
        headers = {"x-api-key": key}
        timeout = 300  # default timeout

        # call the url endpoint.
        response = requests.post(
            url,
            headers=headers,
            json={"email": req.email, "name": req.name},
            timeout=timeout,
        )
        if response.status_code == 200:
            return {
                "execution_details": {"executed": True},
                "response_data": GitSSHKeyResponse(
                    success=True, output=response.text
                ).json(),
            }
        else:
            return {
                "execution_details": {"executed": False},
                "response_data": GitSSHKeyResponse(
                    success=False, output=response.text
                ).json(),
            }
