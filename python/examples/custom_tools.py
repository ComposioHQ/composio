import ipaddress
import socket
from typing import Any
from urllib.parse import urlparse

import requests

from composio.core.local import Action, Tool


class _BaseRequestTool:
    """
    Base class for request-based tools with SSRF protection.
    WARNING: This tool can be dangerous if exposed to untrusted users.
    It can be used to make requests to internal services or scan local networks.
    Use with extreme caution. This implementation includes basic SSRF protection,
    but may not be exhaustive.
    """

    def _validate_url(self, url: str) -> tuple[bool, str]:
        """
        Validates the URL to prevent SSRF attacks.
        Returns (is_valid, error_message).
        """
        try:
            parsed_url = urlparse(url)

            if parsed_url.scheme not in ["http", "https"]:
                return (
                    False,
                    f"Error: Invalid URL scheme '{parsed_url.scheme}'. Only 'http' and 'https' are allowed.",
                )

            hostname = parsed_url.hostname
            if not hostname:
                return False, "Error: Could not determine hostname from URL."

            # Use getaddrinfo for both IPv4 and IPv6 support
            addr_info = socket.getaddrinfo(hostname, None)
            # Check the first resolved address. A more robust check might iterate all.
            ip_str = addr_info[0][4][0]
            ip_addr = ipaddress.ip_address(ip_str)

            if (
                ip_addr.is_private
                or ip_addr.is_loopback
                or ip_addr.is_unspecified
                or ip_addr.is_reserved
            ):
                return (
                    False,
                    f"Requests to private, loopback, or reserved IP addresses are not allowed. Resolved IP: {ip_str}",
                )

            return True, ""
        except socket.gaierror:
            return False, f"Error: Could not resolve hostname '{hostname}'."
        except Exception as e:
            return False, f"An unexpected error occurred during URL validation: {e}"


class GetRequestTool(Tool, _BaseRequestTool):
    """Tool for making a GET request to a given URL."""

    def _execute(self, url: str) -> Any:
        """
        Execute the tool.
        Performs security checks to prevent Server-Side Request Forgery (SSRF).
        """
        is_valid, message = self._validate_url(url)
        if not is_valid:
            return message

        try:
            response = requests.get(url, timeout=5, allow_redirects=False)
            response.raise_for_status()  # Raise an exception for bad status codes
            return response.text
        except requests.exceptions.RequestException as e:
            return f"An error occurred: {e}"


class PostRequestTool(Action, _BaseRequestTool):
    """Tool for making a POST request to a given URL with a JSON payload."""

    def _execute(self, url: str, payload: dict) -> Any:
        """Execute the tool."""
        is_valid, message = self._validate_url(url)
        if not is_valid:
            return message

        try:
            response = requests.post(
                url, json=payload, timeout=5, allow_redirects=False
            )
            response.raise_for_status()  # Raise an exception for bad status codes
            return response.text
        except requests.exceptions.RequestException as e:
            return f"An error occurred: {e}"


if __name__ == "__main__":
    # Example usage of GetRequestTool
    get_tool = GetRequestTool()
    print("--- Testing GetRequestTool ---")
    # Test with a valid public URL
    get_result_public = get_tool.execute(url="https://api.publicapis.org/entries")
    print(f"GET Request Result (Public URL): Success, response type: {type(get_result_public)}")

    # Test with a disallowed private URL
    get_result_private = get_tool.execute(url="http://127.0.0.1")
    print(f"GET Request Result (Private URL): {get_result_private}")

    # Example usage of PostRequestTool
    post_tool = PostRequestTool()
    print("\n--- Testing PostRequestTool ---")
    # Test with a valid public URL
    post_result_public = post_tool.execute(
        url="https://jsonplaceholder.typicode.com/posts",
        payload={"title": "foo", "body": "bar", "userId": 1},
    )
    print(
        "POST Request Result (Public URL): "
        f"Success, response type: {type(post_result_public)}"
    )

    # Test with a disallowed private URL
    post_result_private = post_tool.execute(
        url="http://localhost/api",
        payload={},
    )
    print(f"POST Request Result (Private URL): {post_result_private}")
