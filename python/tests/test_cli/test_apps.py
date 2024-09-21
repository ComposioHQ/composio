"""
Test `composio apps` command group.
"""

import random
import typing as t
from pathlib import Path

from composio.client import enums

from tests.conftest import skip_if_ci
from tests.test_cli.base import BaseCliTest


ENUM_CLS = (
    enums.App,
    enums.Action,
    enums.Tag,
    enums.Trigger,
)


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

    def test_update_consistency(self) -> None:
        """Test app enums update."""
        self.run("apps", "update")

        from composio import (  # pylint: disable=import-outside-toplevel
            Action,
            App,
            Trigger,
        )

        for trigger in Trigger.all():
            assert trigger.slug.lower().startswith(trigger.app.lower())

        for action in Action.all():
            assert action.slug.lower().startswith(action.app.lower())

        for app in App.all():
            assert app.slug.lower().startswith(app.name.lower())

    @skip_if_ci(reason="Needs investigation, this test fails in CI")
    def test_update_not_required(self) -> None:
        """Test app enums update."""
        self.run("apps", "update")
        self.assert_exit_code(code=0)
        for cls in ENUM_CLS:
            self.assert_stdout(f"⚠️ {cls.__name__}s does not require update")

    @skip_if_ci(reason="Needs investigation, this test fails in CI")
    def test_update(self) -> None:
        """Test app enums update."""
        to_update = random.choice(ENUM_CLS)
        self.logger.debug(f"Testing update with `{to_update}`")

        file = Path(enums.__file__).parent / f"_{to_update.__name__.lower()}.py"
        content = file.read_text(encoding="utf-8")
        to_remove = random.choice([enm.slug for enm in to_update.all()])  # type: ignore
        content = content.replace(f'    {to_remove}: "{to_update.__name__}"\n', "")
        file.write_text(content)

        self.run("apps", "update")
        self.assert_exit_code(code=0)
        self.assert_stdout(f"{to_update.__name__}s updated")
        for cls in ENUM_CLS:
            if cls == to_update:
                continue
            self.assert_stdout(f"{cls.__name__}s does not require update")
