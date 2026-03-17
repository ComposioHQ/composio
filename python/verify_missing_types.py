"""
Verify whether missing_type violations from composio_schema_violations.csv
are still present in the local action files.

Usage:
    python verify_missing_types.py
"""

import csv
from pathlib import Path

MERCURY_PATH = Path.home() / "mercury"


def check_missing_type(schema, path=""):
    """Recursively check for schema nodes missing a 'type' field."""
    missing = []
    if not isinstance(schema, dict):
        return missing

    has_type_info = any(
        k in schema for k in ("type", "anyOf", "oneOf", "allOf", "$ref")
    )
    # A leaf property node should have type info
    if "description" in schema and not has_type_info and "properties" not in schema:
        missing.append(path or "root")

    for k, v in schema.get("properties", {}).items():
        missing.extend(check_missing_type(v, f"{path}.{k}" if path else k))
    if "items" in schema:
        missing.extend(check_missing_type(schema["items"], f"{path}[]"))
    for combo_key in ("anyOf", "oneOf", "allOf"):
        for i, item in enumerate(schema.get(combo_key, [])):
            missing.extend(check_missing_type(item, f"{path}.{combo_key}[{i}]"))
    return missing


def find_action_file(toolkit, tool):
    """Try to locate the action file for a given toolkit/tool."""
    app_dir = MERCURY_PATH / "apps" / toolkit / "actions"
    if not app_dir.exists():
        return None

    action_name = tool.replace(toolkit.upper() + "_", "", 1).lower()

    candidates = (
        list(app_dir.glob(f"{action_name}.py"))
        + list(app_dir.glob(f"generated/{action_name}.py"))
        + list(app_dir.glob(f"{toolkit}_{action_name}.py"))
        + list(app_dir.glob(f"generated/{toolkit}_{action_name}.py"))
    )
    return candidates[0] if candidates else None


def main():
    from mercury.tools.base import Action

    # Parse CSV: group by (toolkit, tool) -> list of reported paths
    tools = {}
    with open("composio_schema_violations.csv") as f:
        for row in csv.DictReader(f):
            if row["check"] == "missing_type":
                key = (row["toolkit"], row["tool"])
                if key not in tools:
                    tools[key] = []
                tools[key].append(row["path"])

    print(f"Total unique tools with missing_type in CSV: {len(tools)}")
    print()

    still_missing = []
    fixed = []
    not_found = []
    errors = []

    for (toolkit, tool), csv_paths in tools.items():
        action_file = find_action_file(toolkit, tool)
        if action_file is None:
            not_found.append((toolkit, tool, csv_paths))
            continue

        try:
            action = Action.from_file(action_file.resolve(), root=MERCURY_PATH)
            schema = action.request.schema()
            missing = check_missing_type(schema)
            if missing:
                still_missing.append((toolkit, tool, csv_paths, missing))
            else:
                fixed.append((toolkit, tool, csv_paths))
        except Exception as e:
            errors.append((toolkit, tool, str(e)[:100]))

    print("Results:")
    print(f"  Fixed (type now present):  {len(fixed)}")
    print(f"  Still missing type:        {len(still_missing)}")
    print(f"  Action file not found:     {len(not_found)}")
    print(f"  Errors loading file:       {len(errors)}")
    print()

    if still_missing:
        print("=" * 80)
        print("STILL MISSING TYPE:")
        print("=" * 80)
        for toolkit, tool, csv_paths, missing_paths in still_missing:
            print(f"  {tool}")
            print(f"    CSV reported:  {csv_paths[:5]}")
            print(f"    Still missing: {missing_paths[:5]}")
            print()

    if not_found:
        print("=" * 80)
        print(f"ACTION FILES NOT FOUND ({len(not_found)}):")
        print("=" * 80)
        for toolkit, tool, csv_paths in not_found[:20]:
            print(f"  {toolkit}/{tool}")
        if len(not_found) > 20:
            print(f"  ... and {len(not_found) - 20} more")
        print()

    if errors:
        print("=" * 80)
        print(f"ERRORS ({len(errors)}):")
        print("=" * 80)
        for toolkit, tool, err in errors[:20]:
            print(f"  {toolkit}/{tool}: {err}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")


if __name__ == "__main__":
    main()
