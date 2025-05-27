"""
Descope Authentication Module

This module provides a client for interacting with Descope's authentication API.
It allows generating tokens for users with specific scopes to access external applications.

Usage:
    auth = DescopeAuth()
    auth_params = auth.get_auth("my_app", "user123", ["read", "write"])
"""

import json
import os
from typing import List, Optional

import requests
from requests.exceptions import HTTPError, RequestException

from composio import AppType
from composio.client.collections import CustomAuthParameter
from composio.exceptions import DescopeAuthError, DescopeConfigError


class DescopeAuth:
    """
    Client for Descope authentication services.

    This class handles authentication with Descope's API to generate access tokens
    for users to access external applications with specific permissions.

    Attributes:
        project_id (str): The Descope project ID
        management_key (str): The Descope management key for API access
        base_url (str): The base URL for the Descope API
    """

    def __init__(
        self,
        project_id: Optional[str] = None,
        management_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        """
        Initialize a new DescopeAuth client.

        Args:
            project_id: The Descope project ID. If not provided, will try to read from DESCOPE_PROJECT_ID environment variable.
            management_key: The Descope management key. If not provided, will try to read from DESCOPE_MANAGEMENT_KEY environment variable.
            base_url: The base URL for the Descope API. If not provided, will try to read from DESCOPE_BASE_URL environment variable
                     or default to "https://api.descope.com".

        Raises:
            DescopeConfigError: If project_id or management_key is not provided and not available in environment variables.
        """
        self.project_id = project_id or os.environ.get("DESCOPE_PROJECT_ID")
        self.management_key = management_key or os.environ.get("DESCOPE_MANAGEMENT_KEY")
        self.base_url = (
            base_url or os.environ.get("DESCOPE_BASE_URL") or "https://api.descope.com"
        )

        if not self.project_id:
            raise DescopeConfigError("Descope project ID is required.")
        if not self.management_key:
            raise DescopeConfigError("Descope management key is required.")

    def get_auth(
        self, app: AppType, user_id: str, scopes: List[str]
    ) -> List[CustomAuthParameter]:
        """
        Get Descope authentication parameters for a user to access an application.

        This method generates a Descope access token for the specified user and app
        with the requested permission scopes.

        Args:
            app: The application identifier or AppType enum
            user_id: The user ID to generate the token for
            scopes: List of permission scopes to include in the token

        Returns:
            List of CustomAuthParameter objects containing:
                - Authorization header with the access token
                - Metadata containing the scopes

        Raises:
            DescopeAuthError: If there is an error during the authentication process,
                              including network issues, invalid responses, or other unexpected errors.
        """
        descope_url = f"{self.base_url}/v1/mgmt/outbound/app/user/token"
        app_id = app if isinstance(app, str) else str(app).lower()

        payload = json.dumps({"appId": app_id, "userId": user_id, "scopes": scopes})

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.project_id}:{self.management_key}",
        }

        try:
            response = requests.post(
                descope_url, headers=headers, data=payload, timeout=10, verify=False
            )
            response.raise_for_status()

            response_data = response.json()

            if (
                "token" not in response_data
                or "accessToken" not in response_data["token"]
            ):
                raise DescopeAuthError(
                    "Invalid response format: missing 'token' or 'accessToken'."
                )

            return [
                CustomAuthParameter(
                    in_="header",
                    name="Authorization",
                    value=f"Bearer {response_data['token']['accessToken']}",
                ),
                CustomAuthParameter(
                    in_="metadata", name="scopes", value=",".join(scopes)
                ),
            ]

        except HTTPError as e:
            raise DescopeAuthError(
                f"HTTP error during Descope token request: {e.response.status_code} - {e.response.text}"
            ) from e
        except RequestException as e:
            raise DescopeAuthError(f"Error during Descope token request: {e}") from e
        except json.JSONDecodeError as e:
            raise DescopeAuthError(f"Invalid JSON response from server: {e}") from e
        except Exception as e:
            raise DescopeAuthError(
                f"Unexpected error during Descope token request: {e}"
            ) from e
