from typing import Type

from pydantic import BaseModel, Field

from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction


class GetMethodBodyInput(BaseModel):
    class_name: str = Field(..., description="Fully qualified name of the class containing the target method")
    method_name: str = Field(..., description="Name of the method whose body is to be retrieved")


class GetMethodBodyOutput(BaseModel):
    result: str = Field(..., description="Retrieved method body as a string, including any decorators and comments")


class GetMethodBody(MethodAnalysisAction):
    """
    Retrieves the body of a specified method within a given class.
    """

    _display_name = "Get Method Body"
    _request_schema: Type[GetMethodBodyInput] = GetMethodBodyInput
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