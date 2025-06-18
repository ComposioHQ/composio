# RAGFlow Tool

The RAGFlow tool enables agents to generate embeddings from documents (PDFs, DOCs, etc.) and query them using natural language questions. It integrates with RAGFlow's API to provide document-based question answering capabilities.

## Features

- **Create Dataset**: Create a new dataset to organize your documents
- **Upload Document**: Upload PDF, DOC, or other supported document formats
- **Start Processing**: Begin chunking and embedding generation for uploaded documents
- **Query Documents**: Ask questions about your documents and get relevant answers

## Prerequisites

1. A running RAGFlow server instance
2. RAGFlow API key
3. Python `requests` library

## Usage

### 1. Create a Dataset

```python
from composio import ComposioToolSet
from composio.tools.local.ragflowtool import RAGFlowTool

toolset = ComposioToolSet()

# Create a dataset
result = toolset.execute_action(
    "CreateDataset",
    {
        "name": "my_documents",
        "ragflow_server": "http://localhost:8080",
        "api_key": "your_api_key_here"
    }
)

dataset_id = result["dataset_id"]
```

### 2. Upload Documents

```python
# Upload a document
result = toolset.execute_action(
    "UploadDocument",
    {
        "dataset_id": dataset_id,
        "file_path": "/path/to/your/document.pdf",
        "ragflow_server": "http://localhost:8080",
        "api_key": "your_api_key_here"
    }
)
```

### 3. Start Processing

```python
# Start processing (chunking and embedding generation)
# Note: You need the document_id from the upload step
result = toolset.execute_action(
    "StartProcessing",
    {
        "dataset_id": dataset_id,
        "document_id": document_id,  # obtained from upload step
        "ragflow_server": "http://localhost:8080",
        "api_key": "your_api_key_here"
    }
)
```

### 4. Query Documents

```python
# Query the documents
result = toolset.execute_action(
    "QueryDocuments",
    {
        "dataset_id": dataset_id,
        "question": "What is the main topic of this document?",
        "ragflow_server": "http://localhost:8080",
        "api_key": "your_api_key_here",
        "top_k": 3  # optional, defaults to 3
    }
)

print(f"Answer: {result['answer']}")
print(f"Relevant chunks: {len(result['relevant_chunks'])}")
```

## Complete Example

```python
from composio import ComposioToolSet

toolset = ComposioToolSet()

# Configuration
ragflow_server = "http://localhost:8080"
api_key = "your_api_key_here"
document_path = "/path/to/your/document.pdf"

# 1. Create dataset
dataset_result = toolset.execute_action(
    "CreateDataset",
    {
        "name": "research_papers",
        "ragflow_server": ragflow_server,
        "api_key": api_key
    }
)

if dataset_result["success"]:
    dataset_id = dataset_result["dataset_id"]
    print(f"Created dataset: {dataset_id}")
    
    # 2. Upload document
    upload_result = toolset.execute_action(
        "UploadDocument",
        {
            "dataset_id": dataset_id,
            "file_path": document_path,
            "ragflow_server": ragflow_server,
            "api_key": api_key
        }
    )
    
    if upload_result["success"]:
        document_id = upload_result["document_id"]
        print("Document uploaded successfully")
        
        # 3. Start processing
        process_result = toolset.execute_action(
            "StartProcessing",
            {
                "dataset_id": dataset_id,
                "document_id": document_id,
                "ragflow_server": ragflow_server,
                "api_key": api_key
            }
        )
        
        if process_result["success"]:
            print("Processing started successfully")
            
            # Wait for processing to complete (you may need to add polling logic)
            import time
            time.sleep(30)  # Wait for processing
            
            # 4. Query documents
            query_result = toolset.execute_action(
                "QueryDocuments",
                {
                    "dataset_id": dataset_id,
                    "question": "What are the key findings in this research?",
                    "ragflow_server": ragflow_server,
                    "api_key": api_key
                }
            )
            
            if query_result["success"]:
                print(f"Answer: {query_result['answer']}")
                print(f"Found {len(query_result['relevant_chunks'])} relevant chunks")
            else:
                print(f"Query failed: {query_result['message']}")
```

## Error Handling

All actions return a `success` boolean field and a `message` field. Always check the `success` field before proceeding with subsequent operations.

## Notes

- Processing time depends on document size and server resources
- Large documents may take several minutes to process
- The tool requires network access to the RAGFlow server
- Ensure your RAGFlow server is properly configured with embedding models 