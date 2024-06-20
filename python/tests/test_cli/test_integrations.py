"""
Test integrations command group.
"""

from tests.test_cli.base import BaseCliTest


class TestIntegration(BaseCliTest):
    """Test integrations command group."""

    def test_list(self) -> None:
        """Test list integrations."""
        result = self.run("integrations")

        assert result.exit_code == 0, result.stderr
        assert "• App:" in result.stdout, result.stderr
        assert "  ID:" in result.stdout, result.stderr
