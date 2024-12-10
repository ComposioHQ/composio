import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateTaskAttachmentRequest(BaseModel):
    """Request schema for `CreateTaskAttachment`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            'If you want to reference a task by it"s custom task id, this value must '
            "be `true`. "
        ),
    )
    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description=(
            "Only used when the `custom_task_ids` parameter is set to `true`.   For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )


class CreateTaskAttachmentResponse(BaseModel):
    """Response schema for `CreateTaskAttachment`"""

    data: t.Dict[str, t.Any]


class CreateTaskAttachment(OpenAPIAction):
    """
    Upload a file to a task as an attachment.    ***Note:** This request uses
    multipart/form-data as the content type.*
    """

    _tags = ["Attachments"]
    _display_name = "create_task_attachment"
    _request_schema = CreateTaskAttachmentRequest
    _response_schema = CreateTaskAttachmentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/attachment"
    method = "post"
    operation_id = "Attachments_uploadFileToTaskAsAttachment"
    action_identifier = "/task/{task_id}/attachment_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}


class attachments_upload_file_to_task_as_attachment(OpenAPIAction):
    """
    Upload a file to a task as an attachment.    ***Note:** This request uses
    multipart/form-data as the content type.*<<DEPRECATED use create_task_attachment>>
    """

    _tags = ["Attachments"]
    _display_name = "attachments_upload_file_to_task_as_attachment"
    _request_schema = CreateTaskAttachmentRequest
    _response_schema = CreateTaskAttachmentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/attachment"
    method = "post"
    operation_id = "Attachments_uploadFileToTaskAsAttachment"
    action_identifier = "/task/{task_id}/attachment_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
