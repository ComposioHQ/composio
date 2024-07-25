import subprocess
import typing as t
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import click


logs = Path.cwd() / "logs"
logs.mkdir(exist_ok=True)

errors = []


def _build(file: Path, tag: str, *flags: str) -> None:
    """Build docker image."""
    log = f"composio_swe_{tag}.stderr"
    tag = f"composio/swe:{tag}"

    print(f"Starting build for {tag} @ {file}")
    with open(logs / log, "w+", encoding="utf-8") as stderr:
        process = subprocess.run(
            ["docker", "build", str(file.parent), "-f", str(file), "-t", tag, *flags],
            stderr=stderr,
        )

    if process.returncode == 0:
        print(f"Finished build for {tag}")
    else:
        print(f"Error building {tag} - {logs / log}")
        errors.append(f"Error building {tag} - {logs / log}")


def _base(generated: Path) -> None:
    """Build base images."""
    base = generated / "base"

    with ThreadPoolExecutor() as executor:
        futures = []
        for file in base.iterdir():
            _, tag = file.name.split(".", maxsplit=1)
            futures.append(executor.submit(_build, file, tag))
        _ = [fut.result() for fut in futures]


def _swes(generated: Path) -> None:
    with ThreadPoolExecutor() as executor:
        futures = []
        for child in generated.iterdir():
            if child.name == "base":
                continue

            if child.is_file():
                continue

            repo = child.name.replace("__", "-")
            for version in child.iterdir():
                tag = f"{repo}-{version.name.replace('.', '-')}"
                futures.append(
                    executor.submit(
                        _build,
                        version / "Dockerfile",
                        tag,
                    )
                )

        _ = [fut.result() for fut in futures]


def _pyenv(file: t.Optional[Path] = None) -> None:
    print("Print building pyenv base")
    file = file or Path(__file__).parent / "templates" / "Dockerfile.pyenv"
    _build(file=file, tag="pyenv")


@click.command(name="build")
@click.argument(
    "generated",
    type=str,
    default="./generated",
)
def build(generated: Path) -> None:
    """Build docker images for SWEKIT."""
    _pyenv()

    generated = Path(generated or Path.cwd() / "generated").resolve()
    _base(generated=generated)
    if len(errors) > 0:
        print("==== Errors ====")
        print("\n".join(errors))
        return

    _swes(generated=generated)
    print("==== Errors ====")
    print("\n".join(errors))


if __name__ == "__main__":
    build()
