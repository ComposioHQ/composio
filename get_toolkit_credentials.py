#!/usr/bin/env python3
"""
Script to get the latest account credentials for a toolkit using Composio API.

Usage:
    python get_toolkit_credentials.py <toolkit_slug>

Environment Variables:
    COMPOSIO_API_KEY_INTEGRATOR: API key for Composio integrator access
"""

import os
import sys
import json
import requests
from typing import Optional, Dict, Any


def get_toolkit_credentials(toolkit_slug: str) -> Optional[Dict[str, Any]]:
    """
    Get the latest active account credentials for a toolkit.
    
    Args:
        toolkit_slug: The slug of the toolkit to get credentials for
        
    Returns:
        Dictionary containing the access_token and other credential data,
        or None if no active connection found
        
    Raises:
        ValueError: If API key is missing or invalid
        requests.RequestException: If API request fails
    """
    api_key = os.getenv('COMPOSIO_API_KEY_INTEGRATOR')
    if not api_key:
        raise ValueError("COMPOSIO_API_KEY_INTEGRATOR environment variable is required")
    
    url = "https://backend.composio.dev/api/v3/connected_accounts"
    headers = {
        "Accept": "application/json",
        "x-api-key": api_key
    }
    
    params = {
        "statuses": "ACTIVE",
        "toolkit_slugs": toolkit_slug,
        "order_by": "created_at",
        "limit": 20
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        data = response.json()
        items = data.get("items", [])
        
        if not items:
            print(f"No active connections found for toolkit: {toolkit_slug}")
            return None
        
        latest_connection = items[0]
        
        connection_data = latest_connection.get("data", {})
        
        if "access_token" not in connection_data:
            print(f"No access_token found in connection data for toolkit: {toolkit_slug}")
            return None
        
        return {
            "access_token": connection_data["access_token"],
            "connection_id": latest_connection.get("id"),
            "user_id": latest_connection.get("user_id"),
            "status": latest_connection.get("status"),
            "created_at": latest_connection.get("created_at"),
            "toolkit_slug": latest_connection.get("toolkit", {}).get("slug"),
            "auth_scheme": latest_connection.get("auth_config", {}).get("auth_scheme"),
            "full_data": connection_data
        }
        
    except requests.exceptions.HTTPError as e:
        if response.status_code == 401:
            raise ValueError("Invalid API key or insufficient permissions")
        elif response.status_code == 404:
            raise ValueError(f"Toolkit '{toolkit_slug}' not found")
        else:
            raise requests.RequestException(f"API request failed: {e}")
    except requests.exceptions.RequestException as e:
        raise requests.RequestException(f"Failed to connect to Composio API: {e}")


def main():
    """Main function to handle command line usage."""
    if len(sys.argv) != 2:
        print("Usage: python get_toolkit_credentials.py <toolkit_slug>")
        print("\nExample: python get_toolkit_credentials.py googlesheets")
        sys.exit(1)
    
    toolkit_slug = sys.argv[1]
    
    try:
        credentials = get_toolkit_credentials(toolkit_slug)
        
        if credentials:
            print(f"Successfully retrieved credentials for toolkit: {toolkit_slug}")
            print(f"Access Token: {credentials['access_token']}")
            print(f"Connection ID: {credentials['connection_id']}")
            print(f"User ID: {credentials['user_id']}")
            print(f"Status: {credentials['status']}")
            print(f"Created At: {credentials['created_at']}")
            print(f"Auth Scheme: {credentials['auth_scheme']}")
            
            print("\n--- JSON Output ---")
            print(json.dumps(credentials, indent=2))
        else:
            print(f"No credentials found for toolkit: {toolkit_slug}")
            sys.exit(1)
            
    except (ValueError, requests.RequestException) as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
