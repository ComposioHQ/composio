import subprocess

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class NotifyRequest(BaseModel):
    title: str = Field(
        ...,
        description="Title of the notification. Try to keep it short, max 20 characters.",
    )
    message: str = Field(
        ...,
        description="Message of the notification. Try to keep it short, max 100 characters.",
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
        command = (
            f'osascript -e \'display notification "{message}" with title "{title}"\''
        )
        subprocess.run(command, shell=True, check=True)
        execution_details = {"executed": True}
        response_data: dict = {}

        return {"execution_details": execution_details, "response_data": response_data}


if __name__ == "__main__":
    print("Notifying...")
    Notify().execute(
        NotifyRequest(title="Test Title", message="https://composio.dev"), {}
    )
