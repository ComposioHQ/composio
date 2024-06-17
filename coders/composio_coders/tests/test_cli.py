import unittest

import click.testing
from click.testing import CliRunner
from composio_coders.cli import cli
from composio_coders.context import Context


class TestCLI(unittest.TestCase):
    def setUp(self):
        self.runner = CliRunner()

    def handle_exception(self, result: click.testing.Result):
        if result.exception:
            # Prepare the exception message
            exception_message = f"An exception occurred: {result.exception}\n"
            # Extract traceback details
            if result.exc_info:
                import traceback

                tb = traceback.format_exception(*result.exc_info)
                exception_message += "".join(tb)

            # Print the exception details to the console (optional, for debugging)
            print(exception_message)

            # Fail the test with the exception details
            self.fail(exception_message)

    def test_openai_setup(self):
        """Test the openai setup command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(cli, ["setup"], input="openai\napi_key\n")
            self.handle_exception(result)
            self.assertIn("Model configuration saved", result.output)
            self.assertEqual(result.exit_code, 0)

    def test_azure_setup(self):
        """Test the azure setup command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(
                cli, ["setup"], input="azure\napi_key\nend_point_url\n"
            )
            self.handle_exception(result)
            self.assertIn("Model configuration saved", result.output)
            self.assertEqual(result.exit_code, 0)

    def test_add_issue(self):
        """Test the add_issue command."""
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(
                cli,
                ["add_issue"],
                input="repo_name\nissue_id\nbase_commit_id\nissue_description\n",
                env={"GITHUB_ACCESS_TOKEN": "DEFAULT-TOKEN"},
            )
            self.handle_exception(result)
            self.assertEqual(result.exit_code, 0)
            self.assertIn("🍀 Issue configuration saved\n", result.output)

    def test_solve(self):
        """Test the solve command."""
        with self.runner.isolated_filesystem():
            # Assuming 'set_context' is a method to set the context directly
            from composio_coders.context import set_context

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

            result = self.runner.invoke(cli, ["solve"])
            self.handle_exception(result)
            self.assertIn("Starting issue solving", result.output)
            self.assertEqual(result.exit_code, 0)

    def test_show_workflow(self):
        """Test the show_workflow command."""
        result = self.runner.invoke(cli, ["workflow"])
        self.handle_exception(result)
        self.assertIn("Workflow:", result.output)
        self.assertEqual(result.exit_code, 0)


if __name__ == "__main__":
    unittest.main()
