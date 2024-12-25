"""
Test `composio add`
"""

import re

from tests.test_cli.base import BaseCliTest


class TestComposioAdd(BaseCliTest):
    """Test `composio add`"""

    def test_no_auth(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "codeinterpreter")
        self.assert_exit_code(code=1)
        self.assert_stderr(
            match="codeinterpreter does not require authentication",
        )

    def test_add_github(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "github", input="n")
        self.assert_stdout_regex(
            match=re.compile(
                "Do you want to replace the existing connection?|Adding integration..."
            ),
        )

    def test_add_serpapi(self) -> None:
        """Test `composio add` with no-auth."""
        self.run("add", "serpapi", input="y")
        self.assert_stdout_regex(
            match=re.compile("Enter API Key"),
        )

    def test_add_auth_mode_auto_uppercase(self) -> None:
        """Test `composio add` with lowercase --auth-mode."""
        self.run("add", "github", "--auth-mode", "oauth2", input="n")
        self.assert_stdout_regex(
            match=re.compile(
                "Do you want to replace the existing connection?|Adding integration..."
            ),
        )
