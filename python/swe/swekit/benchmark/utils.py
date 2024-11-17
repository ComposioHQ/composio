# pylint: disable=logging-fstring-interpolation
import concurrent.futures
import datetime
import glob
import json
import typing as t

import docker
from datasets import Dataset, load_dataset
from docker import errors as docker_errors
from swebench.harness.run_evaluation import main as run_evaluation
from tenacity import retry, stop_after_attempt, wait_exponential

from composio import Action, ComposioToolSet, WorkspaceFactory, WorkspaceType
from composio.tools.env.constants import DEFAULT_IMAGE
from composio.utils.logging import get as get_logger
from composio.utils.url import get_api_url_base


logger = get_logger(name="run_evaluation")


def get_issues_dataset(dataset_name, test_split, test_instance_ids=[]) -> Dataset:
    test_dataset = t.cast(
        Dataset,
        load_dataset(
            dataset_name,
            split=f"test[{test_split}]",
        ),
    )
    logger.info(f"Original test_dataset size: {len(test_dataset)}")
    logger.info(f"Number of test_instance_ids: {len(test_instance_ids)}")
    logger.info(f"First few test_instance_ids: {test_instance_ids[:5]}")

    if len(test_instance_ids) > 0:
        test_dataset = test_dataset.filter(
            lambda x: x["instance_id"] in test_instance_ids
        )

    logger.info(f"Filtered test_dataset size: {len(test_dataset)}")
    return test_dataset


def get_score(logs_dir, run_id, dataset_name):
    temp = []
    for files in glob.glob(f"{logs_dir}/agent_logs_*.json"):
        pred = json.load(open(files, "r"))
        for key, value in pred.items():
            temp.append(
                {
                    "instance_id": key,
                    "model_patch": value[0]["agent_output"],
                    "model_name_or_path": "composio",
                }
            )
    with open(f"{logs_dir}/predictions.json", "w") as f:
        json.dump(temp, f, indent=4)

    run_evaluation(
        dataset_name=dataset_name,
        split="test",
        instance_ids=[],
        predictions_path=f"{logs_dir}/predictions.json",
        max_workers=4,
        open_file_limit=4096,
        timeout=1800,
        force_rebuild=False,
        cache_level="env",
        clean=False,
        run_id=run_id,
    )


def build_issue_description(repo, hints, problem_statement, include_hints):
    if not problem_statement or not problem_statement.strip():
        raise ValueError("problem statement is empty")
    tmpl = f"""You have the repository {repo} cloned in the workspace. You are at the root of the repository. Here is the issue, that you have to solve all on your own:\n\n{problem_statement}\n\n. You can only make changes in the core repository {repo}.\n\n"""  # noqa: E501
    if include_hints and hints:
        tmpl += f"""\n\nHere are few hints to solve the issue described in problem_statement: \n{hints}"""

    return tmpl


@retry(stop=stop_after_attempt(1), wait=wait_exponential(multiplier=1, min=4, max=10))
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
                composio_base_url=composio_toolset._base_url or get_api_url_base(),
                github_access_token=composio_toolset._try_get_github_access_token_for_current_entity(),
            ),
        )
    elif workspace_env == WorkspaceType.E2B:
        workspace = WorkspaceFactory.new(
            config=WorkspaceType.E2B(
                composio_api_key=composio_toolset.api_key,
                composio_base_url=composio_toolset._base_url or get_api_url_base(),
            )
        )
    else:
        raise ValueError(f"Unsupported workspace environment: {workspace_env}")
    logger.info("Workspace created")
    workspace_creation_time = datetime.datetime.now() - start_time
    logger.info(
        "workspace is created, workspace-id is: %s, creation time: %s",
        workspace.id,
        workspace_creation_time,
    )

    start_time = datetime.datetime.now()
    composio_toolset.set_workspace_id(workspace_id=workspace.id)

    if not image_name.startswith("composio/swe"):
        clone_resp = composio_toolset.execute_action(
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

        git_clone_time = datetime.datetime.now() - start_time
        logger.info("git clone completed, time taken: %s", git_clone_time)
    else:
        composio_toolset.execute_action(
            action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
            params={"path": repo.split("/")[-1]},
        )
        reset_resp = composio_toolset.execute_action(
            action=Action.FILETOOL_GIT_CLONE,
            params={
                "repo_name": repo,
                "commit_id": base_commit,
                "just_reset": True,
            },
        )
        if (
            isinstance(reset_resp, dict)
            and "success" in reset_resp
            and not reset_resp["success"]
        ):
            raise Exception(reset_resp["error"])

        git_clone_time = datetime.datetime.now() - start_time
        logger.info("git reset completed, time taken: %s", git_clone_time)

    return workspace.id


def setup_workspace(
    repo,
    repo_to_workspace_map,
    repo_to_image_id_map,
    base_commit,
    workspace_env=WorkspaceType.Docker,
    image_name=DEFAULT_IMAGE,
    num_instances=1,
):
    workspace_ids = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_instances) as executor:
        futures = [
            executor.submit(
                build_image_and_container,
                repo=repo,
                base_commit=base_commit,
                workspace_env=workspace_env,
                image_name=image_name,
            )
            for _ in range(num_instances)
        ]
        workspace_ids = [
            future.result() for future in concurrent.futures.as_completed(futures)
        ]
    repo_to_workspace_map[repo] = workspace_ids
    return workspace_ids


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
    get_score(
        logs_dir="/Users/shrey/.composio_coder/logs/17286398988283/",
        run_id="langgraph_agent_temp",
        dataset_name="princeton-nlp/SWE-bench_Verified",
    )
