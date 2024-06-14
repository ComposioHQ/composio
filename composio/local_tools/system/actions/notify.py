from pydantic import BaseModel, Field
from composio.core.local import Action
from plyer import notification


class NotifyRequest(BaseModel):
    title: str = Field(..., description="Title of the notification")
    message: str = Field(..., description="Message of the notification")


class NotifyResponse(BaseModel):
    pass


class Notify(Action[NotifyRequest, NotifyResponse]):
    """
    Sends a local notification.
    """

    _display_name = "Notify"
    _request_schema = NotifyRequest
    _response_schema = NotifyResponse
    _tags = ["utility"]
    _tool_name = "system"

    def execute(
        self, request_data: NotifyRequest, authorisation_data: dict
    ) -> dict:
        title = request_data.title
        message = request_data.message
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="Composio Notify"
            )
            execution_details = {"executed": True}
            response_data = {}
        except Exception as e:
            execution_details = {"executed": False, "error": str(e)}
            response_data = {}

        return {"execution_details": execution_details, "response_data": response_data}

if __name__ == "__main__":
    Notify().execute(NotifyRequest(title="Test", message="Test"), {})