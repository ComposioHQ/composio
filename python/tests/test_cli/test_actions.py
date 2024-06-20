"""
Test actions command group.
"""

import typing as t
from unittest import mock

import pytest

from tests.test_cli.base import BaseCliTest


class TestListActions(BaseCliTest):
    """Test list actions."""

    @pytest.mark.parametrize(
        argnames="arguments,exptected_outputs,unexptected_outputs",
        argvalues=(
            (tuple(), ("strava_", "github_"), tuple()),  # List all apps
            (("--enabled",), ("github_",), ("strava_",)),  # List enabled apps
            (
                ("--app", "slack"),
                ("slack_",),
                ("strava_", "github_"),
            ),  # Filter by a specific app
        ),
    )
    @mock.patch("click.prompt", return_value="n")
    def test_list_all(  # pylint: disable=unused-argument
        self,
        patch: t.Any,
        arguments: t.Tuple[str, ...],
        exptected_outputs: t.Tuple[str, ...],
        unexptected_outputs: t.Tuple[str, ...],
    ) -> None:
        """Test list all actions."""
        result = self.run("actions", *arguments)

        assert result.exit_code == 0
        for output in exptected_outputs:
            assert output in result.stdout

        for output in unexptected_outputs:
            assert output not in result.stdout

    @pytest.mark.skip(reason="Limit filter is not working atm!")
    @mock.patch("click.prompt", return_value="n")
    def test_limit(self, patch: t.Any) -> None:  # pylint: disable=unused-argument
        """Test limit flag."""
        result = self.run("actions", "--use-case", "github", "--limit", "5")

        assert result.exit_code == 0
        assert len(result.output.splitlines()) == 6

    def test_copy(self) -> None:
        """Test copy flag."""

        def _assert_copy(text: str) -> None:
            """Assert copy function call."""
            assert "Action.GITHUB" in text
            assert "Action.SLACK" not in text

        with mock.patch("pyperclip.copy", new=_assert_copy):
            self.run("actions", "--app", "--github", "--copy")
