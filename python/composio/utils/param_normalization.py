"""
Utility functions for parameter normalization.

This module provides utilities for normalizing authentication parameters,
particularly for standardizing API key field names across different apps.
"""

import typing as t


# Only the specific legacy parameters that need to be mapped
LEGACY_API_KEY_PARAMS = ["Base64_Encode", "admin_api_access_token", "apikey"]


def normalize_api_key_params(
    params: t.Optional[t.Dict[str, t.Any]], auth_mode: t.Optional[str] = None
) -> t.Optional[t.Dict[str, t.Any]]:
    """
    Normalize authentication parameters by mapping legacy parameter names to standardized ones.

    Uses a series of early exits to efficiently handle different scenarios:
    1. Only normalize for API_KEY auth mode
    2. Return immediately if api_key already exists
    3. If only one parameter exists, convert it to api_key
    4. Otherwise, map specific legacy parameters to api_key

    :param app_name: The name of the application (not used for mapping)
    :param params: Dictionary containing authentication parameters
    :param auth_mode: Authentication mode (normalization only applies to "API_KEY" mode)
    :return: Dictionary with normalized parameter names
    """

    # Early exit 1: Not API_KEY auth mode or empty params
    if not params:
        return params

    if auth_mode is None:
        return params

    if auth_mode is not None and auth_mode != "API_KEY":
        return params

    normalized_params = params.copy()

    # Early exit 2: api_key already exists
    if "api_key" in params:
        return normalized_params

    # Early exit 3: Only one parameter exists
    if len(params) == 1:
        key = next(iter(params))
        normalized_params["api_key"] = params[key]
        return normalized_params

    # Map only specific legacy parameters to api_key
    for legacy_param in LEGACY_API_KEY_PARAMS:
        if legacy_param in params:
            normalized_params["api_key"] = params[legacy_param]
            break  # Only use the first match

    return normalized_params
