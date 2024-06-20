"""
Test context module.
"""

from unittest import mock

import pytest
from click import ClickException

from composio.cli.context import Context, login_required


def test_login_required_decorator() -> None:
    """Test login required decoractor."""

    @login_required
    def _some_method() -> None:
        pass

    with mock.patch.object(
        Context,
        "is_logged_in",
        return_value=False,
    ), mock.patch.object(
        Context,
        "using_api_key_from_env",
        return_value=False,
    ), pytest.raises(
        ClickException,
        match="User not logged in, please login using `composio login`",
    ):
        _some_method()
