"""
Test `composio apps` command group.
"""

from pathlib import Path

from composio.client import enums

from tests.test_cli.base import BaseCliTest


class TestList(BaseCliTest):
    """Test apps list."""

    def test_list(self) -> None:
        """Test list all apps."""
        result = self.run("apps")
        assert result.exit_code == 0, result.stderr
        assert "Showing all apps" in result.stdout
        assert "github" in result.stdout


class TestUpdate(BaseCliTest):
    """Test apps update."""

    file: Path
    content: str

    def setup_method(self) -> None:
        """Setup update test."""
        self.file = Path(enums.__file__)
        self.content = self.file.read_text(encoding="utf-8")

    def teardown_method(self) -> None:
        """Restore original enums file after testing."""
        self.file.write_text(data=self.content, encoding="utf-8")

    def test_update(self) -> None:
        """Test app enums update."""
        result = self.run("apps", "update")
        assert result.exit_code == 0, result.stderr

        content = self.file.read_text(encoding="utf-8")
        assert content != self.content
