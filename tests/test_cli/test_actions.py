"""
Test actions command group.
"""

import logging
import typing as t
from unittest import mock

from tests.test_cli.base import BaseCliTest


logging.basicConfig(level=logging.DEBUG)


@mock.patch("click.prompt", return_value="n")
class TestListActions(BaseCliTest):
    """Test list actions."""

    def test_list_all(self, *args: t.Any) -> None:  # pylint: disable=unused-argument
        """Test list all actions."""
        result = self.run("actions")

        assert result.exit_code == 0
        assert "strava_" in result.stdout
        assert "github_" in result.stdout

    def test_list_enabled(  # pylint: disable=unused-argument
        self,
        *args: t.Any,
    ) -> None:
        """Test list enabled apps."""
        result = self.run("actions", "--enabled")

        assert result.exit_code == 0
        assert "strava_" not in result.stdout
        assert "github_" in result.stdout
