import datetime
import json
import os
import typing as t
from pathlib import Path

from pydantic import BaseModel, Field
from tqdm import tqdm

from composio import Action, WorkspaceConfigType, WorkspaceFactory, WorkspaceType
from composio.tools.env.constants import DEFAULT_IMAGE
from composio.utils.logging import WithLogger

from composio_crewai import ComposioToolSet

from swekit.benchmark.utils import (
    build_issue_description,
    get_issues_dataset,
    get_score,
    setup_workspace,
)
from swekit.config.constants import LOCAL_CACHE_DIRECTORY_NAME, LOGS_DIR
from swekit.config.store import IssueConfig


def _get_logs_dir() -> Path:
    """Logs dir factory."""
    return (
        Path.home()
        / LOCAL_CACHE_DIRECTORY_NAME
        / LOGS_DIR
        / str(int(datetime.datetime.now().timestamp()))
    )


class EvaluationConfig(BaseModel):
    """Benchmark evaluation config."""

    test_range: str = Field(
        default="20:30",
        description="slice for the test split range",
    )
    dry_run: bool = Field(
        default=False,
        description="dry-run will only print short issue description",
    )
    include_hints: bool = Field(
        default=False,
    )
    logs_dir: Path = Field(
        default_factory=_get_logs_dir,
        description="Logs directory",
    )
    generate_report: bool = Field(
        default=True,
        description="generate evaluation report after running evaluation",
    )
    test_instance_ids: t.List[str] = Field(
        default=[],
        description="test instance ids",
    )
    workspace_type: t.Type[WorkspaceConfigType] = Field(
        default=WorkspaceType.Docker,
        description="workspace environment",
    )
    image_name: str = Field(
        default=DEFAULT_IMAGE,
        description="image name",
    )


class EvaluationManager(WithLogger):
    """Benchmark evaluation manager."""

    def __init__(self, config: EvaluationConfig):
        """Initialize evaluation manager."""
        super().__init__()

        self.issues = get_issues_dataset(
            test_split=config.test_range,
            test_instance_ids=config.test_instance_ids,
        )
        self.dry_run = config.dry_run
        self.include_hints = config.include_hints
        self.logs_dir = os.path.expanduser(config.logs_dir)
        self.repo_to_workspace_map = {}
        self.repo_to_image_id_map = {}
        self.image_name = config.image_name
        self.workspace_env = config.workspace_type
        logs_dir = Path(config.logs_dir)
        if not logs_dir.exists():
            logs_dir.mkdir(parents=True)

    def get_issue_config(self, issue) -> IssueConfig:
        issue_description = build_issue_description(
            issue["hints_text"], issue["problem_statement"], self.include_hints
        )
        return IssueConfig(
            repo_name=issue["repo"],
            issue_id=issue["instance_id"],
            base_commit_id=issue["base_commit"],
            issue_desc=issue_description,
        )

    def get_patch_for_issue(self, workspace_id: str, issue):
        composio_toolset = ComposioToolSet(workspace_id=workspace_id)
        self.logger.info(
            f"Agent run finished, getting patch for issue: {issue['instance_id']}"
        )
        get_patch_resp = composio_toolset.execute_action(
            action=Action.FILETOOL_GIT_PATCH,
            params={},
        )
        if (
            isinstance(get_patch_resp, dict)
            and len(get_patch_resp.get("error", "")) > 0
        ):
            raise Exception(get_patch_resp)
        self.logger.info(f"Get patch response: {get_patch_resp}")
        patch = get_patch_resp.get("patch")  # type: ignore
        self.logger.info(f"Final Patch: {patch}")
        return patch

    def save_agent_run(self, issue_config, issue_patch):
        Path(str(self.logs_dir)).mkdir(parents=True, exist_ok=True)
        task_output_log = f"{self.logs_dir}/agent_logs_{datetime.datetime.now().strftime('%m_%d_%Y_%H_%M_%S')}.json"
        with open(task_output_log, "w", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        issue_config.issue_id: [
                            {
                                "agent_action": "final_patch",
                                "agent_output": issue_patch,
                            }
                        ]
                    }
                )
            )

    def show_info_and_exit(self):
        """
        Display information about the evaluation setup and exit.
        """
        info = {
            "Dry Run": self.dry_run,
            "Include Hints": self.include_hints,
            "Logs Directory": str(self.logs_dir),
            "Total Issues": len(self.issues),
            "Test Range": (
                self.issues.num_rows if hasattr(self.issues, "num_rows") else "Unknown"
            ),
            "Dataset Description": (
                self.issues.info.description
                if hasattr(self.issues, "info") and self.issues.info.description
                else "No description available"
            ),
            "Number of Features": (
                len(self.issues.features)
                if hasattr(self.issues, "features")
                else "Unknown"
            ),
            "Features": (
                list(self.issues.features.keys())
                if hasattr(self.issues, "features")
                else "Unknown"
            ),
        }
        print("Evaluation Setup Information:")
        for key, value in info.items():
            print(f"{key}: {value}")

    def run(self, agent_func: t.Callable):
        """
        Main function to load and display entries from the SWE-bench lite dataset.
        """
        if self.dry_run:
            self.show_info_and_exit()
            return

        for count, issue in tqdm(  # type: ignore
            iterable=enumerate(self.issues, 1),
            total=len(self.issues),
            desc="Processing issues",
        ):
            try:
                repo = issue["repo"]
                # version = issue.get("version")
                # image_name = (
                #     f"techcomposio/swe-bench-{repo.replace('/', '_')}-swe:{version}"
                # )
                # if version and check_and_pull_image(image_name):
                #     self.repo_to_image_id_map.setdefault(repo, image_name)
                self.logger.info(
                    f"Processing issue: {count} with repoMap: {self.repo_to_workspace_map} "
                    f"Repo: {repo} "
                    f"Issue id: {issue['instance_id']} "
                )

                workspace_id = setup_workspace(
                    repo,
                    self.repo_to_workspace_map,
                    self.repo_to_image_id_map,
                    issue["base_commit"],
                    self.workspace_env,
                    self.image_name,
                )
                issue_config = self.get_issue_config(issue)
                self.logger.debug(
                    "found patch-id: %s and install_commit_id: %s",
                    issue["patch"],
                    issue["environment_setup_commit"],
                )
                # run agent function with the specified agent-function
                agent_func(workspace_id, issue_config)
                issue_patch = self.get_patch_for_issue(workspace_id, issue)
                self.save_agent_run(issue_config, issue_patch)
                WorkspaceFactory.close(id=workspace_id)

            except Exception as e:
                self.logger.error(f"Error processing issue {issue['instance_id']}: {e}")
                raise e

    def score_evaluation(self):
        get_score(self.logs_dir)


def evaluate(
    runnable: t.Callable,
    test_range: str = "20:22",
    workspace_type: t.Type[WorkspaceConfigType] = WorkspaceType.Docker,
    dry_run: bool = True,
    include_hints: bool = True,
    logs_dir: Path = _get_logs_dir(),
    generate_report: bool = True,
    test_instance_ids: t.List[str] = [],
    image_name: str = DEFAULT_IMAGE,
) -> None:
    """Evaluate a callable."""
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir)

    manager = EvaluationManager(
        EvaluationConfig(
            test_range=test_range,
            dry_run=dry_run,
            include_hints=include_hints,
            logs_dir=logs_dir,
            generate_report=generate_report,
            test_instance_ids=test_instance_ids,
            workspace_type=workspace_type,
            image_name=image_name,
        )
    )
    manager.run(runnable)
    manager.score_evaluation()
