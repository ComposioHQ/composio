import argparse
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_core.messages import HumanMessage

from composio_langgraph import Action

from swekit.benchmark.run_evaluation import evaluate
from swekit.config.store import IssueConfig

from agent import get_agent_graph


def bench(workspace_id: str, issue_config: IssueConfig) -> str:
    """Run benchmark on the agent."""

    # Set the workspace for the tools to run.
    # import pdb; pdb.set_trace()
    graph, composio_toolset = get_agent_graph(repo_name=issue_config.repo_name.split("/")[-1] , workspace_id=workspace_id)
    
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
        return final_state["messages"][-1].content
    except Exception as e:
        print(f"Error in graph.invoke: {e}")
        return "Error in graph.invoke"


def run_instance(instance_id):
    # Set the LANGCHAIN_PROJECT environment variable for this thread
    os.environ['LANGCHAIN_PROJECT'] = instance_id
    # ... rest of the function implementation ...

def main(args):
    # ... existing code ...

    with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        # Use executor.submit instead of executor.map
        futures = [executor.submit(run_instance, instance_id) for instance_id in args.test_instance_ids]
        
        # Wait for all futures to complete
        for future in futures:
            future.result()

    # ... rest of the main function ...

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
        test_range = "0:500"
    else:
        test_instance_ids_list = []
        test_range = args.test_split
    
    # with ThreadPoolExecutor(max_workers=3) as executor:
    #     futures = []
    #     for test_id in test_instance_ids_list:
    #         futures.append(executor.submit(run_evaluate, test_id))
        
    #     for future in as_completed(futures):
    #         result = future.result()
    #         print(f"Completed evaluation for test instance: {result}")

    evaluate(
        bench,
        dry_run=False,
        test_range=test_range,
        include_hints=False,
        test_instance_ids=test_instance_ids_list,
        run_id=f"langgraph_agent",
        #image_name="composio/composio:dev", # if you are doing local dev
    )
