"""
Example demonstrating the Tool Router session files API.

Shows how to list, upload, download, and delete files in a tool router
session's virtual filesystem. Also demonstrates search and execute.

Requires COMPOSIO_API_KEY and OPENAI_API_KEY to be set.
"""

import tempfile
from pathlib import Path

from composio import Composio
from composio_openai import OpenAIProvider


def main():
    composio = Composio(provider=OpenAIProvider())

    # Create a session
    print("Creating tool router session...")
    session = composio.tool_router.create(user_id="demo_files_user")
    print(f"  Session ID: {session.session_id}")

    # Upload a file (from bytes)
    print("\nUploading file (bytes)...")
    remote = session.files.upload(
        b'{"hello": "world"}',
        remote_path="test_data.json",
        mimetype="application/json",
    )
    print(f"  Uploaded to: {remote.mount_relative_path}")

    # List files
    print("\nListing files...")
    result = session.files.list(path="/")
    print(f"  Items: {len(result.items)}")
    for item in result.items:
        print(f"    - {item.mount_relative_path} ({item.size} bytes)")

    # Download the file
    print("\nDownloading file...")
    downloaded = session.files.download(remote.mount_relative_path)
    content = downloaded.text()
    print(f"  Content: {content[:80]}...")

    # Upload from local file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("Hello from local file")
        local_path = f.name
    try:
        print("\nUploading from local path...")
        remote2 = session.files.upload(local_path)
        print(f"  Uploaded to: {remote2.mount_relative_path}")
    finally:
        Path(local_path).unlink(missing_ok=True)

    # List again
    print("\nListing files (after 2nd upload)...")
    result2 = session.files.list(path="/")
    print(f"  Items: {len(result2.items)}")
    for item in result2.items:
        print(f"    - {item.mount_relative_path} ({item.size} bytes)")

    # Delete
    print("\nDeleting test files...")
    session.files.delete(remote.mount_relative_path)
    session.files.delete(remote2.mount_relative_path)
    print("  Deleted.")

    # Search for tools
    print("\nSearching for tools...")
    search_result = session.search(query="send email")
    print(f"  Success: {search_result.success}, Results: {len(search_result.results)}")
    if search_result.results:
        r = search_result.results[0]
        print(
            f"  First result: {r.primary_tool_slugs[:3] if r.primary_tool_slugs else []}"
        )

    print("\nAll files API operations succeeded.")


if __name__ == "__main__":
    main()
