# pylint: disable=logging-fstring-interpolation

import asyncio
import datetime
import os
import typing as t
from pathlib import Path

import docker
from datasets import Dataset, load_dataset
from docker import errors as docker_errors

from composio import Action, WorkspaceFactory, WorkspaceType
from composio.tools.env.constants import DEFAULT_IMAGE
from composio.utils.logging import get as get_logger
from composio.utils.url import get_api_url_base

from composio_crewai import ComposioToolSet

from swekit.benchmark.constants import MODEL_GPT4
from swekit.benchmark.docker_utils.evaulate_on_docker import (
    EvaluateOnDockerArgs,
    evaluate,
)
from swekit.benchmark.get_score_card import generate_scorecard
from swekit.benchmark.setup_test_bed import create_patches_file


DATASET_NAME = "princeton-nlp/SWE-bench_Lite"
PATH_TESTBED = "testbed/"


logger = get_logger(name="run_evaluation")


def get_issues_dataset(test_split, test_instance_ids=[]) -> Dataset:
    test_dataset = t.cast(
        Dataset,
        load_dataset(
            DATASET_NAME,
            split=f"test[{test_split}]",
        ),
    )
    print(f"Original test_dataset size: {len(test_dataset)}")
    print(f"Number of test_instance_ids: {len(test_instance_ids)}")
    print(f"First few test_instance_ids: {test_instance_ids[:5]}")

    if len(test_instance_ids) > 0:
        test_dataset = test_dataset.filter(
            lambda x: x["instance_id"] in test_instance_ids
        )

    print(f"Filtered test_dataset size: {len(test_dataset)}")
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

    print("Resetting repository to base commit")
    composio_toolset = ComposioToolSet(workspace_id=workspace_id)
    composio_toolset.execute_action(
        action=Action.FILETOOL_GIT_CLONE,
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
    composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())
    workspace = WorkspaceFactory.new(
        config=WorkspaceType.Docker(
            image=repo_to_image_id_map[repo],
            composio_api_key=composio_toolset.api_key,
            composio_base_url=composio_toolset.base_url or get_api_url_base(),
            github_access_token=composio_toolset._try_get_github_access_token_for_current_entity(),
        ),
    )
    workspace_id = workspace.id
    composio_toolset.set_workspace_id(
        workspace_id=workspace_id,
    )

    workspace_creation_time = datetime.datetime.now() - start_time
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
        action=Action.FILETOOL_GIT_CLONE,
        params={
            "repo_name": repo,
            "just_reset": True,
            "commit_id": base_commit,
        },
    )
    if isinstance(reset_resp, dict) and not reset_resp.get("success"):
        raise Exception(f"Error resetting repository: {reset_resp['error']}")
    return workspace_id


def build_image_and_container(
    repo, base_commit, workspace_env=WorkspaceType.Docker, image_name=DEFAULT_IMAGE
):
    logger.info("Falling back to creating new workspace.")
    start_time = datetime.datetime.now()
    composio_toolset = ComposioToolSet()
    if workspace_env == WorkspaceType.Docker:
        workspace = WorkspaceFactory.new(
            WorkspaceType.Docker(
                image=image_name,
                composio_api_key=composio_toolset.api_key,
                composio_base_url=composio_toolset.base_url or get_api_url_base(),
                github_access_token=composio_toolset._try_get_github_access_token_for_current_entity(),
            ),
        )
    elif workspace_env == WorkspaceType.E2B:
        workspace = WorkspaceFactory.new(
            config=WorkspaceType.E2B(
                composio_api_key=composio_toolset.api_key,
                composio_base_url=composio_toolset.base_url or get_api_url_base(),
            )
        )
    else:
        raise ValueError(f"Unsupported workspace environment: {workspace_env}")
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace.id,
        workspace_creation_time,
    )

    start_time = datetime.datetime.now()
    composio_toolset.set_workspace_id(workspace_id=workspace.id)
    clone_resp = composio_toolset.execute_action(
        entity_id="123",
        action=Action.FILETOOL_GIT_CLONE,
        params={
            "repo_name": repo,
            "commit_id": base_commit,
        },
    )
    if (
        isinstance(clone_resp, dict)
        and "success" in clone_resp
        and not clone_resp["success"]
    ):
        raise Exception(clone_resp["error"])

    # chwdir_resp = composio_toolset.execute_action(
    #     action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
    #     params={"path": repo.lstrip().rstrip().split("/")[-1]},  # todo: verify this
    # )
    # if isinstance(chwdir_resp, dict) and chwdir_resp.get("status") == "failure":
    #     raise Exception(f"Error changing directory: {chwdir_resp['details']}")
    git_clone_time = datetime.datetime.now() - start_time
    logger.info("git clone completed, time taken: %s", git_clone_time)
    return workspace.id


def setup_workspace(
    repo,
    repo_to_workspace_map,
    repo_to_image_id_map,
    base_commit,
    workspace_env=WorkspaceType.Docker,
    image_name=DEFAULT_IMAGE,
):
    # workspace_id = get_workspace_from_repo_map(
    #     repo=repo, repo_to_workspace_map=repo_to_workspace_map, base_commit=base_commit
    # )
    # if workspace_id:
    #     return workspace_id
    # if workspace_env == ExecEnv.DOCKER:
    #     workspace_id = create_workspace_from_image(
    #         repo=repo,
    #         repo_to_image_id_map=repo_to_image_id_map,
    #         base_commit=base_commit,
    #     )
    #     if workspace_id:
    #         return workspace_id
    workspace_id = build_image_and_container(
        repo=repo,
        base_commit=base_commit,
        workspace_env=workspace_env,
        image_name=image_name,
    )
    repo_to_workspace_map[repo] = workspace_id
    return workspace_id


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


if __name__ == "__main__":
    get_score(logs_dir="/Users/karanvaidya/.composio_coder/logs/1721819092")
