from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete a Composio webhook subscription.")
    parser.add_argument("subscription_id", nargs="?", default="")
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()

    load_dotenv(args.env_file)
    api_key = os.getenv("COMPOSIO_API_KEY", "")
    subscription_id = args.subscription_id or os.getenv("COMPOSIO_WEBHOOK_SUBSCRIPTION_ID", "")
    if not api_key:
        raise SystemExit("COMPOSIO_API_KEY is required")
    if not subscription_id:
        raise SystemExit("subscription id or COMPOSIO_WEBHOOK_SUBSCRIPTION_ID is required")

    request = urllib.request.Request(
        f"https://backend.composio.dev/api/v3.1/webhook_subscriptions/{subscription_id}",
        headers={"x-api-key": api_key},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            print(body or json.dumps({"success": True}))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Composio API returned {exc.code}: {detail}") from exc


if __name__ == "__main__":
    main()
