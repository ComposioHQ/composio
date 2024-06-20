"""
Helper function for git.
"""

import subprocess
import typing as t

from pydantic import BaseModel


class GitUserInfo(BaseModel):
    """Git user info."""

    name: t.Optional[str]
    email: t.Optional[str]


def get_git_user_info() -> GitUserInfo:
    """Get current git user information."""
    try:
        name = (
            subprocess.check_output(["git", "config", "user.name"])
            .strip()
            .decode("utf-8")
        )
        email = (
            subprocess.check_output(["git", "config", "user.email"])
            .strip()
            .decode("utf-8")
        )
        return GitUserInfo(name=name, email=email)
    except subprocess.CalledProcessError:
        return GitUserInfo(name=None, email=None)
