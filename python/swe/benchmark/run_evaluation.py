# pylint: disable=logging-fstring-interpolation

import argparse
import asyncio
import datetime
import logging
import os
import traceback
from pathlib import Path

from composio_swe.config.constants import (
    KEY_API_KEY,
    LOCAL_CACHE_DIRECTORY_NAME,
    LOGS_DIR,
)
from composio_swe.config.context import Context, get_context, set_context
from composio_swe.config.store import IssueConfig
from datasets import load_dataset
from rich.logging import RichHandler

from composio import Action, Composio
from composio.workspace.docker_workspace import LocalDockerArgumentsModel
from composio.workspace.workspace_factory import WorkspaceFactory, WorkspaceType
from swe.benchmark.get_score_card import MODEL_GPT4, generate_scorecard
from swe.benchmark.setup_test_bed import create_patches_file
from swe.examples.crewai_agent import CrewaiAgent, SWEArgs
from swe.swe_bench_docker.evaulate_on_docker import EvaluateOnDockerArgs, evaluate


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


def get_score(logs_dir=None):
    ctx = get_context()
    if logs_dir is None:
        logs_dir = ctx.agent_logs_dir
    prediction_patches_path, dataset_on_disk_path = create_patches_file(logs_dir, DATASET_NAME)
    print("logs dir: ", logs_dir)
    print("prediction_patches_path: ", prediction_patches_path)
    evaluate_args = EvaluateOnDockerArgs(
        predictions_path=str(prediction_patches_path),
        # docker_dir="./docker",
        swe_bench_tasks=os.path.expanduser(dataset_on_disk_path),
        namespace="techcomposio",
        log_dir=str(logs_dir),
    )
    asyncio.run(evaluate(**evaluate_args.model_dump()))
    prediction_path_dir = Path(prediction_patches_path).parent
    testbed_dir = prediction_path_dir / Path(PATH_TESTBED)
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    generate_scorecard(
        predictions_dir=prediction_path_dir,
        log_dir=str(logs_dir),
        swe_bench_path=DATASET_NAME,
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
    try:
        workspace_id = WorkspaceFactory.get_instance().create_workspace(
            workspace_type=WorkspaceType.DOCKER,
            local_docker_args=LocalDockerArgumentsModel(
                image_name=repo_to_image_id_map[repo]
            ),
        )
    except Exception as e:
        logger.error("Error creating workspace: %s", e)
        raise e
    cd_resp = composio_client.actions.execute(
        action=Action.SHELLCMDTOOL_RUNCOMMANDONWORKSPACE,
        params={
            "input_cmd": f"cd /{repo.split('/')[-1]}",
            "workspace_id": workspace_id,
        },
    )
    if isinstance(cd_resp, dict) and cd_resp["status"] == "failure":
        raise Exception(f"Error changing directory: {cd_resp['details']}")
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace_id,
        workspace_creation_time,
    )
    logger.info("Resetting repository to base commit")
    reset_resp = composio_client.actions.execute(
        action=Action.GITCMDTOOL_GITHUBCLONECMD,
        params={
            "workspace_id": workspace_id,
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    if isinstance(reset_resp, dict) and reset_resp["status"] == "failure":
        raise Exception(f"Error resetting repository: {reset_resp['details']}")
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


def run(test_split, print_only=False, include_hints=True, logs_dir=None):
    """
    Main function to load and display entries from the SWE-bench lite dataset.
    """

    issues = get_issues_dataset(test_split)
    repo_to_workspace_map = {}
    repo_to_image_id_map = {"django/django": "techcomposio/swe-bench-django_django"}
    for count, issue in enumerate(issues, 1):
        try:
            repo = issue["repo"]
            print(f"Processing {count}th issue with repoMap: {repo_to_workspace_map}")
            print(f"Repo: {repo}")
            print(f"Issue id: {issue['instance_id']}")

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
            print("Issue description (first 10 lines):")
            for line in issue_description.split("\n")[:10]:
                print(line)
            print("...")
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
            args = SWEArgs(agent_logs_dir=logs_dir or ctx.agent_logs_dir)
            coder = CrewaiAgent(args)
            coder.setup_and_solve(
                issue_config=ctx.issue_config, workspace_id=workspace_id
            )
        except Exception as e:
            print(f"Error processing issue {issue['instance_id']}:", e)
            traceback.print_exc()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run SWE-bench evaluation")
    parser.add_argument(
        "--test_split",
        type=str,
        default="20:40",
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
        default=True,
        help="Generate a report after running evaluations",
    )
    parser.add_argument(
        "--logs_dir",
        type=str,
        default=f"~/.composio_coder/logs",
        help="Logs directory",
    )

    args = parser.parse_args()

    # Make the log directory if it doesn't exist
    logs_dir = Path(args.logs_dir)
    if not logs_dir.exists():
        logs_dir.mkdir(parents=True)

    print("Starting evaluation with gen_report: ", args.gen_report)
    # run(args.test_split, args.print_only, args.include_hints, args.logs_dir)
    if args.gen_report:
        get_score(args.logs_dir)
