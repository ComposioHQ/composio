from inputs import from_github
from langchain_core.messages import HumanMessage

from composio_langgraph import Action

from agent import composio_toolset, graph


def main() -> None:
    """Run the agent."""
    repo, issue = from_github()
    try:
        final_state = graph.invoke(
            {"messages": [HumanMessage(content=f"{issue} in the repo: {repo}")]},
            {"recursion_limit": 50},
        )

        print(final_state["messages"][-1].content)
        return final_state["messages"][-1].content
    except Exception as e:
        print(e)
    response = composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_PATCH,
        params={},
    )
    if response.get("error") and len(response["error"]) > 0:
        print("Error:", response["error"])
    elif response.get("patch"):
        print("=== Generated Patch ===\n" + response["patch"])
    else:
        print("No output available")


if __name__ == "__main__":
    main()
