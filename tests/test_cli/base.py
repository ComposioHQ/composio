"""
CLI Test helper.
"""

import typing as t

from click.testing import CliRunner, Result

from composio.cli import composio


class BaseCliTest:
    """Utility class for writing CLI tests."""

    def run(self, *args: str, env: t.Optional[t.Dict[str, str]] = None) -> Result:
        """Run given command using click's CLI runner."""
        return CliRunner(
            env=env,
            mix_stderr=False,
        ).invoke(
            cli=composio,
            args=args,
        )
