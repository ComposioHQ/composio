from inputs import set_workspace
from langchain_core.messages import HumanMessage
import traceback
import json
from composio_langgraph import Action

from agent import get_agent_graph


def main() -> None:
    """Run the agent."""
    repo, repo_path, issue = set_workspace()
    owner, repo_name = repo.split("/")

    graph, composio_toolset, run_file = get_agent_graph(
        repo_path=repo_path,
        workspace_id=""
    )
    composio_toolset.execute_action(
        action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
        params={"path": repo_path},
    )
    composio_toolset.execute_action(
        action=Action.CODE_ANALYSIS_TOOL_CREATE_CODE_MAP,
        params={},
    )
    try:
        final_state = graph.invoke(
            {"messages": [HumanMessage(content=f"{issue} in the repo: {repo}")]},
            {"recursion_limit": 50},
        )
        print(final_state["messages"][-1].content)
    except Exception as e:
        print("Error raised while agent execution: \n", traceback.format_exc())
    
    get_patch_resp = composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_PATCH,
        params={},
    )

    if not get_patch_resp.get("successful", False): 
        print("Error:", get_patch_resp.get("error"))
    patch_data = get_patch_resp.get("data", {})
    if patch_data:
        patch = patch_data.get("patch", "")
        if patch:
            print("=== Generated Patch ===\n" + patch)
    else:
        print("No output available")

    
    #########
    # Create a PR with the generated patch
    #########

    composio_toolset.execute_action(
        action=Action.SHELLTOOL_EXEC_COMMAND,
        params={"cmd": "git checkout -b test-branch"},
    )

    composio_toolset.execute_action(
        action=Action.SHELLTOOL_EXEC_COMMAND,
        params={"cmd": f"git add -u && git commit -m 'test-commit'"},
    )

    composio_toolset.execute_action(
        action=Action.SHELLTOOL_EXEC_COMMAND,
        params={"cmd": "git push --set-upstream origin test-branch"},
    )

    composio_toolset.execute_action(
        action=Action.GITHUB_CREATE_A_PULL_REQUEST,
        params={
            "owner": owner,
            "repo": repo_name,
            "head": "test-branch",
            "base": "master",
        },
    )  



if __name__ == "__main__":
    main()
