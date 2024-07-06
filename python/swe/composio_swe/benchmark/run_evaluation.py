# pylint: disable=logging-fstring-interpolation

import argparse
import asyncio
import datetime
import json
import os
import typing as t
from pathlib import Path
from pydantic import BaseModel, Field

import docker
from composio_crewai import ComposioToolSet
from composio_swe.benchmark.constants import MODEL_GPT4
from composio_swe.benchmark.get_score_card import generate_scorecard
from composio_swe.benchmark.setup_test_bed import create_patches_file
from composio_swe.config.constants import (
    KEY_API_KEY,
    LOCAL_CACHE_DIRECTORY_NAME,
    LOGS_DIR,
)
from composio_swe.config.context import Context, get_context, set_context
from composio_swe.config.store import IssueConfig
from datasets import load_dataset
from docker import errors as docker_errors
from tqdm import tqdm

from composio import Action
from composio.tools.env.factory import ExecEnv, WorkspaceFactory
from composio.utils.logging import get as get_logger
from swe.examples.crewai_agent import CrewaiAgent, SWEArgs
from swe.swe_bench_docker.evaulate_on_docker import EvaluateOnDockerArgs, evaluate


# get logger
LOGGER_NAME = "local_workspace"
DATASET_NAME = "princeton-nlp/SWE-bench_Lite"
PATH_TESTBED = "testbed/"


logger = get_logger(name="run_evaluation")


def get_issues_dataset(test_split):
    test_dataset = load_dataset(
        DATASET_NAME,
        split=f"test[{test_split}]",
    )
    return test_dataset


def get_score(logs_dir=None):
    if logs_dir is None:
        ctx = get_context()
        logs_dir = ctx.agent_logs_dir
    prediction_patches_path, dataset_on_disk_path = create_patches_file(
        logs_dir, DATASET_NAME
    )
    print("logs dir: ", logs_dir)
    print("prediction_patches_path: ", prediction_patches_path)
    evaluate_args = EvaluateOnDockerArgs(
        predictions_path=str(prediction_patches_path),
        # docker_dir="./docker",
        swe_bench_tasks=os.path.expanduser(dataset_on_disk_path),
        namespace="aorwall",
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
        image="sweagent/swe-agent",
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


def default_agent_func(workspace_id, issue_config):
    return CrewaiAgent(
        args=SWEArgs(agent_logs_dir=Path("")),
        workspace_id=workspace_id,
    ).setup_and_solve(issue_config=issue_config, workspace_id=workspace_id)


class EvaluationArgs(BaseModel):
    test_range: str = Field(default="20:30", description="slice for the test split range ")
    dry_run: bool = Field(default=False, description="dry-run will only print short issue description")
    include_hints: bool = Field(default=False)
    logs_dir: Path = Field(default=f"{Path.home()}/{LOCAL_CACHE_DIRECTORY_NAME}/{LOGS_DIR}/{int(datetime.datetime.now().timestamp())}",
        description="Logs directory",)
    generate_report: bool = Field(default=True, description="generate evaluation report after running evaluation")


class EvaluationManager:
    def __init__(self, eval_args: EvaluationArgs):
        self.issues = get_issues_dataset(eval_args.test_range)
        self.dry_run = eval_args.dry_run
        self.include_hints = eval_args.include_hints
        self.logs_dir = eval_args.logs_dir
        self.skip_evaluation = eval_args.skip_evaluation
        self.repo_to_workspace_map = {}
        self.repo_to_image_id_map = {}
        # Make the log directory if it doesn't exist
        logs_dir = Path(args.logs_dir)
        if not logs_dir.exists():
            logs_dir.mkdir(parents=True)

    def get_issue_config(self, issue) -> IssueConfig:
        issue_description = build_issue_description(
            issue["hints_text"], issue["problem_statement"], self.include_hints
        )
        logger.debug(
            f"starting agent for issue-id: {issue['instance_id']}\n"
            f"issue-description: {issue_description}\n"
            f"repo_name: {issue['repo']}\n"
        )
        return IssueConfig(
            repo_name=issue["repo"],
            issue_id=issue["instance_id"],
            base_commit_id=issue["base_commit"],
            issue_desc=issue_description,
        )

    def get_patch_for_issue(self, workspace_id: str, issue):
        composio_toolset = ComposioToolSet(workspace_id=workspace_id)
        logger.info(f"Agent run finished, getting path for issue: {issue['instance_id']}")
        get_patch_resp = composio_toolset.execute_action(
            action=Action.GITCMDTOOL_GET_PATCH_CMD,
            params={},
        )
        if (
                isinstance(get_patch_resp, dict)
                and get_patch_resp.get("status") == "failure"
        ):
            raise Exception(get_patch_resp["details"])
        logger.info(f"Get patch response: {get_patch_resp}")
        patch = get_patch_resp.get("stdout")  # type: ignore
        logger.info(f"Final Patch: {patch}")

    def save_agent_run(self, issue_config, issue_patch):
        Path(str(self.logs_dir)).mkdir(parents=True, exist_ok=True)
        task_output_log = f"{self.logs_dir}/agent_logs.json{datetime.datetime.now().strftime('%m_%d_%Y_%H_%M_%S')}.log"
        with open(task_output_log, "w", encoding="utf-8") as f:
            logs = {
                issue_config.issue_id: [
                    {
                        "agent_action": "final_patch",
                        "agent_output": issue_patch,
                    }
                ]
            }
            f.write(json.dumps(logs))

    def show_info_and_exit(self):
        """
        Display information about the evaluation setup and exit.
        """
        info = {
            "Dry Run": self.dry_run,
            "Include Hints": self.include_hints,
            "Logs Directory": str(self.logs_dir),
            "Skip Evaluation": self.skip_evaluation,
            "Total Issues": len(self.issues),
            "Test Range": self.issues.num_rows if hasattr(self.issues, 'num_rows') else 'Unknown',
            "Dataset Description": self.issues.info.description if hasattr(self.issues,
                                                                           'info') and self.issues.info.description else "No description available",
            "Number of Features": len(self.issues.features) if hasattr(self.issues, 'features') else 'Unknown',
            "Features": list(self.issues.features.keys()) if hasattr(self.issues, 'features') else 'Unknown'
        }
        print("Evaluation Setup Information:")
        for key, value in info.items():
            print(f"{key}: {value}")

    def run(self, agent_func: t.Callable = default_agent_func):
        """
          Main function to load and display entries from the SWE-bench lite dataset.
        """
        if self.dry_run:
            self.show_info_and_exit()
            return

        for count, issue in tqdm(
                enumerate(self.issues, 1), total=len(self.issues), desc="Processing issues"
        ):
            try:
                repo = issue["repo"]
                version = issue.get("version")
                image_name = (
                    f"techcomposio/swe-bench-{repo.replace('/', '_')}-swe:{version}"
                )
                if check_and_pull_image(image_name) and version:
                    self.repo_to_image_id_map.setdefault(repo, image_name)
                logger.info(f"Processing issue: {count} with repoMap: {self.repo_to_workspace_map}"
                            f"Repo: {repo}"
                            f"Issue id: {issue['instance_id']}")

                workspace_id = setup_workspace(
                    repo, self.repo_to_workspace_map, self.repo_to_image_id_map, issue["base_commit"]
                )
                issue_config = self.get_issue_config(issue)
                logger.info(
                    "found patch-id: %s and install_commit_id: %s", issue["patch"], issue["environment_setup_commit"]
                )
                # run agent function with the specified agent-function
                agent_func(workspace_id, issue_config)
                issue_patch = self.get_patch_for_issue(workspace_id, issue)
                self.save_agent_run(issue_config, issue_patch)

            except Exception as e:
                print(f"Error processing issue {issue['instance_id']}: {e}")
                raise e

    def score_evaluation(self):
        get_score(os.path.expanduser(self.logs_dir))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run SWE-bench evaluation")
    parser.add_argument("--test_range", type=str, default="20:22",help="Test split range (e.g., 1:10)")
    parser.add_argument("--dry_run", action="store_true", help="Just print the issues without running an agent")
    parser.add_argument("--include_hints", action="store_true", help="Include hints in the issue description")
    parser.add_argument("--gen_report", action="store_true", default=False, help="Generate a report after running evaluations")
    parser.add_argument("--logs_dir", type=str, help="Logs directory")

    args = parser.parse_args()

    eval_manager = EvaluationManager(EvaluationArgs(
        test_range=args.test_range,
        dry_run=args.dry_run,
        include_hints=args.include_hints,
        logs_dir=args.logs_dir,
        generate_report=args.gen_report
    ))
    eval_manager.run(default_agent_func)
    eval_manager.score_evaluation()

