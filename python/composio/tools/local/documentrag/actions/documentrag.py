import base64
import os
import typing as t
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from enum import Enum

import requests
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction

try:
    import fitz  
    from langchain_community.document_loaders import (
        PyMuPDFLoader,
        UnstructuredWordDocumentLoader,
        TextLoader
    )
    from langchain_community.embeddings import OpenAIEmbeddings, HuggingFaceEmbeddings
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_community.vectorstores import FAISS
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False

system_prompt = """You are an expert assistant that retrieves information from documents and provides precise answers based on the context provided. Only answer what's supported by the document context. If the answer is not in the context, say so clearly."""


class EmbeddingModelChoice(str, Enum):
    OPENAI = "openai"
    HUGGINGFACE = "sentence-transformers/all-mpnet-base-v2"
    
    @classmethod
    def default(cls):
        return cls.HUGGINGFACE  


class IndexRequest(BaseModel):
    """Request model for indexing documents."""
    document_paths: List[str] = Field(
        ..., description="List of local file paths or URLs of the documents to be indexed"
    )
    embedding_model: EmbeddingModelChoice = Field(
        default=EmbeddingModelChoice.default(),
        description="Model to use for generating embeddings"
    )
    index_name: str = Field(
        ..., description="Name to identify this collection of documents"
    )


class IndexResponse(BaseModel):
    """Response model for indexing result."""
    success: bool = Field(
        ..., description="Whether the indexing was successful"
    )
    document_count: Optional[int] = Field(
        None, description="Number of documents processed"
    )
    chunk_count: Optional[int] = Field(
        None, description="Number of chunks created"
    )
    index_location: Optional[str] = Field(
        None, description="Location where the index is stored"
    )
    error_message: Optional[str] = Field(
        None, description="Error message if indexing failed"
    )


class QueryRequest(BaseModel):
    """Request model for querying the index."""
    query: str = Field(
        ..., description="Question or query about the documents"
    )
    index_name: str = Field(
        ..., description="Name of the document collection to query"
    )
    embedding_model: EmbeddingModelChoice = Field(
        default=EmbeddingModelChoice.OPENAI,
        description="Model used when creating the index (must match)"
    )
    k: int = Field(
        default=4, description="Number of most relevant chunks to retrieve"
    )


class QueryResponse(BaseModel):
    """Response model for query result."""
    answer: Optional[str] = Field(
        None, description="Answer to the query based on document content"
    )
    sources: Optional[List[str]] = Field(
        None, description="Source documents for the answer"
    )
    error_message: Optional[str] = Field(
        None, description="Error message if query failed"
    )


class RAGProcessor:
    """Processing class for RAG operations."""
    
    def __init__(self):
        if not LANGCHAIN_AVAILABLE:
            raise ImportError(
                "Required packages not available. Please install with: "
                "pip install langchain langchain-community langchain-text-splitters faiss-cpu pymupdf "
                "unstructured openai sentence-transformers"
            )
        
        self.index_dir = Path(os.environ.get("RAG_INDEX_DIR", "~/.composio/rag_indexes")).expanduser()
        self.index_dir.mkdir(parents=True, exist_ok=True)
    
    def get_embedding_model(self, model_choice: EmbeddingModelChoice, api_key: str = None):
        """Get the embedding model based on the choice."""
        if model_choice == EmbeddingModelChoice.OPENAI:
            if not api_key:
                raise ValueError("OpenAI API key is required for OpenAI embeddings")
            return OpenAIEmbeddings(api_key=api_key)
        elif model_choice == EmbeddingModelChoice.HUGGINGFACE:
            return HuggingFaceEmbeddings(model_name=model_choice)
        else:
            raise ValueError(f"Unsupported embedding model: {model_choice}")
    
    def load_document(self, file_path: str) -> List[Any]:
        """Load document based on file type."""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        extension = file_path.suffix.lower()
        
        if extension in ['.pdf']:
            loader = PyMuPDFLoader(str(file_path))
            return loader.load()
        elif extension in ['.docx', '.doc']:
            loader = UnstructuredWordDocumentLoader(str(file_path))
            return loader.load()
        elif extension in ['.txt', '.md', '.json', '.csv']:
            loader = TextLoader(str(file_path))
            return loader.load()
        else:
            raise ValueError(f"Unsupported file type: {extension}")
    
    def process_documents(self, document_paths: List[str]) -> List[Any]:
        """Process multiple documents and return combined documents."""
        all_docs = []
        for path in document_paths:
            if path.startswith(("http://", "https://")):
                response = requests.get(path, timeout=60)
                if response.status_code == 200:
                    temp_path = self.index_dir / f"temp_{Path(path).name}"
                    with open(temp_path, "wb") as f:
                        f.write(response.content)
                    path = str(temp_path)
                else:
                    raise ValueError(f"Failed to download document from {path}")
            
            docs = self.load_document(path)
            all_docs.extend(docs)
        
        return all_docs
    
    def create_index(
        self, 
        document_paths: List[str], 
        embedding_model: EmbeddingModelChoice,
        index_name: str,
        api_key: str = None
    ) -> Dict[str, Any]:
        """Create embeddings and index from documents."""
        documents = self.process_documents(document_paths)
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100
        )
        chunks = text_splitter.split_documents(documents)
        
        embeddings = self.get_embedding_model(embedding_model, api_key)
        vectorstore = FAISS.from_documents(chunks, embeddings)
        
        index_path = self.index_dir / index_name
        vectorstore.save_local(str(index_path))
        
        return {
            "success": True,
            "document_count": len(documents),
            "chunk_count": len(chunks),
            "index_location": str(index_path)
        }
    
    def query_index(
        self,
        query: str,
        index_name: str,
        embedding_model: EmbeddingModelChoice,
        k: int = 4,
        api_key: str = None
    ) -> Dict[str, Any]:
        """Query the index with a question."""
        index_path = self.index_dir / index_name
        if not index_path.exists():
            return {
                "error_message": f"Index '{index_name}' not found"
            }
        
        embeddings = self.get_embedding_model(embedding_model, api_key)
        vectorstore = FAISS.load_local(
        str(index_path),
        embeddings,
        allow_dangerous_deserialization=True  
        )
        
        docs = vectorstore.similarity_search(query, k=k)
        
        context = "\n\n".join([doc.page_content for doc in docs])
        
        sources = [getattr(doc.metadata, 'source', 'Unknown') for doc in docs]
        
        return {
            "context": context,
            "sources": sources
        }


class CreateIndex(LocalAction[IndexRequest, IndexResponse]):
    """Create an index from documents for RAG."""
    
    _tags = ["document", "rag", "indexing"]
    
    def __init__(self):
        super().__init__()
        self.processor = RAGProcessor() if LANGCHAIN_AVAILABLE else None
    
    def execute(self, request: IndexRequest, metadata: Dict) -> IndexResponse:
        """Execute document indexing."""
        if not LANGCHAIN_AVAILABLE:
            return IndexResponse(
                success=False,
                error_message="Required packages not installed. Run: pip install langchain langchain-community langchain-text-splitters faiss-cpu pymupdf unstructured openai sentence-transformers"
            )
        
        validation_result = self._validate_request(request)
        if validation_result:
            return IndexResponse(success=False, error_message=validation_result)
        
        api_key = self._get_api_key(request.embedding_model, metadata)
        if isinstance(api_key, dict) and "error" in api_key:
            return IndexResponse(success=False, error_message=api_key["error"])
        
        try:
            result = self.processor.create_index(
                request.document_paths,
                request.embedding_model,
                request.index_name,
                api_key
            )
            
            return IndexResponse(
                success=True,
                document_count=result["document_count"],
                chunk_count=result["chunk_count"],
                index_location=result["index_location"]
            )
        except Exception as e:
            return IndexResponse(
                success=False,
                error_message=f"Error during indexing: {str(e)}"
            )
    
    def _validate_request(self, request: IndexRequest) -> Optional[str]:
        """Validate the indexing request."""
        if not request.document_paths:
            return "Document paths cannot be empty"
        
        for doc_path in request.document_paths:
            if not doc_path.startswith(("http://", "https://")):
                path = Path(doc_path)
                if not path.exists() or not path.is_file():
                    return f"Document file not found: {doc_path}"
        
        if not request.index_name:
            return "Index name cannot be empty"
        
        return None
    
    def _get_api_key(
        self, model: EmbeddingModelChoice, metadata: dict
    ) -> Union[str, Dict[str, str]]:
        """Get the appropriate API key based on the model."""
        if model == EmbeddingModelChoice.OPENAI:
            key = os.environ.get("OPENAI_API_KEY") or metadata.get("OPENAI_API_KEY")
            key_name = "OPENAI_API_KEY"
            if not key:
                return {"error": f"{key_name} not found for {model}"}
            return key
        
        return None


class QueryIndex(LocalAction[QueryRequest, QueryResponse]):
    """Query a document index using RAG."""
    
    _tags = ["document", "rag", "query"]
    
    def __init__(self):
        super().__init__()
        self.processor = RAGProcessor() if LANGCHAIN_AVAILABLE else None
    
    def execute(self, request: QueryRequest, metadata: Dict) -> QueryResponse:
        """Execute query against the document index."""
        if not LANGCHAIN_AVAILABLE:
            return QueryResponse(
                error_message="Required packages not installed. Run: pip install langchain langchain-community langchain-text-splitters faiss-cpu pymupdf unstructured openai sentence-transformers"
            )
        
        api_key = self._get_api_key(request.embedding_model, metadata)
        if isinstance(api_key, dict) and "error" in api_key:
            return QueryResponse(error_message=api_key["error"])
        
        try:
            result = self.processor.query_index(
                request.query,
                request.index_name,
                request.embedding_model,
                request.k,
                api_key
            )
            
            if "error_message" in result:
                return QueryResponse(error_message=result["error_message"])
            
            llm_response = self._get_llm_response(request.query, result["context"], metadata)
            
            return QueryResponse(
                answer=llm_response,
                sources=result["sources"]
            )
        except Exception as e:
            return QueryResponse(
                error_message=f"Error during query: {str(e)}"
            )
    
    def _get_api_key(
        self, model: EmbeddingModelChoice, metadata: dict
    ) -> Union[str, Dict[str, str]]:
        """Get the appropriate API key based on the model."""
        if model == EmbeddingModelChoice.OPENAI:
            key = os.environ.get("OPENAI_API_KEY") or metadata.get("OPENAI_API_KEY")
            key_name = "OPENAI_API_KEY"
            if not key:
                return {"error": f"{key_name} not found for {model}"}
            return key
        
        return None
    
    def _get_llm_response(self, query: str, context: str, metadata: Dict) -> str:
        """Use an LLM to answer the query based on the context, or fall back to relevant chunks."""
        try:
            # Try to use OpenAI if API key is available
            api_key = os.environ.get("OPENAI_API_KEY") or metadata.get("OPENAI_API_KEY")
            if api_key:
                # For now, fall back to the alternative approach
                raise NotImplementedError("OpenAI integration not yet implemented")
        except Exception as e:
            pass  # Silently fall back
        
        chunks = context.split("\n\n")
        formatted_chunks = "\n\n".join([f"Relevant passage {i+1}:\n{chunk}" for i, chunk in enumerate(chunks[:5])])
        return f"Here are the most relevant passages from your documents:\n\n{formatted_chunks}"