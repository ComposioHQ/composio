from __future__ import annotations

from pathlib import Path


REPO_PYTHON_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_ROOT = REPO_PYTHON_ROOT / "examples"


def main() -> None:
    if not EXAMPLES_ROOT.is_dir():
        raise SystemExit(
            f"Missing examples directory: {EXAMPLES_ROOT.relative_to(REPO_PYTHON_ROOT)}"
        )

    example_files = sorted(EXAMPLES_ROOT.rglob("*.py"))
    if not example_files:
        raise SystemExit("No Python example files found.")

    failures: list[str] = []
    for file_path in example_files:
        relative_path = file_path.relative_to(REPO_PYTHON_ROOT)
        source = file_path.read_text(encoding="utf-8")
        if not source.strip():
            failures.append(f"{relative_path}: example file must not be empty")
            continue

        try:
            compile(source, str(relative_path), "exec", dont_inherit=True)
        except SyntaxError as error:
            location = f"{relative_path}:{error.lineno}:{error.offset or 1}"
            failures.append(f"{location}: {error.msg}")

    if failures:
        print("Python example validation failed:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print(f"Validated {len(example_files)} Python example files.")


if __name__ == "__main__":
    main()
