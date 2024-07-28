"""
Test `composio add`
"""

import re
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

    def test_github_add(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "github",input="Y")

        self.assert_stdout_regex(
            match=re.compile("Do you want to replace the existing connection?|Adding integration..."),
        )
        self.assert_exit_code(code=0)
    
    def test_add_serpapi(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "serpapi",input="Y")

        print(self.result)
        self.assert_stdout_regex(
            match=re.compile("Enter API Key"),
        )
        self.assert_exit_code(code=1)
