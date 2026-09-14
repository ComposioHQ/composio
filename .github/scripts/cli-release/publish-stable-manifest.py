#!/usr/bin/env python3
import base64
import json
import os
import re
import subprocess

BRANCH = "cli-stable"
ASSETS = {
    "composio-linux-x64.zip",
    "composio-linux-aarch64.zip",
    "composio-darwin-x64.zip",
    "composio-darwin-aarch64.zip",
    "composio-skill.zip",
    "checksums.txt",
}


def gh(*args, payload=None):
    command = ["gh", *args]
    data = None
    if payload is not None:
        if "--method" not in args:
            command.extend(["--method", "POST"])
        command.extend(["--input", "-"])
        data = json.dumps(payload)
    result = subprocess.run(command, input=data, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def version_tuple(version):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError(f"Invalid stable CLI version: {version}")
    return tuple(int(part) for part in version.split("."))


def publish(repository):
    releases = gh(
        "release", "list", "--repo", repository, "--limit", "1000",
        "--exclude-drafts", "--exclude-pre-releases", "--json", "tagName",
    )
    versions = [
        release["tagName"].removeprefix("@composio/cli@")
        for release in releases
        if re.fullmatch(r"@composio/cli@[0-9]+\.[0-9]+\.[0-9]+", release["tagName"])
    ]
    if not versions:
        raise ValueError("No published stable CLI release found")
    version = max(versions, key=version_tuple)
    tag = f"@composio/cli@{version}"
    release = gh(
        "release", "view", tag, "--repo", repository,
        "--json", "tagName,isDraft,isPrerelease,assets",
    )
    uploaded = {asset["name"] for asset in release["assets"] if asset["state"] == "uploaded"}
    if release["tagName"] != tag or release["isDraft"] or release["isPrerelease"]:
        raise ValueError(f"Refusing to advertise unpublished or unstable release {tag}")
    if ASSETS - uploaded:
        raise ValueError(f"Refusing to advertise incomplete release {tag}: {sorted(ASSETS - uploaded)}")

    api = f"repos/{repository}"
    refs = gh("api", f"{api}/git/matching-refs/heads/{BRANCH}")
    parents = [ref["object"]["sha"] for ref in refs if ref["ref"] == f"refs/heads/{BRANCH}"]
    if parents:
        current = gh("api", f"{api}/contents/version.txt?ref={parents[0]}")
        current_version = base64.b64decode(current["content"]).decode().strip()
        if version_tuple(current_version) >= version_tuple(version):
            print(f"Stable manifest already advertises {current_version}; leaving it unchanged")
            return

    tree = gh("api", f"{api}/git/trees", payload={"tree": [
        {"path": "version.txt", "mode": "100644", "type": "blob", "content": f"{version}\n"},
    ]})
    commit = gh("api", f"{api}/git/commits", payload={
        "message": f"chore(cli): advertise stable {version}",
        "tree": tree["sha"], "parents": parents,
    })
    if parents:
        gh("api", "--method", "PATCH", f"{api}/git/refs/heads/{BRANCH}", payload={
            "sha": commit["sha"], "force": False,
        })
    else:
        gh("api", f"{api}/git/refs", payload={
            "ref": f"refs/heads/{BRANCH}", "sha": commit["sha"],
        })
    print(f"Published stable CLI manifest: {version}")


if __name__ == "__main__":
    publish(os.environ["GITHUB_REPOSITORY"])
