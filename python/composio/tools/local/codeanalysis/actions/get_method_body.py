import os
from pathlib import Path
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
        description="Name of the class containing the target method",
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
    This tool retrieves the body of a specified method from a given repository.

    Use this action when you need to:
    1. Obtain the complete implementation of a specific method.
    2. Extract method details for documentation or code review purposes.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    Usage example:
    repo_name: django
    class_name: Field
    method_name: run_validators
    """

    display_name = "Get Method Body"
    _tags = ["index"]

    def execute(
        self, request: GetMethodBodyRequest, metadata: Dict
    ) -> GetMethodBodyResponse:
        repo_name = os.path.basename(request.repo_name)
        repo_path = Path.home() / repo_name

        self.load_fqdn_cache(repo_name)
        method_artefacts = self.get_method_artefacts(
            request.class_name,
            request.method_name,
            repo_path,
        )
        return GetMethodBodyResponse(result=method_artefacts["body_ans"])
