"""
Test decorators module.
"""

import pytest

from composio.utils.decorators import deprecated


def test_deprecated() -> None:
    """Test `deprecated` decorator."""

    @deprecated(version="0.1.0", replacement="new_method")
    def old_method():
        pass

    with pytest.warns(
        UserWarning,
        match=(
            "`old_method` is deprecated and will be removed "
            "on v0.1.0. Use `new_method` method instead."
        ),
    ):
        old_method()
