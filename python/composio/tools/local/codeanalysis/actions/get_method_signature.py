from typing import Type

from pydantic import BaseModel, Field

from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction


class GetMethodSignatureInput(BaseModel):
    class_name: str = Field(..., description="Fully qualified name of the class containing the target method")
    method_name: str = Field(..., description="Name of the method whose signature is to be retrieved")


class GetMethodSignatureOutput(BaseModel):
    result: str = Field(..., description="Retrieved method signature as a string, including return type and parameters")


class GetMethodSignature(MethodAnalysisAction):
    """
    Retrieves the signature of a specified method within a given class.
    """

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