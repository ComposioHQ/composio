import os
from pathlib import Path
from typing import Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class DeleteIndexInput(BaseModel):
    index_directory: str = Field(..., description="Directory of the index to delete")


class DeleteIndexOutput(BaseModel):
    message: str = Field(..., description="Result of the delete index action")


class DeleteIndex(Action[DeleteIndexInput, DeleteIndexOutput]):
    """
    Deletes the index for a specified code base.
    """

    _display_name = "Delete index"
    _request_schema: Type[DeleteIndexInput] = DeleteIndexInput
    _response_schema: Type[DeleteIndexOutput] = DeleteIndexOutput
    _tags = ["index"]
    _tool_name = "codeindex"

    def execute(
        self, input_data: DeleteIndexInput, authorisation_data: dict = {}
    ) -> DeleteIndexOutput:
        import chromadb  # pylint: disable=C0415
        from chromadb.errors import ChromaError  # pylint: disable=C0415

        index_storage_path = Path.home() / ".composio" / "index_storage"
        collection_name = Path(input_data.index_directory).name
        status_file = Path(input_data.index_directory) / ".indexing_status.json"

        try:
            # Delete the collection from Chroma
            chroma_client = chromadb.PersistentClient(path=str(index_storage_path))
            chroma_client.delete_collection(name=collection_name)

            # Delete the status file
            if status_file.exists():
                os.remove(status_file)

            return DeleteIndexOutput(
                message=f"Index for {input_data.index_directory} has been successfully deleted."
            )
        except ChromaError as e:
            return DeleteIndexOutput(message=f"Failed to delete index: {str(e)}")
        except Exception as e:
            error_message = str(e)
            return DeleteIndexOutput(
                message="An error occurred while deleting the index"
                + (f": {error_message}" if error_message else "")
            )
