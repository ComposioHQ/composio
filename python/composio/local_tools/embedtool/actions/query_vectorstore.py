from pydantic import BaseModel, Field
from composio.core.local import Action
from llama_index.core import VectorStoreIndex, StorageContext
from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
from llama_index.core.indices import MultiModalVectorStoreIndex
from llama_index.core import SimpleDirectoryReader, StorageContext
from chromadb.utils.data_loaders import ImageLoader
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core.schema import ImageNode
from llama_index.core.response.notebook_utils import (
    display_source_node,
    display_image_uris,
)
import chromadb
import os


class QueryInputSchema(BaseModel):
    # Define input schema for your action
    # Example:
    # text: str = Field(..., description="Input text for the action")
    prompt: str = Field(..., description = "Prompt to retrieve the image")
    storename: str = Field(..., description = "The name of the chroma collection")

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
        chroma_client = chromadb.EphemeralClient()
        chroma_collection = chroma_client.get_collection(
            request_data.storename
        )
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        retriever = index.as_retriever(similarity_top_k=2)
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

        display_image_uris(image_results,(3, 3), top_k=3)
        return {"execution_details": {"executed": True}, "result": "images were retrieved","image_results":image_results}
