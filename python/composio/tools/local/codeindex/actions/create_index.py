import json
import multiprocessing
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


# Constants
MAX_WINDOW_SIZE = 200
IDEAL_WINDOW_SIZE = 80
SUPPORTED_FILE_EXTENSIONS = {
    ".py": "PY",
    ".js": "JS",
    ".ts": "TS",
    ".html": "HTML",
    ".css": "CSS",
    ".java": "JAVA",
    ".cpp": "CPP",
    ".c": "C",
    ".h": "CHEADER",
    ".md": "MD",
    ".rst": "RST",
    ".txt": "TXT",
}
DEFAULT_EMBEDDING_MODEL_REMOTE = "text-embedding-3-large"
DEFAULT_EMBEDDING_MODEL_LOCAL = "all-MiniLM-L6-v2"
IGNORED_DIRECTORIES = {".git", ".tox", "venv", ".venv", "env", ".env", "__pycache__"}


class CreateCodeIndexInput(BaseModel):
    dir_to_index_path: str = Field(..., description="Directory to index")
    embedding_type: str = Field(
        default="local",
        description="Whether to use local or remote embedding. local uses the embedding model from Chroma, remote uses the embedding model from OpenAI",
    )
    force_index: bool = Field(
        default=False,
        description="If true, delete existing index before creating a new one",
    )


class CreateCodeIndexOutput(BaseModel):
    result: str = Field(..., description="Result of the action")


class CreateIndex(LocalAction[CreateCodeIndexInput, CreateCodeIndexOutput]):
    """
    Indexes a code base in a folder and stores the index in a vector store.
    """

    display_name = "Create index"
    _tags = ["index"]

    def execute(
        self, request: CreateCodeIndexInput, metadata: dict
    ) -> CreateCodeIndexOutput:
        # Check if index already exists or is in progress
        status = self.check_status(request.dir_to_index_path)
        if status["status"] == "completed" and not request.force_index:
            return CreateCodeIndexOutput(
                result=f"Index already exists for {request.dir_to_index_path}. Use force_index=True to recreate."
            )
        if status["status"] == "in_progress" and not request.force_index:
            return CreateCodeIndexOutput(
                result=f"Indexing is already in progress for {request.dir_to_index_path}. Use force_index=True to restart."
            )

        # If force_index is True, delete existing index
        if request.force_index:
            self._delete_existing_index(request.dir_to_index_path)

        # Start the indexing process in a new process
        process = multiprocessing.Process(target=self._index_creation, args=(request,))
        process.start()
        return CreateCodeIndexOutput(
            result=f"Indexing started for {request.dir_to_index_path}"
        )

    def _delete_existing_index(self, repo_path: str):
        import chromadb  # pylint: disable=C0415

        index_storage_path = Path.home() / ".composio" / "index_storage"
        collection_name = self._get_collection_name(repo_path)
        status_file = Path(repo_path) / ".indexing_status.json"

        # Delete the collection from Chroma if it exists
        chroma_client = chromadb.PersistentClient(path=str(index_storage_path))
        if collection_name in chroma_client.list_collections():
            chroma_client.delete_collection(name=collection_name)

        # Delete the status file if it exists
        if status_file.exists():
            os.remove(status_file)

    def _index_creation(self, request: CreateCodeIndexInput):
        import chromadb  # pylint: disable=C0415

        collection_name = self._get_collection_name(request.dir_to_index_path)
        index_storage_path = Path.home() / ".composio" / "index_storage"
        self._create_index_storage_path(index_storage_path)

        chroma_client = chromadb.PersistentClient(path=str(index_storage_path))

        embedding_function = self.create_embedding_function(
            request.embedding_type,
        )

        chroma_collection = self._create_chroma_collection(
            chroma_client, collection_name, embedding_function
        )

        self._process_and_add(
            chroma_collection,
            request.dir_to_index_path,
            request.embedding_type,
        )

    def _get_openai_credentials(
        self,
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        openai_key = os.getenv("OPENAI_API_KEY", None)
        api_base = os.getenv("HELICONE_API_BASE", None)
        helicone_auth = os.getenv("HELICONE_API_KEY", None)

        if openai_key:
            print("OPENAI_API_KEY is ready")
        else:
            print("OPENAI_API_KEY environment variable not found")

        return openai_key, api_base, helicone_auth

    def _get_collection_name(self, repo_path: str) -> str:
        return Path(repo_path).name

    def _create_index_storage_path(self, index_storage_path: Path) -> None:
        index_storage_path.mkdir(parents=True, exist_ok=True)

    def create_embedding_function(
        self,
        embedding_type: str,
    ):
        from chromadb.utils import embedding_functions  # pylint: disable=C0415
        from chromadb.utils.embedding_functions import (  # pylint: disable=C0415
            OpenAIEmbeddingFunction,
        )

        if embedding_type == "remote":
            openai_key, api_base, helicone_auth = self._get_openai_credentials()
            if not openai_key:
                raise ValueError("OPENAI_API_KEY environment variable not found")
            kwargs = {
                "api_key": openai_key,
                "model_name": DEFAULT_EMBEDDING_MODEL_REMOTE,
                "default_headers": (
                    {"Helicone-Auth": helicone_auth} if helicone_auth else {}
                ),
            }
            if api_base:
                kwargs["api_base"] = api_base
            return OpenAIEmbeddingFunction(**kwargs)

        return embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=DEFAULT_EMBEDDING_MODEL_LOCAL
        )

    def _create_chroma_collection(
        self, chroma_client, collection_name: str, embedding_function
    ):
        return chroma_client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_function,
        )

    def _process_and_add(
        self, chroma_collection, repo_path: str, embedding_type: str
    ) -> None:
        status_file = Path(repo_path) / ".indexing_status.json"
        self._update_status(status_file, "in_progress")

        try:

            def process_file(file_path: str) -> None:
                try:
                    with open(file_path, "r", encoding="utf-8") as file:
                        content = file.read()
                except Exception as e:
                    print(f"Failed to read {file_path}: {e}")
                    return

                windows = self._create_windows(content)

                file_extension = os.path.splitext(file_path)[1].lower()
                file_type = SUPPORTED_FILE_EXTENSIONS.get(file_extension, "Unknown")

                for start, end, window_content in windows:
                    metadata = {
                        "start_line": start,
                        "end_line": end,
                        "file_path": os.path.relpath(file_path, repo_path),
                        "file_extension": file_extension,
                        "file_type": file_type,
                    }
                    chroma_collection.add(
                        documents=[window_content],
                        metadatas=[metadata],
                        ids=[f"{file_path}_{start}_{end}"],
                    )

            def process_directory(directory: str) -> None:
                with ThreadPoolExecutor() as executor:
                    futures = []
                    for root, dirs, files in os.walk(directory):
                        dirs[:] = [d for d in dirs if d not in IGNORED_DIRECTORIES]
                        for file in files:
                            if file.endswith(tuple(SUPPORTED_FILE_EXTENSIONS.keys())):
                                file_path = os.path.join(root, file)
                                futures.append(executor.submit(process_file, file_path))

                    for future in as_completed(futures):
                        future.result()  # This will raise any exceptions that occurred during processing

            process_directory(repo_path)
            embedding_model = (
                DEFAULT_EMBEDDING_MODEL_REMOTE
                if embedding_type == "remote"
                else DEFAULT_EMBEDDING_MODEL_LOCAL
            )
            self._update_status(
                status_file,
                "completed",
                embedding_type=embedding_type,
                embedding_model=embedding_model,
            )
        except Exception as e:
            self._update_status(status_file, "failed", str(e))
            raise

    def _create_windows(self, content: str) -> List[Tuple[int, int, str]]:
        lines = content.splitlines()
        total_lines = len(lines)
        windows = []

        if total_lines <= MAX_WINDOW_SIZE:
            windows.append((1, total_lines, content))
        else:
            for start in range(0, total_lines, IDEAL_WINDOW_SIZE):
                end = min(start + MAX_WINDOW_SIZE, total_lines)
                window = "\n".join(lines[start:end])
                windows.append((start + 1, end, window))

        return windows

    def _update_status(
        self,
        status_file: Path,
        status: str,
        error: str = "",
        embedding_type: str = "",
        embedding_model: str = "",
    ):
        status_data = {
            "status": status,
            "embedding_type": embedding_type,
            "embedding_model": embedding_model,
        }
        if error:
            status_data["error"] = error
        with open(status_file, "w", encoding="utf-8") as f:
            json.dump(status_data, f)

    def check_status(self, repo_path: str) -> dict:
        status_file = Path(repo_path) / ".indexing_status.json"
        if not status_file.exists():
            return {"status": "not_started"}
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
