"""
Utility functions for parameter normalization.

This module provides utilities for normalizing authentication parameters,
particularly for standardizing API key field names across different apps.
"""

import typing as t


# Known legacy parameter names that should be mapped to api_key
LEGACY_API_KEY_PARAMS = [
    "apiSecret", "apiKey", "JWT_TOKEN", "Base64_APIKEY", "auth_token", 
    "data_api_key", "api_token", "access_token", "api_key_base64", 
    "secret_key", "Base64_Encode", "authToken", "apikey", 
    "admin_api_access_token", "supabase_personal_token", "app_token"
]


def normalize_api_key_params(
    app_name: str, params: t.Optional[t.Dict], auth_mode: t.Optional[str] = None
) -> t.Optional[t.Dict]:
    """
    Normalize authentication parameters by mapping legacy parameter names to standardized ones.
    
    For API_KEY auth mode, converts any known legacy parameter to api_key.

    :param app_name: The name of the application (not used in this simplified version)
    :param params: Dictionary containing authentication parameters
    :param auth_mode: Authentication mode (normalization only applies to "API_KEY" mode)
    :return: Dictionary with normalized parameter names
    """
    if not params:
        return params

    # Only normalize parameters for API_KEY auth mode
    if auth_mode is not None and auth_mode != "API_KEY":
        return params

    normalized_params = params.copy()
    
    # Special case for Demio which has two parameters
    if "apiKey" in params and "api_key" not in params:
        normalized_params["api_key"] = params["apiKey"]
    
    if "apiSecret" in params and "api_secret" not in params:
        normalized_params["api_secret"] = params["apiSecret"]
    
    # Check for any known legacy parameter and map to api_key
    for legacy_param in LEGACY_API_KEY_PARAMS:
        if legacy_param in params and "api_key" not in params:
            normalized_params["api_key"] = params[legacy_param]
            break  # Only use the first match

    return normalized_params
