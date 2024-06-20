"""Test git module."""

from unittest import mock

from composio.utils.git import get_git_user_info


def test_get_git_user_info() -> None:
    """Test `get_git_user_info` method."""

    with mock.patch(
        "subprocess.check_output",
        side_effect=[b"john", b"john@email.com"],
    ):
        info = get_git_user_info()

    assert info.name == "john"
    assert info.email == "john@email.com"
