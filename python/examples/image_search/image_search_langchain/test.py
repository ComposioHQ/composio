import chromadb
from chromadb.utils.data_loaders import ImageLoader
from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore
from pydantic import BaseModel, Field


embedding_function = OpenCLIPEmbeddingFunction()
image_loader = ImageLoader()
documents = SimpleDirectoryReader("./images/").load_data()
chroma_client = chromadb.EphemeralClient()
chroma_collection = chroma_client.create_collection(
    "random",
    embedding_function=embedding_function,
    data_loader=image_loader,
)
# set up ChromaVectorStore and load in data
vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_documents(
    documents,
    embed_model=HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5"),
    storage_context=storage_context,
)

print("wprls")
