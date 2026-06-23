from __future__ import annotations

from pathlib import Path


def update_env(path: Path, values: dict[str, str]) -> None:
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = existing.splitlines()
    seen = set()
    output: list[str] = []

    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in values:
            output.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            output.append(line)

    if output and output[-1] != "":
        output.append("")

    for key, value in values.items():
        if key not in seen:
            output.append(f"{key}={value}")

    path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
