# ragdoctool/actions/AddContentToRagTool.py
#Comments created using gpt and me

import os
from pathlib import Path
from typing import Dict, List

from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
import chromadb
from tqdm import tqdm
import docx
import PyPDF2

from composio.tools.base.local import LocalAction
from composio.tools.base.exceptions import ExecutionFailed


class AddContentRequest(BaseModel):
    file_path: str = Field(..., description="Path to the PDF, DOCX, or TXT file to ingest.")


class AddContentResponse(BaseModel):
    status: str = Field(..., description="Status message indicating the result of the ingestion.")


class AddContentToRagTool(LocalAction[AddContentRequest, AddContentResponse]):
    """Action to ingest content and add embeddings to the RAG knowledge base."""

    _tags = ["RAG", "Knowledge Base", "Add Content"]

    def __init__(self):
        super().__init__()
        # Initialize the embedding model once
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        # Initialize Chromadb client and collection once
        storage_path = os.path.expanduser("~/.composio/ragdoctool_storage")
        os.makedirs(storage_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=storage_path)
        self.collection = self.client.get_or_create_collection(name="rag_embeddings")

    def execute(self, request: AddContentRequest, metadata: Dict) -> AddContentResponse:
        """
        Execute the AddContentToRagTool action.

        Parameters:
            request (AddContentRequest): The request containing the file path to ingest.
            metadata (Dict): Additional metadata (not used here).

        Returns:
            AddContentResponse: Status message indicating success or failure.
        """
        try:
            file_path = request.file_path
            print(f"Starting content ingestion for: {file_path}")

            if not os.path.exists(file_path):
                print(f"File or directory not found: {file_path}")
                raise ExecutionFailed(f"File or directory not found: {file_path}")

            # If the path is a directory, process all supported files within
            if os.path.isdir(file_path):
                
                #making sure files are only pdf, docx, or text.
                files = self._get_supported_files(file_path)
                print(f"Found {len(files)} supported files in directory {file_path}")
            else:
                files = [file_path]
                print(f"Processing single file: {file_path}")

            #Using tqdm for visual representation of progress
            for file in tqdm(files, desc="Processing files"):
                print(f"Extracting text from: {file}")
                text = self._extract_text(file)
                if not text.strip():
                    print(f"No text extracted from {file}. Skipping.")
                    continue

                print(f"Splitting text from {file} into chunks")
                chunks = self._split_text(text)
                print(f"Generated {len(chunks)} chunks from {file}")

                print(f"Generating embeddings for {len(chunks)} chunks")
                embeddings = self._generate_embeddings(chunks)

                for chunk, embedding in zip(chunks, embeddings):
                    self.collection.add(
                        documents=[chunk],
                        metadatas=[{'source': file}],
                        embeddings=[embedding]
                    )
                print(f"Stored embeddings for {file}")

            print("Content ingestion completed successfully.")
            return AddContentResponse(status="Content added successfully.")

        except ExecutionFailed as e:
            raise e
        except Exception as e:
            print(f"Unexpected error during content ingestion: {e}")
            raise ExecutionFailed(f"Unexpected error: {e}")

    def _get_supported_files(self, directory: str) -> List[str]:
        """
        Recursively get all supported files in a directory.

        Parameters:
            directory (str): The directory path to scan.

        Returns:
            List[str]: List of supported file paths.
        """
        supported_extensions = ['.pdf', '.docx', '.txt']
        supported_files = []
        for root, _, files in os.walk(directory):
            for file in files:
                if Path(file).suffix.lower() in supported_extensions:
                    supported_files.append(os.path.join(root, file))
        return supported_files

    def _extract_text(self, file_path: str) -> str:
        """
        Extract text from a single file based on its type.

        Parameters:
            file_path (str): The path to the file.

        Returns:
            str: Extracted text.
        """
        extension = Path(file_path).suffix.lower()
        try:
            if extension == '.pdf':
                return self._extract_text_from_pdf(file_path)
            elif extension == '.docx':
                return self._extract_text_from_docx(file_path)
            elif extension == '.txt':
                return self._extract_text_from_txt(file_path)
            else:
                print(f"Unsupported file type: {extension}")
                return ""
        except Exception as e:
            print(f"Error extracting text from {file_path}: {e}")
            return ""

    def _extract_text_from_pdf(self, file_path: str) -> str:
        """
        Extract text from a PDF file using PyPDF2.

        Parameters:
            file_path (str): The path to the PDF file.

        Returns:
            str: Extracted text.
        """
        text = ""
        with open(file_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text
        return text

    def _extract_text_from_docx(self, file_path: str) -> str:
        """
        Extract text from a DOCX file using python-docx.

        Parameters:
            file_path (str): The path to the DOCX file.

        Returns:
            str: Extracted text.
        """
        doc = docx.Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text

    def _extract_text_from_txt(self, file_path: str) -> str:
        """
        Extract text from a TXT file.

        Parameters:
            file_path (str): The path to the TXT file.

        Returns:
            str: Extracted text.
        """
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()

    def _split_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """
        Split text into overlapping chunks for embedding.

        Parameters:
            text (str): The text to split.
            chunk_size (int): Number of words per chunk.
            overlap (int): Number of overlapping words between chunks.

        Returns:
            List[str]: List of text chunks.
        """
        words = text.split()
        chunks = []
        start = 0
        while start < len(words):
            end = start + chunk_size
            chunk = ' '.join(words[start:end])
            chunks.append(chunk)
            start += chunk_size - overlap
        return chunks

    def _generate_embeddings(self, chunks: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of text chunks.

        Parameters:
            chunks (List[str]): List of text chunks.

        Returns:
            List[List[float]]: List of embeddings.
        """
        embeddings = self.model.encode(chunks)  # This returns a NumPy array or list of tensors

        # Convert embeddings to list of lists
        if hasattr(embeddings, 'tolist'):
            return embeddings.tolist()
        elif isinstance(embeddings, list):
            return [embedding.tolist() for embedding in embeddings]
        else:
            raise TypeError("Unexpected type for embeddings: {}".format(type(embeddings)))
