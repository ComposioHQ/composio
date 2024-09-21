"""Test login command."""

from unittest import mock

from composio.cli.context import Context

from tests.test_cli.base import BaseCliTest


class TestLogin(BaseCliTest):
    """Test login command."""

    def test_user_already_logged_in(self) -> None:
        """Test login successful."""
        with mock.patch.object(Context, "is_logged_in", return_value=True):
            self.run("login", "--no-browser")
            self.assert_exit_code(code=0)
            self.assert_stdout(match="You're already logged in!")
