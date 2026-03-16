import json
import sys

# region setup
from composio import Composio

composio = Composio()
# endregion setup


# region list-tools
def list_tools(toolkit_slug: str):
    """Fetch raw tool definitions for a toolkit and print them."""
    tools = composio.tools.get_raw_composio_tools(toolkits=[toolkit_slug])

    for tool in tools:
        print(f"\n--- {tool.slug} ---")
        print(f"Name: {tool.name}")
        print(f"Description: {tool.description}")

        params = tool.input_parameters or {}
        required = params.get("required", [])
        for name, schema in params.get("properties", {}).items():
            tag = "required" if name in required else "optional"
            print(f"  [{tag}] {name}: {schema.get('type', 'any')} - {schema.get('description', '')}")
# endregion list-tools


# region toolkit-info
def toolkit_info(toolkit_slug: str):
    """Fetch toolkit metadata including auth schemes."""
    toolkit = composio.toolkits.get(toolkit_slug)

    print(f"Name: {toolkit.name}")
    print(f"Slug: {toolkit.slug}")

    if not toolkit.auth_config_details:
        print("Auth: none (no auth required)")
        return

    for scheme in toolkit.auth_config_details:
        print(f"\nAuth scheme: {scheme.mode}")

        if not scheme.fields:
            continue

        creation = scheme.fields.auth_config_creation
        if creation:
            print("  Auth config creation:")
            for field in creation.required or []:
                print(f"    [required] {field.name}: {field.description}")
            for field in creation.optional or []:
                print(f"    [optional] {field.name}: {field.description}")

        connection = scheme.fields.connected_account_initiation
        if connection:
            print("  Account connection:")
            for field in connection.required or []:
                print(f"    [required] {field.name}: {field.description}")
            for field in connection.optional or []:
                print(f"    [optional] {field.name}: {field.description}")
# endregion toolkit-info


# region export
def export(toolkit_slug: str, output_file: str):
    """Export raw tool definitions to a JSON file."""
    tools = composio.tools.get_raw_composio_tools(toolkits=[toolkit_slug])

    data = []
    for tool in tools:
        data.append({
            "slug": tool.slug,
            "name": tool.name,
            "description": tool.description,
            "input_parameters": tool.input_parameters or {},
            "output_parameters": tool.output_parameters or {},
            "scopes": getattr(tool, "scopes", []),
            "tags": getattr(tool, "tags", []),
            "no_auth": getattr(tool, "no_auth", False),
        })

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    print(f"Exported {len(data)} tools to {output_file}")
# endregion export


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python main.py list-tools <toolkit>")
        print("  python main.py toolkit-info <toolkit>")
        print("  python main.py export <toolkit> <output.json>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "list-tools":
        slug = sys.argv[2] if len(sys.argv) > 2 else "gmail"
        list_tools(slug)
    elif command == "toolkit-info":
        slug = sys.argv[2] if len(sys.argv) > 2 else "gmail"
        toolkit_info(slug)
    elif command == "export":
        slug = sys.argv[2] if len(sys.argv) > 2 else "gmail"
        out = sys.argv[3] if len(sys.argv) > 3 else "output.json"
        export(slug, out)
    else:
        print(f"Unknown command: {command}")
        print("Use 'list-tools', 'toolkit-info', or 'export'.")
        sys.exit(1)
