import typing as t
from typing import Type
from praisonai_tools import BaseTool
from composio_praisonai import ComposioToolSet
from langchain.pydantic_v1 import BaseModel, Field



class SERPAPI_SEARCH_PARAMS(BaseModel):
	query: str = Field(description="The search query for the SERP API.")

class SERPAPI_SEARCH_TOOL(BaseTool):
	name: str = "SERPAPI_SEARCH_TOOL"
	description: str = "Perform a Google search using the SERP API."
	args_schema: Type[BaseModel] = SERPAPI_SEARCH_PARAMS

	def _run(self, **kwargs: t.Any) -> t.Any:
		toolset = ComposioToolSet(entity_id='default')
		return toolset.execute_tool(
			tool_identifier="serpapi_search",
			params=kwargs,
		)