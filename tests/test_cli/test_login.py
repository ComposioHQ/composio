"""Test login command."""


from composio.cli.context import get_context

from tests.test_cli.base import BaseCliTest


class TestLogin(BaseCliTest):
    """Test login command."""

    def test_user_already_logged_in(self) -> None:
        """Test login successful."""
        context = get_context()
        api_key, context.user_data.api_key = context.user_data.api_key, "dummy_key"

        result = self.run("login", "--no-browser")

        # Revert back the API Key value.
        context.user_data.api_key = api_key

        assert result.exit_code == 1, result.stdout
        assert "Already logged in" in result.stderr
