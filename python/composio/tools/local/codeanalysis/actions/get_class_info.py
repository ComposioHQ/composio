from pathlib import Path
from typing import Dict, List, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import BaseCodeAnalysisAction


class GetClassInfoRequest(BaseModel):
    repo_name: str = Field(
        ...,
        description="Name of the repository. It should be the last part of valid github repository name. It should not contain any '/'.",
    )
    class_name: str = Field(
        ..., description="Name of the class for which information is requested"
    )


class GetClassInfoResponse(BaseModel):
    result: str = Field(
        ...,
        description="Formatted string containing detailed information about the requested class",
    )


class GetClassInfo(
    LocalAction[GetClassInfoRequest, GetClassInfoResponse], BaseCodeAnalysisAction
):
    """
    Retrieves and formats information about a specified class.

    This action searches for class information based on the provided class name,
    fetches relevant details, and returns a formatted string with the results.
    """

    _display_name = "Get Class Info"
    _request_schema: Type[GetClassInfoRequest] = GetClassInfoRequest
    _response_schema: Type[GetClassInfoResponse] = GetClassInfoResponse
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def execute(
        self, request: GetClassInfoRequest, metadata: Dict
    ) -> GetClassInfoResponse:
        try:
            repo_path = request.repo_name
            if "/" in repo_path:
                repo_path = repo_path.split("/")[-1]
            repo_path = Path.home() / repo_path

            self.load_fqdn_cache(repo_path)
            query_class_name = request.class_name

            if not isinstance(query_class_name, str):
                raise ValueError(
                    "Invalid argument provided. Argument type must be string"
                )

            matching_fqdns = self.get_matching_items(query_class_name, "class")
            class_results = self.get_item_results(matching_fqdns, repo_path)

            if not class_results:
                return GetClassInfoResponse(result="No matching results found!")

            result_str = self.format_class_results(class_results)
            return GetClassInfoResponse(result=result_str)
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetClassInfo: {e}")

    def format_class_results(self, class_results: List[Dict]) -> str:
        result_str = f"<Total {len(class_results)} result(s) found:>\n"
        for _idx, _class in enumerate(class_results):
            result_str += f"## Details about shortlisted result ID {_idx}:\n"
            result_str += _class["res_fetch_class_stuff"]
            result_str += "\n"
        return result_str
