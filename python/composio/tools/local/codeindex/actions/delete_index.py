import os
from pathlib import Path

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class DeleteIndexInput(BaseModel):
    index_directory: str = Field(..., description="Directory of the index to delete")


class DeleteIndexOutput(BaseModel):
    message: str = Field(..., description="Result of the delete index action")


class DeleteIndex(LocalAction[DeleteIndexInput, DeleteIndexOutput]):
    """
    Deletes the index for a specified code base.
    """

    _tags = ["index"]

    display_name = "Delete index"

    def execute(
        self,
        request: DeleteIndexInput,
        metadata: dict = {},
    ) -> DeleteIndexOutput:
        import chromadb  # pylint: disable=C0415
        from chromadb.errors import ChromaError  # pylint: disable=C0415

        index_storage_path = Path.home() / ".composio" / "index_storage"
        collection_name = Path(request.index_directory).name
        status_file = Path(request.index_directory) / ".indexing_status.json"

        try:
            # Delete the collection from Chroma
            chroma_client = chromadb.PersistentClient(path=str(index_storage_path))
            chroma_client.delete_collection(name=collection_name)

            # Delete the status file
            if status_file.exists():
                os.remove(status_file)

            return DeleteIndexOutput(
                message=f"Index for {request.index_directory} has been successfully deleted."
            )
        except ChromaError as e:
            return DeleteIndexOutput(message=f"Failed to delete index: {str(e)}")
        except Exception as e:
            error_message = str(e)
            return DeleteIndexOutput(
                message="An error occurred while deleting the index"
                + (f": {error_message}" if error_message else "")
            )
