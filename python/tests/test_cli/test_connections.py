"""
Test connections command group.
"""

from tests.test_cli.base import BaseCliTest


class TestListConnections(BaseCliTest):
    """Test list connections."""

    def test_list_all(self) -> None:
        """Test list connections."""
        result = self.run("connections")

        assert result.exit_code == 0, result.stderr
        assert "App: github" in result.stdout, result.stderr
        assert "Id :" in result.stdout, result.stderr

    def test_list_one(self) -> None:
        """Test list one connection."""
        result = self.run("connections", "get", "6f4f4191-7fe9-4b5c-b491-4b7ec56ebf5d")

        assert result.exit_code == 0, result.stderr
        assert "App   : github" in result.stdout, result.stderr
        assert (
            "Id    : 6f4f4191-7fe9-4b5c-b491-4b7ec56ebf5d" in result.stdout
        ), result.stderr
        assert "Status: EXPIRED" in result.stdout, result.stderr
