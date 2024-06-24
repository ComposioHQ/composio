import os
from pathlib import Path

import chromadb
from IPython.display import Markdown, display
from chromadb.utils.data_loaders import ImageLoader
from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex
from llama_index.vector_stores.chroma import ChromaVectorStore
from pydantic import BaseModel, Field

from composio.core.local import Action


class VectorStoreInputSchema(BaseModel):
    # Define input schema for your action
    # Example:
    # text: str = Field(..., description="Input text for the action")
    images_path: str = Field(..., description="Path to the saved image folder")
    collection_name: str = Field(..., description="Name of the Chroma VectorStore")


class VectorStoreOutputSchema(BaseModel):
    # Define output schema for your action
    # Example:
    result: str = Field(..., description="Result of the action")


class CreateVectorstore(Action):
    """
    Creates Vector Store with Image Embeddings
    """

    _display_name = "Create Vector Store"
    _request_schema = VectorStoreInputSchema
    _response_schema = VectorStoreOutputSchema
    _tags = ["create vector store"]  # Optional tags to categorize your action
    _tool_name = "embedtool"  # Tool name, same as directory name

    def execute(
        self, request_data: VectorStoreInputSchema, authorisation_data: dict = {}
    ) -> dict:
        # Implement logic to process input and return output
        # Example:
        # response_data = {"result": "Processed text: " + request_data.text}
        embedding_function = OpenCLIPEmbeddingFunction()
        image_loader = ImageLoader()

        # create client and a new collection
        chroma_client = chromadb.EphemeralClient()
        chroma_collection = chroma_client.create_collection(
            request_data.collection_name,
            embedding_function=embedding_function,
            data_loader=image_loader,
        )

        # load documents
        documents = SimpleDirectoryReader(request_data.images_path).load_data()

        # set up ChromaVectorStore and load in data
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        index = VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
        )
        return {
            "execution_details": {"executed": True},
            "result": "Vector Store was created with the name:"
            + request_data.collection_name,
        }
