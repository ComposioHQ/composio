import subprocess

from pydantic import BaseModel, Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction


class NotifyRequest(BaseModel):
    title: str = Field(
        ...,
        description=(
            "Title of the notification. Try to keep it short, max 20 characters. "
            "Avoid apostrophes or any other special characters."
        ),
    )
    message: str = Field(
        ...,
        description=(
            "Message of the notification. Try to keep it short, max 100 "
            "characters. Avoid apostrophes or any other special characters."
        ),
    )


class NotifyResponse(BaseModel):
    pass


class Notify(LocalAction[NotifyRequest, NotifyResponse]):
    """
    Sends a local notification. Only works for MacOS.
    """

    _tags = ["utility"]
    display_name = "Notify"

    def execute(self, request: NotifyRequest, metadata: dict) -> NotifyResponse:
        # Escape single quotes in the title and message
        title = "".join(
            char for char in request.title if char.isalnum() or char.isspace()
        )
        message = "".join(
            char for char in request.message if char.isalnum() or char.isspace()
        )
        self.logger.info(f"Notifying: {title} - {message}")
        command = [
            "osascript",
            "-e",
            f'display notification "{message}" with title "{title}"',
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            return NotifyResponse()
        except subprocess.CalledProcessError as e:
            raise ExecutionFailed(message=f"Command failed: {e.stderr}") from e
