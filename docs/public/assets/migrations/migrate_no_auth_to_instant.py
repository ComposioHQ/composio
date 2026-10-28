#!/usr/bin/env python3
"""Preview or create a replacement Session with explicitly selected Instant tools.

Default: print a plan, with no network requests. --apply reads COMPOSIO_API_KEY,
verifies current tool metadata, and creates one Session. No provider tool runs.
"""
import argparse
import http.client
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://backend.composio.dev"
RETIRED = {
    "browser_tool": "Choose supported browser_use tools.",
    "composio_search": "Choose supported exa, tavily, or serpapi tools.",
    "text_to_pdf": "Choose supported pdf_co tools. PDF.co Instant supports URL-based conversion.",
    "weathermap": "Choose supported accu_weather tools and adapt arguments and responses.",
}


def selected_tools(values):
    selected = {}
    for value in values:
        parts = value.split(":")
        if len(parts) != 2:
            raise ValueError("Each --tool must be TOOLKIT:TOOL_SLUG, for example exa:EXA_SEARCH.")
        toolkit, slug = parts
        if not re.fullmatch(r"[a-z][a-z0-9_]*", toolkit) or not re.fullmatch(r"[A-Z][A-Z0-9_]*", slug):
            raise ValueError("Use an exact lowercase toolkit slug and uppercase tool slug.")
        if toolkit in RETIRED:
            raise ValueError(toolkit + ": " + RETIRED[toolkit])
        if slug in selected.setdefault(toolkit, []):
            raise ValueError("Duplicate tool: " + value)
        if any(slug in tools for name, tools in selected.items() if name != toolkit):
            raise ValueError("A tool slug cannot be assigned to multiple toolkits.")
        selected[toolkit].append(slug)
    return {name: sorted(tools) for name, tools in sorted(selected.items())}


def make_payload(user_id, selected):
    filters = {name: {"enable": tools} for name, tools in selected.items()}
    return {
        "user_id": user_id,
        "toolkits": {"enable": list(selected)},
        "tools": filters,
        "instant": {"toolkits": {"enable": list(selected)}, "tools": filters},
    }


def request(method, path, key, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"x-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if method == "POST" and (error.code >= 500 or error.code in (408, 429)):
            raise RuntimeError(f"POST returned HTTP {error.code}. Session creation outcome is unknown. Check your project before trying again. No automatic retry was made.") from None
        raise RuntimeError(f"{method} returned HTTP {error.code}. Check the project and permissions; no retry was made.") from None
    except (OSError, TimeoutError, http.client.HTTPException, json.JSONDecodeError, UnicodeError):
        message = "Session creation outcome is unknown. Check your project before trying again." if method == "POST" else "Metadata could not be read. No Session was created."
        raise RuntimeError(message + " No automatic retry was made.") from None


def verify_tools(selected, key):
    for toolkit, slugs in selected.items():
        for slug in slugs:
            path = "/api/v3.1/tools/" + urllib.parse.quote(slug, safe="") + "?toolkit_versions=latest&include_pricing=true"
            tool = request("GET", path, key)
            if not isinstance(tool, dict):
                raise RuntimeError("Unexpected tool metadata; no Session was created.")
            toolkit_info = tool.get("toolkit")
            if not isinstance(toolkit_info, dict) or tool.get("slug") != slug or toolkit_info.get("slug") != toolkit:
                raise RuntimeError("Tool identity mismatch for " + slug + "; no Session was created.")
            instant = tool.get("instant") or {}
            if not isinstance(instant, dict) or instant.get("supported") is not True:
                raise RuntimeError(slug + " does not currently report Instant support; no Session was created.")
            price = instant.get("price") or {}
            if not isinstance(price, dict):
                raise RuntimeError("Invalid published price for " + slug + "; no Session was created.")
            description = price.get("description")
            if not isinstance(description, str) or not description.strip():
                raise RuntimeError("Missing published price for " + slug + "; no Session was created.")
            print(slug + ": " + description)
            if price.get("discount") is not None:
                print("Published discount: " + str(price["discount"]))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", required=True, help="Your application's existing user ID.")
    parser.add_argument("--tool", action="append", required=True, help="Exact TOOLKIT:TOOL_SLUG; repeat for each allowed tool.")
    parser.add_argument("--apply", action="store_true", help="Verify metadata and create one replacement Session. Does not execute tools.")
    args = parser.parse_args(argv)
    if not args.user_id.strip():
        parser.error("--user-id must not be empty")
    try:
        selected = selected_tools(args.tool)
    except ValueError as error:
        parser.error(str(error))
    payload = make_payload(args.user_id, selected)
    print(json.dumps({"method": "POST", "url": BASE + "/api/v3.1/tool_router/session", "body": payload}, indent=2))
    if not args.apply:
        print("Preview only. No network requests made. Review tool schemas and published rates before using --apply.")
        return 0
    key = os.environ.get("COMPOSIO_API_KEY", "")
    if not key:
        parser.error("Set COMPOSIO_API_KEY for the intended project before using --apply.")
    try:
        verify_tools(selected, key)
        result = request("POST", "/api/v3.1/tool_router/session", key, payload)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    session_id = result.get("session_id") if isinstance(result, dict) else None
    if not isinstance(session_id, str) or not session_id:
        print("Session creation response did not include session_id. Outcome is unknown; inspect your project before retrying.", file=sys.stderr)
        return 1
    print("Created replacement Session: " + session_id)
    print("Use this Session in your application. Existing Sessions and application code were not changed. No provider tool was executed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
