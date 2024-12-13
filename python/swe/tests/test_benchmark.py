import logging
import os
from unittest.mock import MagicMock, patch

import docker
import pytest
from datasets import Dataset

from composio import Action, ComposioToolSet, WorkspaceType

from swekit.benchmark.utils import (
    build_issue_description,
    get_issues_dataset,
    setup_workspace,
)


logger = logging.getLogger(__name__)


@pytest.fixture
def mock_load_dataset():
    with patch("swekit.benchmark.utils.load_dataset") as mock:
        yield mock


@pytest.mark.swe
class TestIntegration:
    image_name = "composio/swe:testing"

    @classmethod
    def setup_class(cls):
        client = docker.from_env()
        dockerfile_path = os.path.join(os.path.dirname(__file__), "test_docker")
        logger.info(f"Building Docker image from path: {dockerfile_path}")
        client.images.build(path=dockerfile_path, tag=cls.image_name, rm=True)
        logger.info("Docker image built successfully.")

    def test_setup_workspace(self):
        num_instances = 1
        workspace_ids = setup_workspace(
            repo="pallets/flask",
            repo_to_workspace_map={},
            repo_to_image_id_map={},
            base_commit="7ee9ceb71e868944a46e1ff00b506772a53a4f1d",
            workspace_env=WorkspaceType.Docker,
            image_name=self.image_name,
            num_instances=num_instances,
        )
        assert len(workspace_ids) == num_instances
        composio_toolset = ComposioToolSet()
        composio_toolset.set_workspace_id(workspace_id=workspace_ids[0])
        pwd_resp = composio_toolset.execute_action(
            action=Action.FILETOOL_CHANGE_WORKING_DIRECTORY, params={"path": "."}
        )
        assert pwd_resp["successful"]
        assert pwd_resp["data"]["current_working_directory"] == "/home/user/flask"

    def test_get_issues_dataset(self, mock_load_dataset):
        mock_dataset = MagicMock(spec=Dataset)
        mock_dataset.__len__.return_value = 100
        mock_load_dataset.return_value = mock_dataset

        # Test without test_instance_ids
        result = get_issues_dataset(
            "princeton-nlp/SWE-bench_Verified", test_split="0:100"
        )
        assert len(result) == 100
        mock_load_dataset.assert_called_once_with(
            "princeton-nlp/SWE-bench_Verified", split="test[0:100]"
        )

        # Test with test_instance_ids
        mock_dataset.filter.return_value = MagicMock(spec=Dataset)
        mock_dataset.filter.return_value.__len__.return_value = 50
        result = get_issues_dataset(
            "princeton-nlp/SWE-bench_Verified",
            test_split="0:100",
            test_instance_ids=["id1", "id2"],
        )
        assert len(result) == 50
        mock_dataset.filter.assert_called_once()

    def test_build_issue_description(self):
        repo = "test/repo"
        problem_statement = "Fix the bug"
        hints = "Check the loop"

        # Test without hints
        description = build_issue_description(
            repo, hints, problem_statement, include_hints=False
        )
        assert repo in description
        assert problem_statement in description
        assert hints not in description

        # Test with hints
        description = build_issue_description(
            repo, hints, problem_statement, include_hints=True
        )
        assert repo in description
        assert problem_statement in description
        assert hints in description

        # Test with empty problem statement
        with pytest.raises(ValueError):
            build_issue_description(repo, hints, "", include_hints=True)

    @classmethod
    def teardown_class(cls):
        client = docker.from_env()
        try:
            client.images.remove(cls.image_name, force=True)
            print("Docker image removed successfully.")
        except Exception as e:
            print(f"Error removing Docker image: {e}")
