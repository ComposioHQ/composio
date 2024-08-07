import json
from collections import Counter
from typing import Dict, List, Optional, Tuple, Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import tool_utils
from composio.tools.local.codeanalysis.actions.action_helper import (
    BaseCodeAnalysisAction,
)
from composio.tools.local.codeanalysis.constants import *


class GetClassInfoInput(BaseModel):
    class_name: str = Field(..., description="Name of the class to get info for")


class GetClassInfoOutput(BaseModel):
    result: str = Field(..., description="Result of the action")


class GetClassInfo(
    Action[GetClassInfoInput, GetClassInfoOutput], BaseCodeAnalysisAction
):
    _display_name = "Get Class Info"
    _request_schema: Type[GetClassInfoInput] = GetClassInfoOutput
    _response_schema: Type[GetClassInfoOutput] = GetClassInfoOutput

    def execute(self, request_data: GetClassInfoInput) -> GetClassInfoOutput:
        try:
            self.load_fqdn_cache()
            query_class_name = request_data.class_name

            if not isinstance(query_class_name, str):
                raise ValueError(
                    "Invalid argument provided. Argument type must be string"
                )

            matching_fqdns = self.get_matching_items(query_class_name, "class")
            class_results = self.get_item_results(matching_fqdns)

            if not class_results:
                return GetClassInfoOutput(result="No matching results found!")

            result_str = self.format_class_results(class_results)
            return GetClassInfoOutput(result=result_str)
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetClassInfo: {e}")

    def format_class_results(self, class_results: List[Dict]) -> str:
        result_str = f"<Total {len(class_results)} result(s) found:>\n"
        for _idx, _class in enumerate(class_results):
            result_str += f"## Details about shortlisted result ID {_idx}:\n"
            result_str += _class["res_fetch_class_stuff"]
            result_str += "\n"
        return result_str
