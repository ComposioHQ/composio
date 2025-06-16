# Python Example using execute_request
from composio import action, ComposioToolSet
import typing as t

toolset = ComposioToolSet()

@action(toolname="github") # Associate with GitHub app for auth
def get_github_repo_topics(
    owner: t.Annotated[str, "Repository owner username"],
    repo: t.Annotated[str, "Repository name"],
    execute_request: t.Callable # Injected by Composio
) -> dict:
    """Gets the topics associated with a specific GitHub repository."""
    response_data = execute_request(
        endpoint=f"/repos/{owner}/{repo}/topics", # API path relative to base URL
        method="GET"
    )
    if isinstance(response_data, dict):
        return {"topics": response_data.get("names", [])}