import json
from collections import Counter
from typing import Dict, List, Optional, Tuple, Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import tool_utils
from composio.tools.local.codeanalysis.actions.action_helper import MethodAnalysisAction
from composio.tools.local.codeanalysis.constants import *


class GetMethodSignatureInput(BaseModel):
    class_name: Optional[str] = Field(
        None, description="Name of the class to get the method signature for"
    )
    method_name: str = Field(
        ..., description="Name of the method to get the signature for"
    )


class GetMethodSignatureOutput(BaseModel):
    result: str = Field(..., description="Result of the action")


class GetMethodSignature(
    Action[GetMethodSignatureInput, GetMethodSignatureOutput], MethodAnalysisAction
):
    _display_name = "Get Method Signature"
    _request_schema: Type[GetMethodSignatureInput] = GetMethodSignatureInput
    _response_schema: Type[GetMethodSignatureOutput] = GetMethodSignatureOutput

    def execute(
        self, request_data: GetMethodSignatureInput
    ) -> GetMethodSignatureOutput:
        try:
            self.load_fqdn_cache()
            query_class_name = request_data.class_name
            query_method_name = request_data.method_name
            method_artefacts = self.get_method_artefacts(
                query_class_name, query_method_name
            )
            return GetMethodSignatureOutput(result=method_artefacts["signature_ans"])
        except Exception as e:
            raise RuntimeError(f"Failed to execute {self.__class__.__name__}: {e}")
