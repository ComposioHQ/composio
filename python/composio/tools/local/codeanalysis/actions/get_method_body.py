import json
from collections import Counter
from typing import Dict, List, Optional, Tuple, Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import tool_utils
from composio.tools.local.codeanalysis.actions.action_helper import MethodAnalysisAction
from composio.tools.local.codeanalysis.constants import *


class GetMethodBodyInput(BaseModel):
    class_name: Optional[str] = Field(
        None, description="Name of the class to get the method body for"
    )
    method_name: str = Field(..., description="Name of the method to get the body for")


class GetMethodBodyOutput(BaseModel):
    result: str = Field(..., description="Result of the action")


class GetMethodBody(
    Action[GetMethodBodyInput, GetMethodBodyOutput], MethodAnalysisAction
):
    _display_name = "Get Method Body"
    _request_schema: Type[GetMethodBodyInput] = GetMethodBodyOutput
    _response_schema: Type[GetMethodBodyOutput] = GetMethodBodyOutput

    def execute(self, request_data: GetMethodBodyInput) -> GetMethodBodyOutput:
        try:
            self.load_fqdn_cache()
            query_class_name = request_data.class_name
            query_method_name = request_data.method_name
            method_artefacts = self.get_method_artefacts(
                query_class_name, query_method_name
            )
            return GetMethodBodyOutput(result=method_artefacts["body_ans"])
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetMethodBody: {e}")
