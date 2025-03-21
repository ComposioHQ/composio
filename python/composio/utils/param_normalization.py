"""
Utility functions for parameter normalization.

This module provides utilities for normalizing authentication parameters,
particularly for standardizing API key field names across different apps.
"""

import typing as t


# Parameter mapping dictionary for API key normalization
PARAMETER_MAPPINGS = {
    "aero_workflow": {"apiSecret": "api_key"},
    "affinity": {"apiKey": "api_key"},
    "agencyzoom": {"JWT_TOKEN": "api_key"},
    "ahrefs": {"apiKey": "api_key"},
    "axonaut": {"apiSecret": "api_key"},
    "bamboohr": {"Base64_APIKEY": "api_key"},
    "bannerbear": {"apiSecret": "api_key"},
    "beeminder": {"auth_token": "api_key"},
    "brex": {"apiKey": "api_key"},
    "bubble": {"data_api_key": "api_key"},
    "canvas": {"apiKey": "api_key"},
    "close": {"apiSecret": "api_key"},
    "cloudflare": {"api_token": "api_key"},
    "contentful": {"access_token": "api_key"},
    "demio": {"apiKey": "api_key", "apiSecret": "api_secret"},
    "dropbox_sign": {"api_key_base64": "api_key"},
    "echtpost": {"auth_token": "api_key"},
    "flutterwave": {"secret_key": "api_key"},
    "formsite": {"access_token": "api_key"},
    "helcim": {"api_token": "api_key"},
    "heygen": {"apiKey": "api_key"},
    "jira": {"Base64_Encode": "api_key"},
    "ncscale": {"access_token": "api_key"},
    "ngrok": {"apiKey": "api_key"},
    "onepage": {"authToken": "api_key"},
    "posthog": {"apiKey": "api_key"},
    "rafflys": {"apiKey": "api_key"},
    "sendgrid": {"apiKey": "api_key"},
    "serpapi": {"apikey": "api_key"},
    "shopify": {"admin_api_access_token": "api_key"},
    "smugmug": {"apiSecret": "api_key"},
    "square": {"apiSecret": "api_key"},
    "supabase": {"supabase_personal_token": "api_key"},
    "timecamp": {"api_token": "api_key"},
    "tinyurl": {"api_token": "api_key"},
    "twilio": {"auth_token": "api_key"},
    "waboxapp": {"app_token": "api_key"},
    "workable": {"apiSecret": "api_key"},
    "yousearch": {"apikey": "api_key"},
}


def normalize_api_key_params(
    app_name: str, params: t.Optional[t.Dict], auth_mode: t.Optional[str] = None
) -> t.Optional[t.Dict]:
    """
    Normalize authentication parameters by mapping legacy parameter names to standardized ones.

    Only performs normalization when auth_mode is "API_KEY" or None.

    :param app_name: The name of the application
    :param params: Dictionary containing authentication parameters
    :param auth_mode: Authentication mode (normalization only applies to "API_KEY" mode)
    :return: Dictionary with normalized parameter names
    """
    if not app_name or not params:
        return params

    # Only normalize parameters for API_KEY auth mode
    if auth_mode is not None and auth_mode != "API_KEY":
        return params

    app_name_str = str(app_name).lower()
    if app_name_str not in PARAMETER_MAPPINGS:
        return params

    normalized_params = params.copy()
    app_mappings = PARAMETER_MAPPINGS[app_name_str]

    for old_param, new_param in app_mappings.items():
        if old_param in params and new_param not in params:
            normalized_params[new_param] = params[old_param]

    return normalized_params
