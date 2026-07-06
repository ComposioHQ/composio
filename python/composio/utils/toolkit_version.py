"""
Utilities for handling toolkit versions.
"""

import os
import typing as t

from composio.core.types import ToolkitVersion, ToolkitVersionParam, ToolkitVersions


def normalize_toolkit_slug(toolkit_slug: str) -> str:
    """
    Canonicalizes a toolkit slug into the form used as a version-map key.

    Toolkit slugs are matched case-insensitively. This is the single source of
    truth for that rule: every write into a version map (env vars, user-supplied
    dicts) and every read out of one MUST go through this helper so the two sides
    can never drift apart and silently miss a configured pin.

    Kept intentionally equivalent to the TypeScript SDK's ``normalizeToolkitSlug``
    (see ts/packages/core/src/utils/toolkitVersion.ts).

    :param toolkit_slug: The slug/name of the toolkit, in any casing
    :return: The normalized (lowercase) slug used as a version-map key
    """
    return toolkit_slug.lower()


def get_toolkit_version(
    toolkit_slug: str, toolkit_versions: t.Optional[ToolkitVersionParam] = None
) -> ToolkitVersion:
    """
    Gets the version for a specific toolkit based on the provided toolkit versions configuration.

    :param toolkit_slug: The slug/name of the toolkit to get the version for
    :param toolkit_versions: Optional toolkit versions configuration (string for global version
                            or dict mapping toolkit slugs to versions)
    :return: The toolkit version to use - either the specific version from config, or 'latest' as fallback
    """
    # If toolkit_versions is a string, use it as a global version for all toolkits
    if isinstance(toolkit_versions, str):
        return toolkit_versions

    # If toolkit_versions is a dict mapping, look up the specific toolkit version.
    # The map is keyed by normalized slugs, so normalize the lookup too
    # (see normalize_toolkit_slug for why).
    if isinstance(toolkit_versions, dict) and len(toolkit_versions) > 0:
        return toolkit_versions.get(normalize_toolkit_slug(toolkit_slug), "latest")

    # Else use 'latest'
    return "latest"


def get_toolkit_versions(
    default_versions: t.Optional[ToolkitVersionParam] = None,
) -> ToolkitVersionParam:
    """
    Gets toolkit versions configuration by merging environment variables, user-provided defaults, and fallbacks.

    Priority order:
    1. If default_versions is a string, use it as a global version for all toolkits
    2. User-provided toolkit version mappings (default_versions dict)
    3. Environment variables (COMPOSIO_TOOLKIT_VERSION_<TOOLKIT_NAME>)
    4. Fallback to 'latest' if no versions are configured

    :param default_versions: Optional default versions configuration (string for global version or dict mapping toolkit names to versions)
    :return: Toolkit versions configuration - either a string for global version or dict mapping toolkit names to versions
    """
    # If already set by user as a string, use it as global version for all toolkits
    if isinstance(default_versions, str):
        return default_versions

    # Check if there are envs similar to COMPOSIO_TOOLKIT_VERSION_GITHUB then extract the toolkit name
    toolkit_versions_from_env: ToolkitVersions = {}
    for key, value in os.environ.items():
        if key.startswith("COMPOSIO_TOOLKIT_VERSION_"):
            toolkit_name = key.replace("COMPOSIO_TOOLKIT_VERSION_", "")
            toolkit_versions_from_env[normalize_toolkit_slug(toolkit_name)] = value

    # Normalize keys via normalize_toolkit_slug (the same helper the lookup uses);
    # user-provided values override env.
    user_provided_toolkit_versions: ToolkitVersions = {}
    if default_versions and isinstance(default_versions, dict):
        user_provided_toolkit_versions = {
            normalize_toolkit_slug(key): value
            for key, value in default_versions.items()
        }

    # Final toolkit versions
    toolkit_versions = {
        **toolkit_versions_from_env,
        **user_provided_toolkit_versions,
    }

    # If the toolkit_versions are empty, use 'latest'
    if len(toolkit_versions) == 0:
        return "latest"

    return toolkit_versions
