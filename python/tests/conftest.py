"""pytest configuration module"""

import pytest


@pytest.fixture(autouse=True)
def load_dotenvs():
    """Loads dotenvs from .env files using `python-dotenv`"""
    from dotenv import load_dotenv

    load_dotenv()
