from typing import Optional, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction


class GetMethodSignatureRequest(BaseModel):
    repo_path: str = Field(
        ...,
        description="Path to the repository",
    )
    class_name: Optional[str] = Field(
        None,
        description="Fully qualified name of the class containing the target method",
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
    Retrieves the signature of a specified method.

    This action can retrieve the method signature in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    The retrieved signature includes any decorators and comments associated with the method.
    """

    _display_name = "Get Method Signature"
    _request_schema: Type[GetMethodSignatureRequest] = GetMethodSignatureRequest
    _response_schema: Type[GetMethodSignatureResponse] = GetMethodSignatureResponse
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def execute(
        self, request_data: GetMethodSignatureRequest
    ) -> GetMethodSignatureResponse:
        try:
            self.load_fqdn_cache(request_data.repo_path)
            method_artefacts = self.get_method_artefacts(
                request_data.class_name,
                request_data.method_name,
                request_data.repo_path,
            )
            return GetMethodSignatureResponse(result=method_artefacts["signature_ans"])
        except Exception as e:
            raise RuntimeError(f"Failed to execute {self.__class__.__name__}: {e}")
