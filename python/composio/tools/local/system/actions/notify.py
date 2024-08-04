import subprocess

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class NotifyRequest(BaseModel):
    title: str = Field(
        ...,
        description="Title of the notification. Try to keep it short, max 20 characters. Avoid apostrophes or any other special characters.",
    )
    message: str = Field(
        ...,
        description="Message of the notification. Try to keep it short, max 100 characters. Avoid apostrophes or any other special characters.",
    )


class NotifyResponse(BaseModel):
    pass


class Notify(Action[NotifyRequest, NotifyResponse]):
    """
    Sends a local notification. Only works for MacOS.
    """

    _display_name = "Notify"
    _request_schema = NotifyRequest
    _response_schema = NotifyResponse
    _tags = ["utility"]
    _tool_name = "system"

    def execute(self, request_data: NotifyRequest, authorisation_data: dict) -> dict:
        title = request_data.title
        message = request_data.message
        # Escape single quotes in the title and message
        title = "".join(char for char in title if char.isalnum() or char.isspace())
        message = "".join(char for char in message if char.isalnum() or char.isspace())
        self.logger.info(f"Notifying: {title} - {message}")
        command = [
            "osascript",
            "-e",
            f'display notification "{message}" with title "{title}"',
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            execution_details = {"executed": True}
        except subprocess.CalledProcessError as e:
            execution_details = {
                "executed": False,
                "error": f"Command failed: {e.stderr}",  # type: ignore
            }
        response_data: dict = {}

        return {"execution_details": execution_details, "response_data": response_data}


if __name__ == "__main__":
    print("Notifying...")
    Notify().execute(NotifyRequest(title="Test Title", message="This is Kara"), {})
