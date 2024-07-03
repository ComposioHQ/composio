# pylint: disable=logging-fstring-interpolation

import argparse
import datetime
import logging
import asyncio
from pathlib import Path
import os

from composio_swe.config.constants import KEY_API_KEY
from composio_swe.config.context import Context, set_context
from composio_swe.config.store import IssueConfig
from datasets import load_dataset
from composio_swe.config.context import get_context
from rich.logging import RichHandler

from composio import Action, Composio
from swe.swe_bench_docker.evaulate_on_docker import evaluate, EvaluateOnDockerArgs
from composio.workspace.docker_workspace import LocalDockerArgumentsModel
from composio.workspace.workspace_factory import WorkspaceFactory, WorkspaceType
from swe.examples.crewai_agent import CrewaiAgent, SWEArgs
from swe.benchmark.setup_test_bed import create_patches_file
from swe.benchmark.get_score_card import generate_scorecard, MODEL_GPT4


# get logger
LOGGER_NAME = "local_workspace"
DATASET_NAME = "princeton-nlp/SWE-bench_Lite"
PATH_TESTBED = "testbed/"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


def get_issues_dataset(test_split):
    test_dataset = load_dataset(
        DATASET_NAME,
        split=f"test[{test_split}]",
    )
    return test_dataset


def get_score():
    ctx = get_context()
    prediction_patches_path = create_patches_file(ctx.agent_logs_dir, DATASET_NAME)
    evaluate_args = EvaluateOnDockerArgs(
        predictions_path=prediction_patches_path,
        docker_dir="./docker",
        swe_bench_tasks=DATASET_NAME,
        namespace="aorwall",
        log_dir=ctx.agent_logs_dir + "/logs",
    )
    asyncio.run(evaluate(**evaluate_args.model_dump()))
    prediction_path_dir = Path(args.prediction_path_dir)
    testbed_dir = prediction_path_dir / Path(PATH_TESTBED)
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    generate_scorecard(
        predictions_dir=prediction_path_dir,
        log_dir=str(args.log_dir),
        swe_bench_path=args.swe_bench_path,
        model=MODEL_GPT4,
    )


def build_issue_description(hints, problem_statement, include_hints):
    if not problem_statement or not problem_statement.strip():
        raise ValueError("problem statement is empty")
    tmpl = f"""Here is the issue, that you have to solve all on your own:\n{problem_statement}"""
    if include_hints and hints:
        tmpl += f"""\n\nHere are few hints to solve the issue described in problem_statement: \n{hints}"""

    return tmpl


def get_workspace_from_repo_map(
    composio_client, repo, repo_to_workspace_map, base_commit
):
    workspace_id = repo_to_workspace_map.get(repo)
    if not workspace_id or not workspace_id.strip():
        return None
    print("Resetting repository to base commit")
    workspace_id = repo_to_workspace_map[repo]
    composio_client.actions.execute(
        action=Action.  # The `GITCMDTOOL_GITHUBCLONECMD` action is used to clone a GitHub repository
        # into a workspace. It takes parameters such as the workspace ID, the repository
        # name, and optionally a commit ID to specify which commit to clone. In the
        # provided code, this action is used to reset a repository to a specific base
        # commit before further processing or evaluation.
        GITCMDTOOL_GITHUBCLONECMD,
        params={
            "workspace_id": workspace_id,
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    return workspace_id


def create_workspace_from_image(
    composio_client, repo, repo_to_image_id_map, base_commit
):
    if not repo_to_image_id_map.get(repo):
        logger.info("repo: %s not found in repo-to-image-map", repo)
        return ""
    logger.info("Using saved image")
    start_time = datetime.datetime.now()
    workspace_id = WorkspaceFactory.get_instance().create_workspace(
        workspace_type=WorkspaceType.DOCKER,
        local_docker_args=LocalDockerArgumentsModel(
            image_name=repo_to_image_id_map[repo]
        ),
    )
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace_id,
        workspace_creation_time,
    )
    logger.info("Resetting repository to base commit")
    composio_client.actions.execute(
        action=Action.GITCMDTOOL_GITHUBCLONECMD,
        params={
            "workspace_id": workspace_id,
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    return workspace_id


def build_image_and_container(
    composio_client, repo, repo_to_workspace_map, base_commit
):
    logger.info("Falling back to creating new workspace.")
    start_time = datetime.datetime.now()
    workspace_id = WorkspaceFactory.get_instance().create_workspace(
        workspace_type=WorkspaceType.DOCKER,
        local_docker_args=LocalDockerArgumentsModel(image_name="sweagent/swe-agent"),
    )
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace_id,
        workspace_creation_time,
    )

    start_time = datetime.datetime.now()
    composio_client.actions.execute(
        entity_id="123",
        action=Action.GITCMDTOOL_GITHUBCLONECMD,
        params={
            "workspace_id": workspace_id,
            "repo_name": repo,
            "commit_id": base_commit,
        },
    )
    git_clone_time = datetime.datetime.now() - start_time
    logger.info("git clone completed, time taken: %s", git_clone_time)
    repo_to_workspace_map[repo] = workspace_id
    return workspace_id


def setup_workspace(repo, repo_to_workspace_map, repo_to_image_id_map, base_commit):
    composio_client = Composio()
    workspace_id = get_workspace_from_repo_map(
        composio_client, repo, repo_to_workspace_map, base_commit
    )
    if workspace_id:
        return workspace_id
    workspace_id = create_workspace_from_image(
        composio_client, repo, repo_to_image_id_map, base_commit
    )
    if workspace_id:
        return workspace_id
    return build_image_and_container(
        composio_client, repo, repo_to_workspace_map, base_commit
    )


def run(test_split, print_only=False, include_hints=True):
    """
    Main function to load and display entries from the SWE-bench lite dataset.
    """

    issues = get_issues_dataset(test_split)

    repo_to_workspace_map = {}
    repo_to_image_id_map = {}
    for count, issue in enumerate(issues, 1):
        try:
            repo = issue["repo"]
            print(f"Processing {count}th issue with repoMap: {repo_to_workspace_map}")
            print(f"Repo: {repo}")
            print(f"Issue id: {issue['instance_id']}")
            print(f"Issue description: {issue['problem_statement']}")

            if print_only:
                if include_hints:
                    print(f"Hints: {issue['hints_text']}")
                print("--------------------------------------------------")
                continue

            workspace_id = setup_workspace(
                repo, repo_to_workspace_map, repo_to_image_id_map, issue["base_commit"]
            )

            issue_description = build_issue_description(
                issue["hints_text"], issue["problem_statement"], include_hints
            )
            print(f"Issue description: {issue_description}")
            patch = issue["patch"]
            install_commit_id = issue["environment_setup_commit"]
            logger.info(
                "found patch-id: %s and install_commit_id: %s", patch, install_commit_id
            )
            issue_config = IssueConfig(
                repo_name=issue["repo"],
                issue_id=issue["instance_id"],
                base_commit_id=issue["base_commit"],
                issue_desc=issue_description,
            )
            logger.info(
                f"starting agent for issue-id: {issue['instance_id']}\n"
                f"issue-description: {issue_description}\n"
                f"repo_name: {issue['repo']}\n"
            )

            print("--------------------------------------------------")

            model_env_config = {
                KEY_API_KEY: "test-key",
                "azure_endpoint": "test-endpoint",
                "model_env": "azure",
            }
            ctx = Context()
            ctx.issue_config = issue_config
            ctx.model_env = model_env_config
            set_context(ctx)

            args = SWEArgs(agent_logs_dir=ctx.agent_logs_dir)
            coder = CrewaiAgent(args)
            coder.setup_and_solve(
                issue_config=ctx.issue_config, workspace_id=workspace_id
            )
        except Exception as e:
            print(f"Error processing issue {issue['instance_id']}: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run SWE-bench evaluation")
    parser.add_argument(
        "--test_split",
        type=str,
        default="1:10",
        help="Test split range (e.g., 1:10)",
    )
    parser.add_argument(
        "--print_only",
        action="store_true",
        help="Just print the issues without running an agent",
    )
    parser.add_argument(
        "--include_hints",
        action="store_true",
        help="Include hints in the issue description",
    )
    parser.add_argument(
        "--gen_report",
        action="store_true",
        default=False,
        help="Generate a report after running evaluations",
    )

    args = parser.parse_args()

    print("Starting evaluation")
    run(args.test_split, args.print_only, args.include_hints)
    if args.gen_report:
        get_score()
