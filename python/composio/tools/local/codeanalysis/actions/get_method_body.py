from typing import Optional, Type

from pydantic import BaseModel, Field

from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction
from composio.tools.base.local import LocalAction

class GetMethodBodyInput(BaseModel):
    repo_path: str = Field(
        ...,
        description="Path to the repository",
    )
    class_name: Optional[str] = Field(
        None,
        description="Fully qualified name of the class containing the target method",
    )
    method_name: str = Field(
        ..., description="Name of the method whose body is to be retrieved"
    )


class GetMethodBodyOutput(BaseModel):
    result: str = Field(
        ...,
        description="Retrieved method body as a string, including any decorators and comments",
    )


class GetMethodBody(LocalAction[GetMethodBodyInput, GetMethodBodyOutput], MethodAnalysisAction):
    """
    Retrieves the body of a specified method.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    The retrieved body includes any decorators and comments associated with the method.
    """

    _display_name = "Get Method Body"
    _request_schema: Type[GetMethodBodyInput] = GetMethodBodyInput
    _response_schema: Type[GetMethodBodyOutput] = GetMethodBodyOutput
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def execute(self, request_data: GetMethodBodyInput) -> GetMethodBodyOutput:
        try:
            self.load_fqdn_cache(request_data.repo_path)
            method_artefacts = self.get_method_artefacts(
                request_data.class_name,
                request_data.method_name,
                request_data.repo_path,
            )
            return GetMethodBodyOutput(result=method_artefacts["body_ans"])
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetMethodBody: {e}")
