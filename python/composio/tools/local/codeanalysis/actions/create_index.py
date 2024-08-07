import json
import os
from collections import Counter
from enum import Enum
from pathlib import Path
from typing import Type

from pydantic import BaseModel, Field
from tqdm.auto import tqdm

from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import (
    lsp_helper,
    tool_utils,
    tree_sitter_related,
)
from composio.tools.local.codeanalysis.constants import *


class Status(str, Enum):
    NOT_STARTED = "not_started"
    LOADING_FQDNS = "loading_fqdns"
    CREATING_CACHE = "creating_index"
    COMPLETED = "completed"
    FAILED = "failed"


class CreateCodeIndexInput(BaseModel):
    dir_to_index_path: str = Field(..., description="Directory to index")
    env_path: str = Field(..., description="Path to the environment file")


class CreateCodeIndexOutput(BaseModel):
    result: str = Field(..., description="Result of the action")


class CreateIndex(Action[CreateCodeIndexInput, CreateCodeIndexOutput]):
    """
    Creates a fqdn cache for a repo.
    """

    _display_name = "Create index"
    _request_schema: Type[CreateCodeIndexInput] = CreateCodeIndexInput
    _response_schema: Type[CreateCodeIndexOutput] = CreateCodeIndexOutput
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def execute(self, request_data: CreateCodeIndexInput) -> CreateCodeIndexOutput:
        self.REPO_DIR = os.path.normpath(
            os.path.abspath(request_data.dir_to_index_path)
        )
        self.ENV_PATH = request_data.env_path

        try:
            status = self.check_status(self.REPO_DIR)

            if status["status"] == Status.COMPLETED:
                return CreateCodeIndexOutput(
                    result=f"Indexing already exists for {request_data.dir_to_index_path}"
                )

            if status["status"] in [Status.NOT_STARTED, Status.FAILED]:
                status = self._update_status(self.REPO_DIR, Status.LOADING_FQDNS)

            os.makedirs(DIR_FOR_FQDN_CACHE, exist_ok=True)
            self.fqdn_cache_file = os.path.join(DIR_FOR_FQDN_CACHE, "fqdn.json")

            self._process(status)

            return CreateCodeIndexOutput(
                result=f"Indexing completed for {request_data.dir_to_index_path}"
            )
        except Exception as e:
            print(f"Failed to execute indexing: {e}")
            self._update_status(self.REPO_DIR, Status.FAILED, str(e))
            return CreateCodeIndexOutput(
                result=f"Indexing failed for {request_data.dir_to_index_path}: {e}"
            )

    def _process(self, status):
        if status["status"] == Status.LOADING_FQDNS:
            self._handle_loading_fqdns()
        elif status["status"] == Status.CREATING_CACHE:
            self._handle_creating_cache()

    def _handle_loading_fqdns(self):
        try:
            self.load_all_fqdns()
            self._update_status(self.REPO_DIR, Status.CREATING_CACHE)
            self.create_fqdn_cache()
            self._update_status(self.REPO_DIR, Status.COMPLETED)
        except Exception as e:
            self._update_status(self.REPO_DIR, Status.FAILED)
            raise RuntimeError(f"Failed to handle loading FQDNs: {e}")

    def _handle_creating_cache(self):
        if not os.path.exists(self.fqdn_cache_file):
            raise FileNotFoundError("FQDN cache file not found")

        try:
            with open(self.fqdn_cache_file, "r") as f:
                self.all_fqdns_df = json.load(f)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to load FQDN cache file: {e}")

        try:
            self.create_fqdn_cache()
            self._update_status(self.REPO_DIR, Status.COMPLETED)
        except Exception as e:
            self._update_status(self.REPO_DIR, Status.FAILED)
            raise RuntimeError(f"Failed to create FQDN cache: {e}")

    def create_fqdn_cache(self):
        """
        Create a cache of tool information for each FQDN in the repository.

        This method processes all FQDNs in the repository and stores detailed
        information about each entity (class, function, variable) in a cache
        for quick retrieval.

        Returns:
            None
        """
        assert hasattr(self, "all_fqdns_df"), "FQDN index not loaded"

        all_fqdns = []
        self.fqdn_index = {}
        for _file_name, possible_fqdns in self.all_fqdns_df.items():
            all_fqdns.extend([x["global_fqdn"] for x in possible_fqdns])
            for fqdn_obj in possible_fqdns:
                self.fqdn_index[fqdn_obj["global_fqdn"]] = fqdn_obj

        freq = Counter(all_fqdns)
        freq = sorted(freq.items(), key=lambda x: -x[1])

        save_dir = DIR_FOR_TOOL_INFO_CACHE
        os.makedirs(save_dir, exist_ok=True)

        all_fqdns_within_repo = [
            x
            for fqdns_list_in_file in self.all_fqdns_df.values()
            for x in fqdns_list_in_file
        ]

        all_fqdns_within_repo = [
            x
            for x in all_fqdns_within_repo
            if x["global_type"] in ["class", "function"]
        ]

        print(
            f"Distribution of FQDNs: {Counter([x['global_type'] for x in all_fqdns_within_repo])}"
        )

        for elem_fqdn in tqdm(all_fqdns_within_repo):
            try:
                str_to_hash = elem_fqdn["global_fqdn"]
                hash_id = tool_utils.fetch_hash(str_to_hash)
                save_path = os.path.join(save_dir, f"{hash_id}.json")

                if not os.path.exists(save_path):
                    with open(save_path, "w") as fd:
                        json.dump({}, fd)

                with open(save_path, "r") as fd:
                    hashed_dict = json.load(fd)

                if str_to_hash in hashed_dict:
                    continue

                elem = lsp_helper.fetch_relevant_elem(
                    elem_fqdn["global_module"],
                    self.REPO_DIR,
                    elem_fqdn["global_fqdn"],
                    elem_fqdn["global_type"],
                    self.ENV_PATH,
                )

                if isinstance(elem, list):
                    hashed_dict[str_to_hash] = [x.__dict__ for x in elem]
                else:
                    raise ValueError("Expected a list of elements")

                with open(save_path, "w") as fd:
                    json.dump(hashed_dict, fd, indent=1)
            except Exception as e:
                print(f"Error in processing: {elem_fqdn['global_fqdn']}: {e}")

    def load_all_fqdns(self):
        """
        Load all FQDNs from the repository.
        """
        try:
            python_file_paths = sorted(
                tool_utils.find_python_files(
                    self.REPO_DIR,
                    filter_test_files=True,
                    filter_out_unreadable_files=True,
                )
            )

            self.all_fqdns_df = {}
            for _file in python_file_paths:
                _rel_path = os.path.relpath(_file, self.REPO_DIR)
                self.all_fqdns_df[_rel_path] = self.process_python_file_fqdns(_file)

            with open(self.fqdn_cache_file, "w") as f:
                json.dump(self.all_fqdns_df, f, indent=4)
        except Exception as e:
            raise RuntimeError(f"Failed to load all FQDNs: {e}")

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
        try:
            # Fetch the script object for the file
            script_obj = lsp_helper.fetch_script_obj_for_file_in_repo(
                file_path=file_absolute_path,
                repo_path=self.REPO_DIR,
                environment_path=self.ENV_PATH,
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
                ref["global_fqdn"] in all_candidate_fqdns
                for ref in global_scope_references
            ):
                raise ValueError(
                    "Global scope references not a subset of all references"
                )

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

        except Exception as e:
            raise RuntimeError(
                f"Failed to process FQDNs for file {file_absolute_path}: {e}"
            )

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
