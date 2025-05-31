# In document_rag_tool.py
import os
import uuid  
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from composio.tools.base.local import LocalAction, LocalTool
from dotenv import load_dotenv
import tempfile
from pathlib import Path
import datetime 

load_dotenv()


class DocumentCollection(BaseModel):
    id: str
    name: str
    timestamp: str
    description: Optional[str] = None


class DocumentUploadRequest(BaseModel):
    file_path: str = Field(
        ..., 
        description="Path to the document or folder to be processed",
        json_schema_extra={"file_readable": True}
    )
    collection_name: Optional[str] = Field(
        None, 
        description="Name for this document collection. If not provided, a name will be auto-generated."
    )
    collection_description: Optional[str] = Field(
        None,
        description="Optional description for this document collection"
    )
    create_new_collection: bool = Field(
        False,
        description="If true, creates a new collection even if the name already exists"
    )
    
class DocumentUploadResponse(BaseModel):
    status: str = Field(..., description="Status of the document processing")
    message: str = Field(..., description="Information about the processing")
    collection_id: Optional[str] = Field(None, description="ID of the collection this document was added to")
    collection_name: Optional[str] = Field(None, description="Name of the collection this document was added to")

class UploadDocument(LocalAction[DocumentUploadRequest, DocumentUploadResponse]):
    """Tool for uploading and processing documents (PDF, DOC, TXT, etc.)"""
    
    _tags = ["Document Upload", "RAG"]
    
    def execute(self, request: DocumentUploadRequest, metadata: Dict) -> DocumentUploadResponse:
        """Process the uploaded document and add it to the knowledge base"""
        try:
            from langchain_community.document_loaders import (
                TextLoader, PyPDFLoader, Docx2txtLoader, CSVLoader, DirectoryLoader
            )
            from langchain_community.vectorstores import Chroma
            from langchain_openai import OpenAIEmbeddings
            from langchain_text_splitters import RecursiveCharacterTextSplitter
            import json
            
            file_path = request.file_path
            path = Path(file_path)
            
            if not path.exists():
                return DocumentUploadResponse(
                    status="failed", 
                    message=f"File or folder not found: {file_path}",
                    collection_id=None,
                    collection_name=None
                )
            
            # Initialize embeddings
            embeddings = OpenAIEmbeddings()
            
            # Database path
            db_path = os.path.join(tempfile.gettempdir(), "langchain_rag_db")
            
            # Collections management
            collections_path = os.path.join(db_path, "collections.json")
            collections = []
            
            # Create a new collection or use existing one
            collection_name = request.collection_name or f"Collection-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
            collection_id = str(uuid.uuid4())
            
            # Load existing collections if file exists
            if os.path.exists(collections_path):
                with open(collections_path, "r") as f:
                    collections = json.load(f)
                    
                # Check if collection name already exists
                if not request.create_new_collection:
                    for coll in collections:
                        if coll["name"] == collection_name:
                            collection_id = coll["id"]
                            break
            
            # Prepare document metadata
            collection_metadata = {
                "collection_id": collection_id,
                "collection_name": collection_name,
                "upload_date": datetime.datetime.now().isoformat()
            }
            
            # Process files
            docs = []
            
            if path.is_dir():
                # Process all files in the directory
                loaders = []
                processed_files = []
                
                for file in path.glob("*"):
                    if file.suffix.lower() == '.txt':
                        loaders.append(TextLoader(str(file)))
                        processed_files.append(str(file.name))
                    elif file.suffix.lower() == '.pdf':
                        loaders.append(PyPDFLoader(str(file)))
                        processed_files.append(str(file.name))
                    elif file.suffix.lower() in ['.docx', '.doc']:
                        loaders.append(Docx2txtLoader(str(file)))
                        processed_files.append(str(file.name))
                    elif file.suffix.lower() == '.csv':
                        loaders.append(CSVLoader(str(file)))
                        processed_files.append(str(file.name))
                
                if not loaders:
                    return DocumentUploadResponse(
                        status="failed",
                        message="No supported documents found in the folder",
                        collection_id=None,
                        collection_name=None
                    )
                
                # Load all documents
                for i, loader in enumerate(loaders):
                    file_docs = loader.load()
                    # Add metadata to each document
                    for doc in file_docs:
                        doc.metadata.update(collection_metadata)
                        doc.metadata["source"] = processed_files[i]
                    docs.extend(file_docs)
                
            else:
                # Process a single file
                file_extension = path.suffix.lower()
                
                if file_extension == '.txt':
                    loader = TextLoader(file_path)
                elif file_extension == '.pdf':
                    loader = PyPDFLoader(file_path)
                elif file_extension in ['.docx', '.doc']:
                    loader = Docx2txtLoader(file_path)
                elif file_extension == '.csv':
                    loader = CSVLoader(file_path)
                else:
                    return DocumentUploadResponse(
                        status="failed",
                        message=f"Unsupported file format: {file_extension}. Supported formats: .txt, .pdf, .docx, .doc, .csv",
                        collection_id=None,
                        collection_name=None
                    )
                
                file_docs = loader.load()
                for doc in file_docs:
                    doc.metadata.update(collection_metadata)
                    doc.metadata["source"] = path.name
                docs.extend(file_docs)
            
            # Split documents into chunks
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            splits = text_splitter.split_documents(docs)
            
            # Store in vector database
            vectorstore = Chroma.from_documents(
                documents=splits, 
                embedding=embeddings,
                persist_directory=db_path,
                collection_name=collection_id  # Use collection_id as collection name in Chroma
            )
            vectorstore.persist()
            
            # Update collections list
            new_collection = {
                "id": collection_id,
                "name": collection_name,
                "description": request.collection_description,
                "timestamp": datetime.datetime.now().isoformat(),
                "file_count": len(docs) if path.is_file() else len(processed_files)
            }
            
            # Only add if not already in the collections list
            if not any(c["id"] == collection_id for c in collections):
                collections.append(new_collection)
            
            # Save collections to JSON file
            os.makedirs(os.path.dirname(collections_path), exist_ok=True)
            with open(collections_path, "w") as f:
                json.dump(collections, f)
            
            return DocumentUploadResponse(
                status="success",
                message=f"Successfully processed documents and stored in collection '{collection_name}'",
                collection_id=collection_id,
                collection_name=collection_name
            )
                    
        except Exception as e:
            return DocumentUploadResponse(
                status="failed",
                message=f"Error processing document: {str(e)}",
                collection_id=None,
                collection_name=None
            )


class DocumentQueryRequest(BaseModel):
    query: str = Field(..., description="The question to ask about the uploaded document(s)")
    collection_id: Optional[str] = Field(
        None, 
        description="Optional ID of the collection to search. If not provided, searches all collections."
    )
    collection_name: Optional[str] = Field(
        None,
        description="Optional name of the collection to search. If both ID and name provided, ID takes precedence."
    )

class DocumentQueryResponse(BaseModel):
    response: str = Field(..., description="The answer to the query based on the document content")
    sources: List[str] = Field(default_factory=list, description="Sources of the information")
    collection_searched: Optional[str] = Field(None, description="The collection(s) that were searched")

class QueryDocument(LocalAction[DocumentQueryRequest, DocumentQueryResponse]):
    """Tool for querying uploaded documents in the knowledge base"""
    
    _tags = ["Document Query", "RAG"]
    
    def execute(self, request: DocumentQueryRequest, metadata: Dict) -> DocumentQueryResponse:
        """Query the document knowledge base and return the response"""
        try:
            from langchain_community.vectorstores import Chroma
            from langchain_openai import OpenAIEmbeddings, ChatOpenAI
            from langchain.chains import RetrievalQA
            import os
            import tempfile
            import json
            
            # Path to the Chroma DB
            db_path = os.path.join(tempfile.gettempdir(), "langchain_rag_db")
            collections_path = os.path.join(db_path, "collections.json")
            
            if not os.path.exists(db_path):
                return DocumentQueryResponse(
                    response="No documents have been uploaded yet. Please upload documents first.",
                    sources=[],
                    collection_searched=None
                )
            
            # Initialize embeddings
            embeddings = OpenAIEmbeddings()
            
            # Determine which collection to search
            collection_id = None
            collection_name = "all collections"
            
            if os.path.exists(collections_path):
                with open(collections_path, "r") as f:
                    collections = json.load(f)
                
                if request.collection_id:
                    # Search by ID
                    collection_id = request.collection_id
                    for coll in collections:
                        if coll["id"] == collection_id:
                            collection_name = coll["name"]
                            break
                elif request.collection_name:
                    # Search by name
                    for coll in collections:
                        if coll["name"] == request.collection_name:
                            collection_id = coll["id"]
                            collection_name = coll["name"]
                            break
            
            # Get retriever based on collection
            if collection_id:
                try:
                    vectorstore = Chroma(
                        persist_directory=db_path,
                        embedding_function=embeddings,
                        collection_name=collection_id
                    )
                    retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
                except Exception as e:
                    return DocumentQueryResponse(
                        response=f"Could not find the specified collection: {str(e)}",
                        sources=[],
                        collection_searched=collection_name
                    )
            else:
                # If no specific collection, search all documents
                vectorstore = Chroma(persist_directory=db_path, embedding_function=embeddings)
                retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
            
            # Get the docs that match the query
            retrieved_docs = retriever.get_relevant_documents(request.query)
            
            # If no relevant docs found
            if not retrieved_docs:
                return DocumentQueryResponse(
                    response=f"No relevant information found in {collection_name}.",
                    sources=[],
                    collection_searched=collection_name
                )
            
            # Create source list with enhanced metadata
            sources = []
            for doc in retrieved_docs:
                source = doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
                metadata = doc.metadata
                
                # Add more detailed source information
                source_file = metadata.get('source', 'Unknown')
                collection_name = metadata.get('collection_name', 'Unknown collection')
                upload_date = metadata.get('upload_date', 'Unknown date')
                
                source_info = f"Source: {source_file} (Collection: {collection_name}, Uploaded: {upload_date})"
                sources.append(f"{source_info}\n{source}")
            
            # Create a QA chain
            llm = ChatOpenAI(model="gpt-4.1-nano")
            qa_chain = RetrievalQA.from_chain_type(
                llm=llm,
                chain_type="stuff",
                retriever=retriever,
                return_source_documents=True
            )
            
            # Get response
            result = qa_chain({"query": request.query})
            response = result["result"]
            
            return DocumentQueryResponse(
                response=response,
                sources=sources,
                collection_searched=collection_name
            )
            
        except Exception as e:
            return DocumentQueryResponse(
                response=f"Error querying document: {str(e)}",
                sources=[],
                collection_searched=None
            )