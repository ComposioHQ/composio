# pylint: disable=logging-fstring-interpolation

import asyncio
import datetime
import os
from pathlib import Path

import docker
from composio_crewai import ComposioToolSet
from datasets import load_dataset
from docker import errors as docker_errors
from swekit.benchmark.constants import MODEL_GPT4
from swekit.benchmark.get_score_card import generate_scorecard
from swekit.benchmark.setup_test_bed import create_patches_file

from composio import Action
from composio.tools.env.constants import DEFAULT_IMAGE
from composio.tools.env.factory import ExecEnv, WorkspaceFactory
from composio.utils.logging import get as get_logger
from swe.swe_bench_docker.evaulate_on_docker import EvaluateOnDockerArgs, evaluate


DATASET_NAME = "princeton-nlp/SWE-bench_Lite"
PATH_TESTBED = "testbed/"


logger = get_logger(name="run_evaluation")


def get_issues_dataset(test_split):
    test_dataset = load_dataset(
        DATASET_NAME,
        split=f"test[{test_split}]",
    )
    return test_dataset


def get_score(logs_dir):
    prediction_patches_path, dataset_on_disk_path = create_patches_file(
        logs_dir, DATASET_NAME
    )
    logger.info(
        f"logs dir: {logs_dir}, prediction_patches_path: {prediction_patches_path}"
    )
    evaluate_args = EvaluateOnDockerArgs(
        predictions_path=str(prediction_patches_path),
        swe_bench_tasks=os.path.expanduser(dataset_on_disk_path),
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


def get_workspace_from_repo_map(repo, repo_to_workspace_map, base_commit):
    workspace_id = repo_to_workspace_map.get(repo)
    if not workspace_id or not workspace_id.strip():
        return None
    composio_toolset = ComposioToolSet(
        workspace_env=ExecEnv.DOCKER, workspace_id=workspace_id
    )
    print("Resetting repository to base commit")
    workspace_id = repo_to_workspace_map[repo]
    composio_toolset.execute_action(
        action=Action.GITCMDTOOL_GITHUB_CLONE_CMD,
        params={
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    return workspace_id


def create_workspace_from_image(repo, repo_to_image_id_map, base_commit):
    if not repo_to_image_id_map.get(repo):
        logger.info("repo: %s not found in repo-to-image-map", repo)
        return ""
    logger.info("Using saved image")
    start_time = datetime.datetime.now()
    workspace = WorkspaceFactory.new(
        env=ExecEnv.DOCKER, image=repo_to_image_id_map[repo]
    )
    workspace_id = workspace.id
    workspace_creation_time = datetime.datetime.now() - start_time
    composio_toolset = ComposioToolSet(workspace_id=workspace_id)
    cd_resp = composio_toolset.execute_action(
        action=Action.SHELL_EXEC_COMMAND,
        params={
            "cmd": f"cd /{repo.split('/')[-1]}",
        },
    )
    if isinstance(cd_resp, dict) and cd_resp.get("status") == "failure":
        raise Exception(f"Error changing directory: {cd_resp['details']}")
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace_id,
        workspace_creation_time,
    )
    logger.info("Resetting repository to base commit")
    reset_resp = composio_toolset.execute_action(
        action=Action.GITCMDTOOL_GITHUB_CLONE_CMD,
        params={
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    if isinstance(reset_resp, dict) and reset_resp.get("status") == "failure":
        raise Exception(f"Error resetting repository: {reset_resp['details']}")
    return workspace_id


def build_image_and_container(repo, repo_to_workspace_map, base_commit):
    logger.info("Falling back to creating new workspace.")
    start_time = datetime.datetime.now()
    workspace = WorkspaceFactory.new(
        env=ExecEnv.DOCKER,
        image=DEFAULT_IMAGE,
    )
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace.id,
        workspace_creation_time,
    )
    composio_toolset = ComposioToolSet(workspace_id=workspace.id)

    start_time = datetime.datetime.now()
    clone_resp = composio_toolset.execute_action(
        entity_id="123",
        action=Action.GITCMDTOOL_GITHUB_CLONE_CMD,
        params={
            "repo_name": repo,
            "commit_id": base_commit,
        },
    )
    if (
        isinstance(clone_resp, dict)
        and "status" in clone_resp
        and clone_resp["status"] == "failure"
    ):
        raise Exception(clone_resp["details"])
    git_clone_time = datetime.datetime.now() - start_time
    logger.info("git clone completed, time taken: %s", git_clone_time)
    repo_to_workspace_map[repo] = workspace.id
    return workspace.id


def setup_workspace(repo, repo_to_workspace_map, repo_to_image_id_map, base_commit):
    workspace_id = get_workspace_from_repo_map(
        repo=repo, repo_to_workspace_map=repo_to_workspace_map, base_commit=base_commit
    )
    if workspace_id:
        return workspace_id
    workspace_id = create_workspace_from_image(
        repo=repo, repo_to_image_id_map=repo_to_image_id_map, base_commit=base_commit
    )
    if workspace_id:
        return workspace_id
    return build_image_and_container(
        repo=repo, repo_to_workspace_map=repo_to_workspace_map, base_commit=base_commit
    )


def check_and_pull_image(image_name):
    """
    Check if a Docker image exists locally, and pull it if it does not.

    Args:
        image_name (str): The name of the image with tag (e.g., 'repository/image:tag').

    Returns:
        bool: True if the image is available locally or was successfully pulled,
              False if the image could not be pulled due to an error.
    """
    client = docker.from_env()
    image_available = False

    try:
        # Attempt to get the image locally
        client.images.get(image_name)
        logger.info(f"Image already exists locally: {image_name}")
        image_available = True
    except docker_errors.ImageNotFound:
        # Image not found locally, need to pull
        logger.info(f"Image not found locally. Attempting to pull: {image_name}")
    except docker_errors.APIError as e:
        logger.error(f"API error occurred while checking the image: {e}")

    # If the image was not found, try pulling it
    if not image_available:
        try:
            client.images.pull(image_name)
            logger.info(f"Successfully pulled the image: {image_name}")
            image_available = True
        except docker_errors.APIError as e:
            logger.error(f"Failed to pull the image {image_name}: {e}")
            image_available = False

        finally:
            client.close()
    return image_available
