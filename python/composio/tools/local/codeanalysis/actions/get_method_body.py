from typing import Dict, Optional, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction


class GetMethodBodyRequest(BaseModel):
    repo_name: str = Field(
        ...,
        description="Name of the repository. It should be the last part of valid github repository name. It should not contain any '/'.",
    )
    class_name: Optional[str] = Field(
        None,
        description="Fully qualified name of the class containing the target method",
    )
    method_name: str = Field(
        ..., description="Name of the method whose body is to be retrieved"
    )


class GetMethodBodyResponse(BaseModel):
    result: str = Field(
        ...,
        description="Retrieved method body as a string, including any decorators and comments",
    )


class GetMethodBody(
    LocalAction[GetMethodBodyRequest, GetMethodBodyResponse], MethodAnalysisAction
):
    """
    Retrieves the body of a specified method.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    The retrieved body includes any decorators and comments associated with the method.
    """

    _display_name = "Get Method Body"
    _request_schema: Type[GetMethodBodyRequest] = GetMethodBodyRequest
    _response_schema: Type[GetMethodBodyResponse] = GetMethodBodyResponse
    _tags = ["index"]
    _tool_name = "codeanalysis"

    def execute(
        self, request: GetMethodBodyRequest, metadata: Dict
    ) -> GetMethodBodyResponse:
        try:
            repo_path = request.repo_name
            if "/" in repo_path:
                repo_path = repo_path.split("/")[-1]
            self.load_fqdn_cache(repo_path)
            method_artefacts = self.get_method_artefacts(
                request.class_name,
                request.method_name,
                repo_path,
            )
            return GetMethodBodyResponse(result=method_artefacts["body_ans"])
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetMethodBody: {e}")
