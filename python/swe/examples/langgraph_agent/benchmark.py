import argparse

from langchain_core.messages import HumanMessage

from composio_langgraph import Action

from swekit.benchmark.run_evaluation import evaluate
from swekit.config.store import IssueConfig

from agent import composio_toolset, graph


def bench(workspace_id: str, issue_config: IssueConfig) -> str:
    """Run benchmark on the agent."""

    # Set the workspace for the tools to run.
    composio_toolset.set_workspace_id(workspace_id)

    # get the git tree
    git_tree_response = composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_REPO_TREE,
        params={},
    )
    print("Result of git tree", git_tree_response)

    # kick off the crew on the issue.
    try:
        final_state = graph.invoke(
            {
                "messages": [
                    HumanMessage(
                        content=f"{issue_config.issue_desc} in the repo: {issue_config.repo_name}. Output to git tree command {git_tree_response}"
                    )
                ]
            },
            {"recursion_limit": 50},
        )

        print(final_state["messages"][-1].content)
        return final_state["messages"][-1].content
    except Exception as e:
        print(e)
        return "Error found"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run benchmark on the agent.",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--test-split",
        type=str,
        default="1:2",
        help="Test split ratio (e.g. 1:2, 1:300) Maximum 300 tests per project.",
    )
    group.add_argument(
        "--test-instance-ids",
        type=str,
        default="",
        help="Test instance ids (comma-separated)",
    )
    args = parser.parse_args()

    if args.test_instance_ids:
        test_instance_ids_list = [
            id.strip() for id in args.test_instance_ids.split(",")
        ]
        test_range = "1:300"
    else:
        test_instance_ids_list = []
        test_range = args.test_split

    evaluate(
        bench,
        dry_run=False,
        test_range=test_range,
        test_instance_ids=test_instance_ids_list,
    )
