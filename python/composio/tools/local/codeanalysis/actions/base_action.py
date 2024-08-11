import json
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import lsp_helper, tool_utils
from composio.tools.local.codeanalysis.constants import (
    DIR_FOR_FQDN_CACHE,
    DIR_FOR_TOOL_INFO_CACHE,
)


class BaseCodeAnalysisAction(Action, ABC):
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def __init__(self):
        self.fqdn_cache_file = None
        self.all_fqdns_df = None
        self.fqdn_index = None

    @abstractmethod
    def execute(self, request_data):
        pass

    def load_fqdn_cache(self, repo_path: str):
        repo_name = os.path.basename(repo_path)
        self.fqdn_cache_file = os.path.join(
            DIR_FOR_FQDN_CACHE, f"{repo_name}_fqdn_cache.json"
        )
        if not os.path.exists(self.fqdn_cache_file):
            raise FileNotFoundError(
                f"FQDN cache file not found: {self.fqdn_cache_file}"
            )

        with open(self.fqdn_cache_file, "r") as f:
            self.all_fqdns_df = json.load(f)

        self.fqdn_index = {
            fqdn_obj["global_fqdn"]: fqdn_obj
            for possible_fqdns in self.all_fqdns_df.values()
            for fqdn_obj in possible_fqdns
        }

    def get_matching_items(
        self, query_name: Optional[str], item_type: str
    ) -> List[str]:
        if not self.fqdn_index:
            raise ValueError("FQDN index not loaded")

        matching_fqdns = [
            curr_fqdn
            for curr_fqdn, curr_fqdn_elem in self.fqdn_index.items()
            if curr_fqdn_elem["global_type"] == item_type
            and (
                query_name is None
                or query_name == curr_fqdn.split(".")[-1]
                or query_name == curr_fqdn
            )
        ]
        return matching_fqdns

    def fetch_relevant_details(self, relevant_fqdn: str, repo_path: str) -> Dict:
        repo_name = os.path.basename(repo_path)
        hash_id = tool_utils.fetch_hash(relevant_fqdn)
        os.makedirs(DIR_FOR_TOOL_INFO_CACHE, exist_ok=True)
        os.makedirs(os.path.join(DIR_FOR_TOOL_INFO_CACHE, repo_name), exist_ok=True)
        possible_path = os.path.join(
            DIR_FOR_TOOL_INFO_CACHE, repo_name, f"{hash_id}.json"
        )

        if not os.path.exists(possible_path):
            if self.fqdn_index is None:
                raise ValueError("FQDN index not loaded")
            elem_fqdn = self.fqdn_index[relevant_fqdn]
            elem = lsp_helper.fetch_relevant_elem(
                elem_fqdn["global_module"],
                repo_path,
                elem_fqdn["global_fqdn"],
                elem_fqdn["global_type"],
            )
            data = {}
            if isinstance(elem, list):
                data[relevant_fqdn] = [x.__dict__ for x in elem]
            else:
                raise ValueError("Expected a list of elements")

            with open(possible_path, "w") as fd:
                json.dump(data, fd, indent=1)
        else:
            with open(possible_path, "r") as f:
                data = json.load(f)

        if relevant_fqdn not in data:
            raise KeyError(f"FQDN {relevant_fqdn} not found in cache")

        return data[relevant_fqdn]

    def get_item_results(self, matching_fqdns: List[str], repo_path: str) -> List[Dict]:
        matching_fqdn_elems_df = {
            k: self.fetch_relevant_details(k, repo_path) for k in matching_fqdns
        }
        results = []
        for _val in matching_fqdn_elems_df.values():
            if isinstance(_val, list):
                results.extend(_val)
            else:
                results.append(_val)
        return results


class MethodAnalysisAction(BaseCodeAnalysisAction, ABC):
    @abstractmethod
    def execute(self, request_data):
        pass

    def get_method_artefacts(
        self, query_class_name: Optional[str], query_method_name: str, repo_path: str
    ) -> Dict:
        matching_fqdns_func = self.get_matching_items(query_method_name, "function")
        matching_fqdns_class = self.get_matching_items(query_class_name, "class")

        func_results = self.get_item_results(matching_fqdns_func, repo_path)
        filtered_func_results = self.filter_function_results(
            func_results, query_class_name, matching_fqdns_class, repo_path
        )

        return self.format_method_results(filtered_func_results)

    def filter_function_results(
        self,
        func_results: List[Dict],
        query_class_name: Optional[str],
        matching_fqdns_class: List[str],
        repo_path: str,
    ) -> List[Dict]:
        filtered_results = []
        for func_res in func_results:
            parent_class = func_res["parent_class"]
            if parent_class is None:
                if query_class_name is None:
                    filtered_results.append(func_res)
            else:
                if self.is_function_in_class(func_res, matching_fqdns_class, repo_path):
                    filtered_results.append(func_res)
        return filtered_results

    def is_function_in_class(
        self, func_res: Dict, matching_fqdns_class: List[str], repo_path: str
    ) -> bool:
        matching_class_elems = {
            k: self.fetch_relevant_details(k, repo_path) for k in matching_fqdns_class
        }
        for class_elem in matching_class_elems.values():
            all_members = self.get_all_members(class_elem)
            if func_res["full_name"] in all_members:
                return True
        return False

    @staticmethod
    def get_all_members(class_elem: Dict) -> List[str]:
        all_members = []
        if isinstance(class_elem, list):
            for elem in class_elem:
                all_members.extend(elem["member_functions"])
        else:
            all_members.extend(class_elem["member_functions"])
        return all_members

    @staticmethod
    def format_method_results(method_results: List[Dict]) -> Dict:
        signature_ans = []
        body_ans = []

        for idx, func in enumerate(method_results):
            result_header = f"## Details about shortlisted result ID {idx}:\n"
            function_details = func["res_fetch_function_stuff"]
            function_body = f"\n```python\n{func['definition_body']}\n```"

            signature_ans.append(result_header + function_details)
            body_ans.append(result_header + function_details + function_body)

        return {
            "signature_ans": "\n".join(signature_ans),
            "body_ans": "\n".join(body_ans),
        }
