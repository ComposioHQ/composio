import os
from typing import Dict, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.base_action import MethodAnalysisAction
from composio.tools.local.codeanalysis.actions.create_codemap import (
    CreateCodeMap,
    CreateCodeMapRequest,
)


class GetMethodBodyRequest(BaseModel):
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

    Use this action when you need to Obtain the complete implementation of a specific method.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    Usage example:
    class_name: Field
    method_name: run_validators

    2. If no class name is provided, it retrieves the method from the global scope.
    Usage example:
    method_name: run_validators
    """

    display_name = "Get Method Body"
    _tags = ["index"]

    def execute(
        self, request: GetMethodBodyRequest, metadata: Dict
    ) -> GetMethodBodyResponse:
        CreateCodeMap().execute(CreateCodeMapRequest(), metadata)
        repo_name = os.path.basename(metadata["dir_to_index_path"])

        self.load_fqdn_cache(repo_name)
        method_artefacts = self.get_method_artefacts(
            query_class_name=request.class_name,
            query_method_name=request.method_name,
            repo_path=metadata["dir_to_index_path"],
        )
        return GetMethodBodyResponse(result=method_artefacts["body_ans"])
