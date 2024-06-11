"""
CLI Test helper.
"""

import typing as t

from click.testing import CliRunner, Result

from composio.cli import composio


class BaseCliTest:
    """Utility class for writing CLI tests."""

    def run(
        self,
        *args: t.Any,
        env: t.Optional[t.Dict[str, str]] = None,
        mix_stderr: bool = False,
    ) -> Result:
        """Run given command using click's CLI runner."""
        return CliRunner(env=env, mix_stderr=mix_stderr).invoke(
            cli=composio, args=tuple(map(str, args))
        )
