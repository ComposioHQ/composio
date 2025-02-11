import os
from pathlib import Path
from typing import List, Optional, Type

from pydantic import BaseModel, Field

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.tools.base.local import LocalAction


class CreateVectorStoreInputSchema(BaseModel):
    folder_path: str = Field(..., description="Path to the folder to be indexed")


class CreateVectorStoreOutputSchema(BaseModel):
    result: str = Field(..., description="Result of the action")
    error: Optional[str] = Field(default=None, description="Error message if any")


class CreateImageVectorStore(
    LocalAction[CreateVectorStoreInputSchema, CreateVectorStoreOutputSchema]
):
    """
    Creates Vector Store for all image files in the specified folder
    """

    display_name = "Create Image Vector Store"
    _request_schema: Type[CreateVectorStoreInputSchema] = CreateVectorStoreInputSchema
    _response_schema: Type[CreateVectorStoreOutputSchema] = (
        CreateVectorStoreOutputSchema
    )
    _tags = ["vectorstore", "image", "indexing"]
    _tool_name = "embedtool"

    def find_image_files(self, folder_path: str) -> List[dict]:
        """
        Finds all image files from the specified folder path.
        """
        image_files = []
        for root, _, files in os.walk(folder_path):
            for file in files:
                if file.lower().endswith((".png", ".jpg", ".jpeg", ".gif")):
                    file_path = os.path.join(root, file)
                    image_info = {
                        "content": f"Image file: {file}",
                        "metadata": {"file_path": file_path, "file_type": "image"},
                    }
                    image_files.append(image_info)
        return image_files

    def execute(
        self,
        request: CreateVectorStoreInputSchema,
        metadata: dict,
    ) -> CreateVectorStoreOutputSchema:
        import chromadb  # pylint: disable=C0415
        from chromadb.utils import embedding_functions  # pylint: disable=C0415

        image_collection_name = Path(request.folder_path).name + "_images"
        index_storage_path = LOCAL_CACHE_DIRECTORY / "image_index_storage"
        index_storage_path.mkdir(parents=True, exist_ok=True)

        # Initialize Chroma client
        chroma_client = chromadb.PersistentClient(path=str(index_storage_path))

        # Create embedding function for images
        image_embedding_function = (
            embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="clip-ViT-B-32"
            )
        )

        image_collection = chroma_client.get_or_create_collection(
            name=image_collection_name,
            embedding_function=image_embedding_function,
        )

        # Find image files
        image_files = self.find_image_files(request.folder_path)

        if not image_files:
            return CreateVectorStoreOutputSchema(
                result="",
                error="No image files found in the specified folder.",
            )

        # Add image files to the collection
        for image in image_files:
            image_collection.add(
                documents=[image["content"]],
                metadatas=[image["metadata"]],
                ids=[image["metadata"]["file_path"]],
            )

        return CreateVectorStoreOutputSchema(
            result=f"Image Vector Store created successfully with the name: {image_collection_name}"
        )
