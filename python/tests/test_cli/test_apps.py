"""
Test `composio apps` command group.
"""

import typing as t
from pathlib import Path

from composio.client import enums

from tests.test_cli.base import BaseCliTest


class TestList(BaseCliTest):
    """Test apps list."""

    def test_list(self) -> None:
        """Test list all apps."""
        self.run("apps")
        self.assert_exit_code(code=0)
        self.assert_stdout(match="Showing all apps")
        self.assert_stdout(match="github")


class TestUpdate(BaseCliTest):
    """Test apps update."""

    files: t.Dict[Path, str]

    def setup_method(self) -> None:
        """Setup update test."""
        self.files = {}
        for file in Path(enums.__file__).parent.iterdir():
            if file.is_dir():
                continue
            self.files[file] = file.read_text(encoding="utf-8")

    def teardown_method(self) -> None:
        """Restore original enums file after testing."""
        for file, content in self.files.items():
            file.write_text(data=content, encoding="utf-8")

    def test_update(self) -> None:
        """Test app enums update."""
        self.run("apps", "update")
        self.assert_exit_code(code=0)
        self.assert_stdout("App database updated successfully")
