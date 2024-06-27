import os

import chromadb
from chromadb.utils.data_loaders import ImageLoader
from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
from llama_index.core import (
    Settings,
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
)
from llama_index.core.indices import MultiModalVectorStoreIndex
from llama_index.core.response.notebook_utils import (
    display_image_uris,
    display_source_node,
)
from llama_index.core.schema import ImageNode
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore
from pydantic import BaseModel, Field

from composio.core.local import Action


class QueryInputSchema(BaseModel):
    # Define input schema for your action
    # Example:
    # text: str = Field(..., description="Input text for the action")
    prompt: str = Field(..., description="Prompt to retrieve the image")
    storename: str = Field(..., description="The name of the chroma collection")
    collection_path: str = Field(..., description="The path inside the db created")


class QueryOutputSchema(BaseModel):
    # Define output schema for your action
    # Example:
    # result: str = Field(..., description="Result of the action")
    result: str = Field(..., description="Image list")


class QueryVectorstore(Action):
    """
    Query Vector Store for images
    """

    _display_name = "Query Vector Store"
    _request_schema = QueryInputSchema
    _response_schema = QueryOutputSchema
    _tags = ["queryimageembed"]  # Optional tags to categorize your action
    _tool_name = "embedtool"  # Tool name, same as directory name

    def execute(
        self, request_data: QueryInputSchema, authorisation_data: dict = {}
    ) -> dict:
        # Implement logic to process input and return output
        # Example:
        # response_data = {"result": "Processed text: " + request_data.text}
        embedding_function = OpenCLIPEmbeddingFunction()
        image_loader = ImageLoader()
        chroma_client = chromadb.PersistentClient(path=request_data.collection_path)
        chroma_collection = chroma_client.get_collection(request_data.storename)
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)

        storage_context = StorageContext.from_defaults(
            vector_store=vector_store, persist_dir=request_data.collection_path
        )
        index = VectorStoreIndex(
            [],
            embed_model=HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5"),
            storage_context=storage_context,
        )
        retriever = index.as_retriever(similarity_top_k=3)
        retrieval_results = retriever.retrieve(request_data.prompt)
        image_results = []
        MAX_RES = 5
        cnt = 0
        for r in retrieval_results:
            if isinstance(r.node, ImageNode):
                image_results.append(r.node.metadata["file_path"])
            else:
                if cnt < MAX_RES:
                    display_source_node(r)
                cnt += 1

        display_image_uris(image_results, (3, 3), top_k=3)
        return {
            "execution_details": {"executed": True},
            "result": "images were retrieved",
            "image_results": image_results,
        }
