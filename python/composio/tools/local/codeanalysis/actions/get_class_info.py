import os
from typing import Dict, List

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import BaseCodeAnalysisAction
from composio.tools.local.codeanalysis.actions.create_codemap import (
    CreateCodeMap,
    CreateCodeMapRequest,
)


class GetClassInfoRequest(BaseModel):
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
    This tool retrieves and formats detailed information about a specified class in a given repository.

    Use this action when you need to:
    1. Obtain details about structure, methods and attributes of a specific class in the codebase.
    2. Get the class summary, class variables, instance variables, member functions, and property variables.

    Usage example:
    class_name: Signal

    Note: If multiple classes match the provided name, information for all matching classes will be returned.
    """

    display_name = "Get Class Info"
    _tags = ["index"]

    def execute(
        self, request: GetClassInfoRequest, metadata: Dict
    ) -> GetClassInfoResponse:
        CreateCodeMap().execute(CreateCodeMapRequest(), metadata)
        repo_name = os.path.basename(metadata["dir_to_index_path"])

        self.load_fqdn_cache(repo_name)
        query_class_name = request.class_name

        matching_fqdns = self.get_matching_items(query_class_name, "class")
        class_results = self.get_item_results(
            matching_fqdns=matching_fqdns,
            repo_path=metadata["dir_to_index_path"],
        )

        if not class_results:
            return GetClassInfoResponse(result="No matching results found!")

        result_str = self.format_class_results(class_results)
        return GetClassInfoResponse(result=result_str)

    def format_class_results(self, class_results: List[Dict]) -> str:
        result_str = f"<Total {len(class_results)} result(s) found:>\n"
        for _idx, _class in enumerate(class_results):
            result_str += f"## Details about shortlisted result ID {_idx}:\n"
            result_str += _class["res_fetch_class_stuff"]
            result_str += "\n"
        return result_str
