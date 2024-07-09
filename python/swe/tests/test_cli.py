"""Test the CLI."""

import traceback
import unittest
from typing import Any, Dict, List, Optional
from unittest.mock import patch

import click.testing
from click.testing import CliRunner
from langchain_core.callbacks.manager import CallbackManagerForLLMRun
from langchain_core.language_models.llms import LLM
from swekit.cli import swekit
from swekit.config.context import Context, set_context


# pylint: disable=unused-argument


class FakeListLLM(LLM):
    """Fake LLM for testing that outputs elements of a list."""

    responses: List[str]
    i: int = -1

    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        """Increment counter, and then return response in that index."""
        self.i += 1
        if self.i >= len(self.responses):
            return ""
        print(f"=== Mock Response #{self.i} ===")  # noqa: T201
        print(self.responses[self.i])  # noqa: T201
        return self.responses[self.i]

    def get_num_tokens(self, text: str) -> int:
        """Return number of tokens in text."""
        return len(text.split())

    async def _acall(self, *args: Any, **kwargs: Any) -> str:
        return self._call(*args, **kwargs)

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {}

    @property
    def _llm_type(self) -> str:
        """Return type of llm."""
        return "fake_list"


class TestCLI(unittest.TestCase):
    def setUp(self):
        self.runner = CliRunner()

    def handle_exception(self, result: click.testing.Result):
        if result.exception:
            # Prepare the exception message
            exception_message = f"An exception occurred: {result.exception}\n"
            # Extract traceback details
            if result.exc_info:
                tb = traceback.format_exception(*result.exc_info)
                exception_message += "".join(tb)

            # Print the exception details to the console (optional, for debugging)
            print(exception_message)

            # Fail the test with the exception details
            self.fail(exception_message)

    def test_openai_setup(self):
        """Test the openai setup command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(swekit, ["setup"], input="openai\napi_key\n")
            self.handle_exception(result)
            self.assertIn("Model configuration saved", result.output)
            self.assertEqual(result.exit_code, 0)

    def test_azure_setup(self):
        """Test the azure setup command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(
                swekit, ["setup"], input="azure\napi_key\nend_point_url\n"
            )
            self.handle_exception(result)
            self.assertIn("Model configuration saved", result.output)
            self.assertEqual(result.exit_code, 0)

    def test_add_issue(self):
        """Test the add_issue command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(
                swekit,
                ["add_issue"],
                input="repo_name\nissue_id\nbase_commit_id\nissue_description\n",
                env={"GITHUB_ACCESS_TOKEN": "DEFAULT-TOKEN"},
            )
            self.handle_exception(result)
            self.assertEqual(result.exit_code, 0)
            self.assertIn("🍀 Issue configuration saved\n", result.output)

    def test_solve_openai(self):
        """Test the solve command."""
        with self.runner.isolated_filesystem():
            # Assuming 'set_context' is a method to set the context directly

            issue_config = {
                "repo_name": "test_repo",
                "issue_id": "123",
                "base_commit_id": "abc",
                "issue_desc": "Fix bug",
            }
            model_env_config = {"api_key": "test-api-key", "model_env": "openai"}
            ctx = Context()
            ctx.issue_config = issue_config
            ctx.model_env = model_env_config
            set_context(ctx)  # Set the context directly without file I/O

            with patch("composio_coders.swe.CoderAgent.get_llm") as mock_get_llm:
                mock_get_llm.return_value = FakeListLLM(responses=["Fake Response"])
                result = self.runner.invoke(swekit, ["solve"])
                self.handle_exception(result)
                mock_get_llm.assert_called_once()
                self.assertEqual(result.exit_code, 0)

    def test_solve_azure(self):
        """Test the solve command."""
        with self.runner.isolated_filesystem():
            # Assuming 'set_context' is a method to set the context directly

            issue_config = {
                "repo_name": "test_repo",
                "issue_id": "123",
                "base_commit_id": "abc",
                "issue_desc": "Fix bug",
            }
            model_env_config = {
                "api_key": "test-api-key",
                "model_env": "azure",
                "azure_endpoint": "https://abc.com",
            }
            ctx = Context()
            ctx.issue_config = issue_config
            ctx.model_env = model_env_config
            set_context(ctx)  # Set the context directly without file I/O

            with patch("composio_coders.swe.CoderAgent.get_llm") as mock_get_llm:
                mock_get_llm.return_value = FakeListLLM(responses=["Fake Response"])
                result = self.runner.invoke(swekit, ["solve"])
                self.handle_exception(result)
                mock_get_llm.assert_called_once()
                self.assertEqual(result.exit_code, 0)

    def test_show_workflow(self):
        """Test the show_workflow command."""
        result = self.runner.invoke(swekit, ["workflow"])
        self.handle_exception(result)
        self.assertIn("Workflow:", result.output)
        self.assertEqual(result.exit_code, 0)


if __name__ == "__main__":
    unittest.main()
