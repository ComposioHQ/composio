"""Test script to verify alternative arxiv implementation."""
import sys
from typing import List, Optional

import arxiv
from llama_index.core import Document
from llama_index.core.tools import BaseTool, FunctionTool
from pydantic import BaseModel, Field


class ArxivToolSpec(BaseModel):
    """Alternative implementation of ArxivToolSpec using arxiv package."""

    def to_tool_list(self) -> List[BaseTool]:
        """Convert to list of tools."""
        return [
            FunctionTool.from_defaults(
                fn=self.arxiv_search,
                name="arxiv_search",
                description="Search arxiv papers based on a query",
            )
        ]

    def arxiv_search(
        self,
        query: str = Field(..., description="The search query for arxiv papers"),
        max_results: Optional[int] = Field(
            default=5, description="Maximum number of results to return"
        ),
    ) -> List[Document]:
        """Search arxiv papers."""
        try:
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance,
            )
            papers = list(search.results())
            
            documents = []
            for paper in papers:
                content = (
                    f"Title: {paper.title}\n"
                    f"Authors: {', '.join(str(a) for a in paper.authors)}\n"
                    f"Published: {paper.published}\n"
                    f"URL: {paper.entry_id}\n"
                    f"Abstract: {paper.summary}"
                )
                doc = Document(text=content)
                documents.append(doc)
            
            return documents
        except Exception as e:
            print(f"Error searching arxiv: {str(e)}")
            return []


def test_arxiv_tool():
    """Test the alternative arxiv tool implementation."""
    try:
        tool = ArxivToolSpec()
        tools = tool.to_tool_list()
        print("Successfully created arxiv tool")
        
        # Test search functionality
        results = tool.arxiv_search("LLM agents function calling", max_results=2)
        if results:
            print(f"Successfully retrieved {len(results)} papers")
            print("\nFirst paper content:")
            print(results[0].text)
            return True
        else:
            print("No results found")
            return False
    except Exception as e:
        print(f"Test failed: {str(e)}")
        return False


if __name__ == "__main__":
    if not test_arxiv_tool():
        sys.exit(1)
