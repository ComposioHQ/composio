"""
CLI Test helper.
"""

import re
import typing as t
from logging import Logger

from click.testing import CliRunner, Result

from composio.cli import composio
from composio.utils import logging


class BaseCliTest:
    """Utility class for writing CLI tests."""

    result: Result
    logger: Logger = logging.get(name="tests").logger

    def run(
        self,
        *args: t.Any,
        mix_stderr: bool = False,
        env: t.Optional[t.Dict[str, str]] = None,
        input: t.Optional[str] = None
    ) -> Result:
        """Run given command using click's CLI runner."""
        self.result = CliRunner(env=env, mix_stderr=mix_stderr).invoke(
            cli=composio, args=tuple(map(str, args)), input=input
        )
        return self.result

    def assert_exit_code(self, code: int) -> None:
        """Assert exit code on the last result."""
        assert self.result.exit_code == code, {
            "stdout": self.result.stdout,
            "stderr": self.result.stderr,
        }

    def assert_stdout(self, match: str) -> None:
        """Check if given text is present in stdout."""
        assert match in self.result.stdout, {
            "stdout": self.result.stdout,
            "stderr": self.result.stderr,
        }

    def assert_stderr(self, match: str) -> None:
        """Check if given text is present in stderr."""
        assert match in self.result.stderr, {
            "stdout": self.result.stdout,
            "stderr": self.result.stderr,
        }

    def assert_stdout_regex(self, match: re.Pattern) -> None:
        """Check if given text is present in stdout."""
        assert re.search(pattern=match, string=self.result.stdout), {
            "stdout": self.result.stdout,
            "stderr": self.result.stderr,
        }
