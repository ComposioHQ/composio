"""Test configuration."""

import os
import typing as t

import pytest


IS_CI = os.environ.get("CI") == "true"
E2E = pytest.mark.e2e


def skip_if_ci(reason: str) -> t.Callable:
    return pytest.mark.skipif(condition=IS_CI, reason=reason)
