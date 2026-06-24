#!/usr/bin/env python3
"""Bump version, release-tag URLs, and per-platform sha256 in a Composio Homebrew formula.

Used by .github/workflows/cli.bump-homebrew-tap.yml. Reads inputs from env vars
so the bash side has a clean interface; can be run locally for testing:

    TAG=@composio/cli@0.2.29 VERSION=0.2.29 \\
      DARWIN_ARM=<sha> DARWIN_X86=<sha> LINUX_ARM=<sha> LINUX_X86=<sha> \\
      .github/scripts/bump-homebrew-formula.py path/to/Formula/composio.rb

Exits non-zero if any required env var is missing/invalid or if no edits land.
"""

from __future__ import annotations

import os
import re
import sys


REQUIRED_ENV = ("TAG", "VERSION", "DARWIN_ARM", "DARWIN_X86", "LINUX_ARM", "LINUX_X86")
SHA256_RE = re.compile(r"[0-9a-f]{64}")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <formula-path>", file=sys.stderr)
        return 2

    path = argv[1]
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        print(f"missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 2

    tag = os.environ["TAG"]
    version = os.environ["VERSION"]
    shas = {
        "darwin-aarch64": os.environ["DARWIN_ARM"],
        "darwin-x64":     os.environ["DARWIN_X86"],
        "linux-aarch64":  os.environ["LINUX_ARM"],
        "linux-x64":      os.environ["LINUX_X86"],
    }
    for plat, sha in shas.items():
        if not SHA256_RE.fullmatch(sha):
            print(f"invalid sha for {plat}: {sha!r}", file=sys.stderr)
            return 2

    with open(path) as f:
        src = f.read()

    # Bump version line. Lambda avoids replacement-string backreference parsing
    # (e.g. a hostile tag containing \g<1>); same defense on tag/sha below.
    src, n_ver = re.subn(
        r'^(\s*version\s+)"[^"]+"',
        lambda m: f'{m.group(1)}"{version}"',
        src,
        count=1,
        flags=re.M,
    )

    # Bump the release-tag segment of each download URL.
    src, n_url = re.subn(
        r"(releases/download/)@composio/cli@[^/]+(/composio-)",
        lambda m: f"{m.group(1)}{tag}{m.group(2)}",
        src,
    )

    # Bump each sha256 by pairing it with the URL line directly above.
    updated_platforms: set[str] = set()

    def repl_sha(match: re.Match[str]) -> str:
        url_line, sha_line = match.group(1), match.group(2)
        for plat, sha in shas.items():
            if f"composio-{plat}.zip" in url_line:
                updated_platforms.add(plat)
                return url_line + re.sub(
                    r'"[0-9a-f]{64}"',
                    lambda _m: f'"{sha}"',
                    sha_line,
                )
        return match.group(0)

    src, n_sha = re.subn(
        r'(url\s+"[^"]+"\s*\n)(\s*sha256\s+"[0-9a-f]{64}")',
        repl_sha,
        src,
    )

    expected_platforms = set(shas)
    if (
        n_ver != 1
        or n_url != len(shas)
        or n_sha != len(shas)
        or updated_platforms != expected_platforms
    ):
        print(
            "bump produced unexpected edits "
            f"(version={n_ver}, url={n_url}, sha={n_sha}, "
            f"updated_platforms={sorted(updated_platforms)})",
            file=sys.stderr,
        )
        return 1

    with open(path, "w") as f:
        f.write(src)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
