from typing import Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeindex.actions.create_index import CreateIndex


class IndexStatusInput(BaseModel):
    directory_path: str = Field(..., description="Directory to check indexing status")


class IndexStatusOutput(BaseModel):
    status: str = Field(..., description="Status of the indexing process")
    error: str = Field(default=None, description="Error message if indexing failed")


class IndexStatus(LocalAction[IndexStatusInput, IndexStatusOutput]):
    """
    Checks the status of the indexing process for a given directory.
    """

    display_name = "Check Index Status"
    _request_schema: Type[IndexStatusInput] = IndexStatusInput
    _response_schema: Type[IndexStatusOutput] = IndexStatusOutput
    _tags = ["index"]
    _tool_name = "codeindex"

    def execute(
        self, input_data: IndexStatusInput, metadata: dict = {}
    ) -> IndexStatusOutput:
        create_index = CreateIndex()
        status_data = create_index.check_status(input_data.directory_path)

        output = IndexStatusOutput(status=status_data.get("status", "unknown"))
        if error := status_data.get("error"):
            output.error = error

        return output
