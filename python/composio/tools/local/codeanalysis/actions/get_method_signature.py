import os
from typing import Dict, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction
from composio.tools.local.codeanalysis.actions.create_codemap import (
    CreateCodeMap,
    CreateCodeMapRequest,
)


class GetMethodSignatureRequest(BaseModel):
    class_name: Optional[str] = Field(
        None,
        description="Name of the class containing the target method",
    )
    method_name: str = Field(
        ..., description="Name of the method whose signature is to be retrieved"
    )


class GetMethodSignatureResponse(BaseModel):
    result: str = Field(
        ...,
        description="Retrieved method signature as a string, including return type and parameters",
    )


class GetMethodSignature(
    LocalAction[GetMethodSignatureRequest, GetMethodSignatureResponse],
    MethodAnalysisAction,
):
    """
    This tool retrieves the signature of a specified method from a given repository.

    Use this action when you need to Obtain the signature of a specific method without its implementation.

    This action can retrieve the method signature in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    Usage example:
    class_name: Field
    method_name: run_validators
    2. If no class name is provided, it retrieves the method from the global scope.
    Usage example:
    method_name: run_validators
    """

    display_name = "Get Method Signature"
    _tags = ["index"]

    def execute(
        self, request: GetMethodSignatureRequest, metadata: Dict
    ) -> GetMethodSignatureResponse:
        CreateCodeMap().execute(CreateCodeMapRequest(), metadata)
        repo_name = os.path.basename(metadata["dir_to_index_path"])

        self.load_fqdn_cache(repo_name)
        method_artefacts = self.get_method_artefacts(
            query_class_name=request.class_name,
            query_method_name=request.method_name,
            repo_path=metadata["dir_to_index_path"],
        )
        return GetMethodSignatureResponse(result=method_artefacts["signature_ans"])
