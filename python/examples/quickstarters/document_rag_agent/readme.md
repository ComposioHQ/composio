Document RAG Tool
=================

A powerful document retrieval and question-answering system using LangChain, ChromaDB, and OpenAI embeddings. This tool allows you to upload documents (PDFs, DOC/DOCX, TXT, CSV) and query them using natural language.

Features
--------

-   Upload documents individually or in folders
-   Support for multiple file formats (PDF, DOC/DOCX, TXT, CSV)
-   Organize documents into collections
-   Smart query processing with automatic complexity detection
-   Direct querying for speed or agent-based for complex reasoning

Installation
------------

1.  Run the setup script:

    bash

    ```
    chmod +x setup.sh
    ./setup.sh
    ```

2.  Add your OpenAI API key to the `.env` file:

    ```
    OPENAI_API_KEY=your_api_key_here
    COMPOSIO_API_KEY=your_api_key_here
    ```

Usage
-----

Run the main application:

bash

```
python main.py
```

The application will:

1.  Prompt you to provide a path to a document or folder
2.  Process and index the document(s)
3.  Allow you to ask questions about the content

### Query Types

-   **Simple queries**: Processed directly for faster response times
-   **Complex queries**: Handled by an agent with reasoning capabilities

Type `exit`, `quit`, or `q` to end the session.


Requirements
------------

See `requirements.txt` for a complete list of dependencies including:

-   langchain
-   chromadb
-   openai
-   crewai
-   composio-langchain
-   pypdf
-   docx2txt

Integration
-----------

This tool can be integrated with the Composio framework via the `DocumentRagTool` class, which provides two primary actions:

-   `UploadDocument`: Processes and indexes documents
-   `QueryDocument`: Retrieves information from indexed documents
