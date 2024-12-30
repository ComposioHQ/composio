import json
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict

from pydantic import BaseModel, Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.constants import CODE_MAP_CACHE, FQDN_FILE
from composio.tools.local.codeanalysis.tool_utils import retry_handler
from composio.utils.logging import get as get_logger


logger = get_logger("workspace")

# 'TOFIX(sh'rey): Address these issues
# pylint: disable=attribute-defined-outside-init,import-outside-toplevel,import-outside-toplevel


class Status(str, Enum):
    NOT_STARTED = "not_started"
    LOADING_FQDNS = "loading_fqdns"
    LOADING_INDEX = "loading_index"
    COMPLETED = "completed"
    FAILED = "failed"


class CreateCodeMapRequest(BaseModel):
    pass


class CreateCodeMapResponse(BaseModel):
    result: str = Field(
        ...,
        description="Outcome of the code map creation process, including success or failure status and any relevant details",
    )


class CreateCodeMap(LocalAction[CreateCodeMapRequest, CreateCodeMapResponse]):
    """
    Use this to create a code map for a repository by indexing and analyzing its contents.

    This action returns the full information about all the instances of the class queried.
    1. Generates a Fully Qualified Domain Name (FQDN) cache for code entities
       (classes, functions, variables).
    2. Creates an index of the repository's Python files.
    3. Builds a vector store from chunked file contents for efficient searching.

    Use this action when you need to analyze or search through a codebase efficiently.
    The resulting index can be used for various code analysis tasks.

    Output:
    - result: Status message indicating success or failure of the indexing process

    Note: This action may take some time to complete for large codebases.
    """

    display_name = "Create index"
    _tags = ["index"]
    requires = ["tqdm"]

    def execute(
        self, request: CreateCodeMapRequest, metadata: Dict
    ) -> CreateCodeMapResponse:
        if "create_fqdn" not in metadata:
            metadata["create_fqdn"] = True
        if "create_index" not in metadata:
            metadata["create_index"] = True
        if "is_python" not in metadata:
            metadata["is_python"] = True

        self.REPO_DIR = os.path.normpath(os.path.abspath(metadata["dir_to_index_path"]))
        self.failed_files: list[str] = []

        status = self.check_status(self.REPO_DIR)
        if status["status"] == Status.COMPLETED:
            return CreateCodeMapResponse(
                result=f"Indexing already exists for {metadata['dir_to_index_path']}"
            )

        if status["status"] in [Status.NOT_STARTED, Status.FAILED]:
            status = self._update_status(self.REPO_DIR, Status.LOADING_FQDNS)

        repo_name = os.path.basename(self.REPO_DIR)
        self.save_dir = f"{CODE_MAP_CACHE}/{repo_name}"
        os.makedirs(self.save_dir, exist_ok=True)
        self.fqdn_cache_file = os.path.join(self.save_dir, FQDN_FILE)

        self._process(status, metadata)

        return CreateCodeMapResponse(
            result=f"Indexing completed for {metadata['dir_to_index_path']}"
        )

    def _process(self, status: Dict[str, Any], metadata: Dict[str, Any]) -> None:
        """
        Process the indexing operation based on the current status.

        This method handles the different stages of the indexing process:
        1. Loading FQDNs (Fully Qualified Domain Names)
        2. Creating the index

        It updates the status after each stage and handles any exceptions that may occur.

        Args:
            status (Dict[str, Any]): The current status of the indexing process.

        Raises:
            RuntimeError: If there's an error during the FQDN loading or index creation process.

        Returns:
            None
        """
        try:
            if status["status"] == Status.LOADING_FQDNS:
                if metadata["create_fqdn"]:
                    self.load_all_fqdns()
                status = self._update_status(self.REPO_DIR, Status.LOADING_INDEX)
            if status["status"] == Status.LOADING_INDEX:
                if metadata["create_index"]:
                    self.create_index(metadata["is_python"])
                status = self._update_status(self.REPO_DIR, Status.COMPLETED)
        except Exception as e:
            self._update_status(self.REPO_DIR, Status.FAILED)
            raise ExecutionFailed(
                message=f"Failed to create index, error encountered while {str(status['status'])}: {e}"
            ) from e

    def create_index(self, is_python: bool):
        """
        Create an index of the Python files in the repository.

        This method processes all Python files in the repository, chunks their content,
        and creates a vector store from the chunks.

        Raises:
            IOError: If there's an error reading any of the Python files.
            ValueError: If chunking or vector store creation fails.
        """
        from tqdm.auto import tqdm

        from composio.tools.local.codeanalysis import chunker, embedder, tool_utils

        python_files = tool_utils.find_python_files(self.REPO_DIR)
        chunking = chunker.Chunking(self.REPO_DIR)
        chunks, metadatas, ids = [], [], []
        num_lines = {}

        for file in tqdm(
            python_files, total=len(python_files), desc="Processing files"
        ):
            with open(file, "r", encoding="utf-8") as f:
                file_content = f.read()

            chunk, metadata, id = chunking.chunk(
                file_content, file, is_python=is_python
            )
            num_lines[file] = len(file_content.splitlines())
            chunks.extend(chunk)
            metadatas.extend(metadata)
            ids.extend(id)

        documents = chunker.construct_chunks(chunks, metadatas, ids, num_lines)

        embedder.get_vector_store_from_chunks(self.REPO_DIR, documents, ids, metadatas)
        logger.info(f"Successfully created index for {len(python_files)} files.")

    def load_all_fqdns(self):
        """
        Load all Fully Qualified Domain Names (FQDNs) from the repository.

        This method processes all Python files in the repository, extracts FQDNs,
        and stores them in a cache file.

        Raises:
            IOError: If there's an error reading or writing files.
            ValueError: If processing of FQDNs fails.
        """
        from tqdm.auto import tqdm

        from composio.tools.local.codeanalysis import lsp_helper, tool_utils

        python_file_paths = sorted(
            tool_utils.find_python_files(
                self.REPO_DIR,
                filter_test_files=True,
                filter_out_unreadable_files=True,
            )
        )

        self.all_fqdns_df = {}
        for file_path in tqdm(python_file_paths, desc="Processing Python files"):
            rel_path = os.path.relpath(file_path, self.REPO_DIR)
            try:
                self.all_fqdns_df[rel_path] = self.process_python_file_fqdns(
                    file_absolute_path=file_path
                )
            except Exception as e:
                lsp_helper.clear_cache()
                logger.error(f"Failed to process FQDNs for file {file_path}: {e}")

        with open(self.fqdn_cache_file, "w", encoding="utf-8") as f:
            json.dump(self.all_fqdns_df, f, indent=4)

    @retry_handler(max_attempts=2, delay=1)
    def process_python_file_fqdns(self, file_absolute_path: str) -> list:
        """
        Process a Python file to find the Fully Qualified Domain Names (FQDNs) of various entities.

        This function analyzes the file to find FQDNs of:
        * Global classes
        * Global functions
        * Immediate member functions of global classes
        * Global variables

        Args:
            file_absolute_path (str): The absolute path of the Python file to process.

        Returns:
            list: A list of dictionaries containing FQDN information for each entity.
        """
        from composio.tools.local.codeanalysis import lsp_helper, tree_sitter_related

        # Fetch the script object for the file
        script_obj = lsp_helper.fetch_script_obj_for_file_in_repo(
            file_path=file_absolute_path, repo_path=self.REPO_DIR
        )

        # Fetch class and function definition nodes
        class_function_nodes = (
            tree_sitter_related.fetch_class_and_function_nodes_defn_identifiers(
                file_absolute_path
            )
        )

        # Fetch references within the script
        candidate_references = lsp_helper.fetch_and_filter(
            script_obj=script_obj,
            clickable_nodes=class_function_nodes,
            file_path=file_absolute_path,
            allowed_types=["class", "function"],
            reference=True,
        )

        global_scope_references = lsp_helper.fetch_and_filter(
            script_obj=script_obj,
            clickable_nodes=class_function_nodes,
            file_path=file_absolute_path,
            allowed_types=["class", "function"],
            reference=True,
            only_global_scope=True,
        )

        # Ensure global scope references are a subset of all references
        all_candidate_fqdns = {ref["global_fqdn"] for ref in candidate_references}
        if not all(
            ref["global_fqdn"] in all_candidate_fqdns for ref in global_scope_references
        ):
            raise ValueError("Global scope references not a subset of all references")

        fqdns_arr = lsp_helper.fetch_global_and_nested_fqdns(
            candidate_references, global_scope_references
        )

        # Handle global variables
        left_sided_identifiers = (
            tree_sitter_related.find_left_side_identifiers_of_assignments(
                file_absolute_path
            )
        )

        global_variables_fqdns = lsp_helper.fetch_and_filter(
            script_obj=script_obj,
            clickable_nodes=left_sided_identifiers,
            file_path=file_absolute_path,
            allowed_types=["variable"],
            reference=False,
            only_global_scope=True,
        )

        fqdns_arr.extend(global_variables_fqdns)

        return fqdns_arr

    def _update_status(
        self,
        repo_path: str,
        status: str,
        error: str = "",
    ) -> dict:
        status_data = {
            "status": status,
        }
        if error:
            status_data["error"] = error
        status_file = Path(repo_path) / ".indexing_status.json"
        with open(status_file, "w", encoding="utf-8") as f:
            json.dump(status_data, f)
        return status_data

    def check_status(self, repo_path: str) -> dict:
        status_file = Path(repo_path) / ".indexing_status.json"
        if not status_file.exists():
            return {"status": Status.NOT_STARTED}
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
