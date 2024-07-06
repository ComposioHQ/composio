import typing as t
from typing import Type

from composio_praisonai import ComposioToolSet
from langchain.pydantic_v1 import BaseModel, Field
from praisonai_tools import BaseTool


class GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER_PARAMS(BaseModel):
    owner: str = Field(
        description="The account owner of the repository. The name is not case sensitive."
    )
    repo: str = Field(
        description="The name of the repository without the `.git` extension. The name is not case sensitive."
    )


class GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER_TOOL(BaseTool):
    name: str = "GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER_TOOL"
    description: str = "Note that you'll need to set `Content-Length` to zero when calling out to this endpoint. For more information, see '[HTTP method](https://docs.github.com/rest/guides/getting-started-with-the-rest-api#http-method).'"
    args_schema: Type[
        BaseModel
    ] = GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER_PARAMS

    def _run(self, **kwargs: t.Any):
        toolset = ComposioToolSet()
        return toolset.execute_tool(
            tool_identifier="github_activity_star_repo_for_authenticated_user",
            params=kwargs,
        )
