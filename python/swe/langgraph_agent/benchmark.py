import argparse
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_core.messages import HumanMessage
from typing import List
from composio_langgraph import Action

from swekit.benchmark.run_evaluation import evaluate
from swekit.config.store import IssueConfig
from langchain_aws import BedrockChat
import ast
from agent import get_agent_graph
import re
import random

bedrock_client = BedrockChat(
                credentials_profile_name="default",
                model_id="anthropic.claude-3-5-sonnet-20240620-v1:0",
                region_name="us-east-1",
                model_kwargs={"temperature": 0}
            )

def build_comparison_prompt(repo_name: str, issue_desc: str, patches: List[str]) -> str:
    patch_str = "\n".join(["="*50 + f"\nPatch {i+1}:\n{patch}" for i, patch in enumerate(patches)]+["="*50])    
    return """
I facing the following issue in the repo {repo_name}. You have an older version of the codebase, so you your belief about the 
codebase might be outdated.

Issue Description:
{issue_desc}

You are given multiple patches and you need to check which one fixes the issue. 
Only one of the patch will fix the issue.

{patch_str}

First analyse all the patches thoroughly and then choose the best patch that fixes the issue. You need to 
consider all the edge cases very carefully. The chosen patch might be more verbose, but it should pass all the 
possible test cases regarding the issue.

Provide your response in the following format:
{{
    "patch": "The number of the patch that best fixes the issue (1 or 2)",
    "reasoning": "Your explanation for why the chosen patch fixes the issue",
}}
""".format(repo_name=repo_name, issue_desc=issue_desc, patch_str=patch_str)

def bench(workspace_ids: str, issue_config: IssueConfig) -> str:
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(run_agent_function, workspace_id, issue_config) for workspace_id in workspace_ids]
        patches = [future.result() for future in as_completed(futures)]
    
    response = bedrock_client.invoke(
        [
            ("system", "You are a software engineer expert at solving bugs."),
            ("human", build_comparison_prompt(repo_name=issue_config.repo_name.split("/")[-1], issue_desc=issue_config.issue_desc, patches=patches))
        ]
    )
    print("Response", response)
    if response.content:
        try:
            match = re.search(r'patch.*?(\d+)', response.content, re.IGNORECASE)
            if match:
                patch_number = int(match.group(1))
                if 1 <= patch_number <= len(patches):
                    return patches[patch_number - 1]
            
            print("\n"*10)
            return random.choice(patches)
        except Exception as e:
            print("\n"*10)
            print(f"Error in response: {e}")
            return random.choice(patches)
    else:
        print("\n"*10)
        print("No response content found")
        return random.choice(patches)

def run_agent_function(workspace_id: str, issue_config: IssueConfig) -> str:
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

    cd_response = composio_toolset.execute_action(
        action=Action.SHELLTOOL_EXEC_COMMAND,
        params={"cmd": f"cd ~/{issue_config.repo_name.split('/')[-1]}"},
    )
    print("Result of cd", cd_response)

    # kick off the crew on the issue.

    try:
        graph.invoke(
            {
                "messages": [
                    HumanMessage(
                        content=f"{issue_config.issue_desc} in the repo: {issue_config.repo_name}. Output to git tree command {git_tree_response}"
                    )
                ]
            },
            {"recursion_limit": 60},
        )
        cwd_response = composio_toolset.execute_action(
            action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
            params={"path": f"/home/user/{issue_config.repo_name.split('/')[-1]}"},
        )
        print("Result of pwd", cwd_response)
        get_patch_resp = composio_toolset.execute_action(
            action=Action.FILETOOL_GIT_PATCH,
            params={},
        )

        print(f"Get patch response: {get_patch_resp}")
        if not get_patch_resp.get("successfull", False):
            error_message = get_patch_resp.get("error")
            if error_message:
                raise Exception(f"Error in get_patch: {error_message}")
            else:
                raise Exception("Unknown error occurred in get_patch")

        patch_data = get_patch_resp.get("data", {})
        if not patch_data:
            raise Exception("No data found in the patch response")

        patch = patch_data.get("patch")
        if not patch:
            error = patch_data.get("error")
            if error:
                print(f"Error in patch data: {error}")
                return None
            else:
                print("No patch found in the response data")
                return None

        print(f"Final Patch: {patch}")
        return patch
    except Exception as e:
        print(f"Error in graph.invoke: {e}")
        return ""

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run benchmark on the agent.",
    )
    # group = parser.add_mutually_exclusive_group()
    parser.add_argument(
        "--test-split",
        type=str,
        default="1:2",
        help="Test split ratio (e.g. 1:2, 1:300) Maximum 500 tests per project.",
    )
    parser.add_argument(
        "--test-instance-ids",
        type=str,
        default="",
        help="Test instance ids (comma-separated)",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default="temp",
        help="Run id",
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
    
    evaluate(
        bench,
        dry_run=False,
        test_range=test_range,
        include_hints=False,
        test_instance_ids=test_instance_ids_list,
        run_id=args.run_id,
        #image_name="composio/composio:dev", # if you are doing local dev
    )
