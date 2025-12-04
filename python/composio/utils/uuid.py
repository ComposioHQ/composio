"""UUID utility functions for Composio SDK."""

import uuid


def generate_uuid() -> str:
    """Generate a random UUID v4 string."""
    return str(uuid.uuid4())


def generate_short_id() -> str:
    """
    Generate a short ID (8 characters) from a UUID.

    Returns the first 8 characters of a UUID with dashes removed.
    """
    return generate_uuid()[:8].replace("-", "")
