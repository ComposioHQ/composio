from functools import wraps
from typing import Callable, Dict, Optional, TypeVar

from pydantic import BaseModel, Field


class BaseFileRequest(BaseModel):
    file_manager_id: str = Field(
        default="",
        description="ID of the file manager where the file will be opened, if not "
        "provided the recent file manager will be used to execute the action",
    )


class BaseFileResponse(BaseModel):
    error: Optional[str] = Field(
        default=None,
        description="Error message if the action failed",
    )
    current_working_directory: str = Field(
        default="",
        description="Current working directory of the file manager.",
    )


T = TypeVar("T", bound=BaseFileRequest)
R = TypeVar("R", bound=BaseFileResponse)


# TOFIX: Override `Filetool.execute` and get rid of this decorator
def include_cwd(func: Callable[[T, Dict], R]) -> Callable[[T, Dict], R]:
    @wraps(func)
    def wrapper(self, request: T, metadata: Dict) -> R:
        response = func(self, request, metadata)  # type: ignore
        response.current_working_directory = str(
            self.filemanagers.get(request.file_manager_id).working_dir
        )
        return response

    return wrapper  # type: ignore
