"""
Test `composio add`
"""

from tests.test_cli.base import BaseCliTest


class TestComposioAdd(BaseCliTest):
    """Test `composio add`"""

    def test_no_auth(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "scheduler")
        self.assert_exit_code(code=1)
        self.assert_stderr(
            match="Scheduler does not require authentication",
        )
