# pylint: disable=logging-fstring-interpolation

import argparse
import datetime
import json
import os
import typing as t
from pathlib import Path

import swekit.benchmark.utils as eval_utils
from composio_crewai import ComposioToolSet
from pydantic import BaseModel, Field
from swekit.config.constants import LOCAL_CACHE_DIRECTORY_NAME, LOGS_DIR
from swekit.config.store import IssueConfig
from tqdm import tqdm

from composio import Action
from composio.utils.logging import WithLogger


def _get_logs_dir() -> Path:
    """Logs dir factory."""
    return (
        Path.home()
        / LOCAL_CACHE_DIRECTORY_NAME
        / LOGS_DIR
        / str(int(datetime.datetime.now().timestamp()))
    )


class EvaluationArgs(BaseModel):
    test_range: str = Field(
        default="20:30", description="slice for the test split range "
    )
    dry_run: bool = Field(
        default=False, description="dry-run will only print short issue description"
    )
    include_hints: bool = Field(
        default=False,
    )
    logs_dir: Path = Field(
        default_factory=_get_logs_dir,
        description="Logs directory",
    )
    generate_report: bool = Field(
        default=True, description="generate evaluation report after running evaluation"
    )


class EvaluationManager(WithLogger):
    def __init__(self, eval_args: EvaluationArgs):
        super().__init__()
        self.issues = eval_utils.get_issues_dataset(eval_args.test_range)
        self.dry_run = eval_args.dry_run
        self.include_hints = eval_args.include_hints
        self.logs_dir = os.path.expanduser(eval_args.logs_dir)
        self.repo_to_workspace_map = {}
        self.repo_to_image_id_map = {}
        logs_dir = Path(eval_args.logs_dir)
        if not logs_dir.exists():
            logs_dir.mkdir(parents=True)

    def get_issue_config(self, issue) -> IssueConfig:
        issue_description = eval_utils.build_issue_description(
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
            f"Agent run finished, getting path for issue: {issue['instance_id']}"
        )
        get_patch_resp = composio_toolset.execute_action(
            action=Action.GITCMDTOOL_GET_PATCH_CMD,
            params={},
        )
        if (
            isinstance(get_patch_resp, dict)
            and get_patch_resp.get("status") == "failure"
        ):
            raise Exception(get_patch_resp)
        self.logger.info(f"Get patch response: {get_patch_resp}")
        patch = get_patch_resp.get("stdout")  # type: ignore
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

        for count, issue in tqdm(
            enumerate(self.issues, 1), total=len(self.issues), desc="Processing issues"
        ):
            try:
                repo = issue["repo"]
                version = issue.get("version")
                image_name = (
                    f"techcomposio/swe-bench-{repo.replace('/', '_')}-swe:{version}"
                )
                if version and eval_utils.check_and_pull_image(image_name):
                    self.repo_to_image_id_map.setdefault(repo, image_name)
                self.logger.info(
                    f"Processing issue: {count} with repoMap: {self.repo_to_workspace_map}"
                    f"Repo: {repo}"
                    f"Issue id: {issue['instance_id']}"
                )

                workspace_id = eval_utils.setup_workspace(
                    repo,
                    self.repo_to_workspace_map,
                    self.repo_to_image_id_map,
                    issue["base_commit"],
                )
                issue_config = self.get_issue_config(issue)
                self.logger.info(
                    "found patch-id: %s and install_commit_id: %s",
                    issue["patch"],
                    issue["environment_setup_commit"],
                )
                # run agent function with the specified agent-function
                agent_func(workspace_id, issue_config)
                issue_patch = self.get_patch_for_issue(workspace_id, issue)
                self.save_agent_run(issue_config, issue_patch)

            except Exception as e:
                self.logger.error(f"Error processing issue {issue['instance_id']}: {e}")
                raise e

    def score_evaluation(self):
        eval_utils.get_score(self.logs_dir)


def evaluate(
    runnable: t.Callable,
    test_range: str = "20:22",
    dry_run: bool = True,
    include_hints: bool = True,
    logs_dir: Path = _get_logs_dir(),
    generate_report: bool = True,
) -> None:
    """Evaluate a callable."""
    manager = EvaluationManager(
        EvaluationArgs(
            test_range=test_range,
            dry_run=dry_run,
            include_hints=include_hints,
            logs_dir=logs_dir,
            generate_report=generate_report,
        )
    )
    manager.run(runnable)
    manager.score_evaluation()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run SWE-bench evaluation")
    parser.add_argument(
        "--test_range",
        type=str,
        default="20:22",
        help="Test split range (e.g., 1:10)",
    )
    parser.add_argument(
        "--dry_run",
        action="store_true",
        default=True,
        help="Just print the issues without running an agent",
    )
    parser.add_argument(
        "--include_hints",
        action="store_true",
        default=False,
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
        help="Logs directory",
        default=_get_logs_dir(),
    )
    args = parser.parse_args()

    from swe.examples.crewai_agent import CrewaiAgent, SWEArgs

    def default_agent_func(workspace_id, issue_config):
        return CrewaiAgent(
            args=SWEArgs(agent_logs_dir=Path("")),
            workspace_id=workspace_id,
        ).setup_and_solve(issue_config=issue_config, workspace_id=workspace_id)

    evaluate(
        default_agent_func,
        test_range=args.test_range,
        dry_run=args.dry_run,
        include_hints=args.include_hints,
        logs_dir=args.logs_dir,
        generate_report=args.gen_report,
    )
