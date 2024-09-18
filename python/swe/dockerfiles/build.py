import subprocess
import typing as t
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import click


logs = Path.cwd() / "logs"
logs.mkdir(exist_ok=True)

errors = []

ARCHS = ("linux/arm64", "linux/amd64")


def _get_single_build_args(file: Path, tag: str, *flags: str) -> t.List[str]:
    return ["docker", "build", str(file.parent), "-f", str(file), "-t", tag, *flags]


def _get_multi_build_args(file: Path, tag: str, *flags: str) -> t.List[str]:
    return [
        "docker",
        "buildx",
        "build",
        "--platform",
        "linux/amd64,linux/arm64",
        str(file.parent),
        "-f",
        str(file),
        "-t",
        tag,
        "--push",
        *flags,
    ]


def _build(file: Path, tag: str, multi: bool, *flags: str) -> None:
    log = f"composio_swe_{tag}.stderr"
    tag = f"composio/swe:{tag}"

    print(f"Starting build for {tag} @ {file} with {multi=}")
    with open(logs / log, "w+", encoding="utf-8") as stderr:
        process = subprocess.run(
            (_get_multi_build_args if multi else _get_single_build_args)(
                file=file, tag=tag
            ),
            stderr=stderr,
        )

    if process.returncode == 0:
        print(f"Finished build for {tag}")
    else:
        print(f"Error building {tag} - {logs / log}")
        errors.append(f"Error building {tag} - {logs / log}")


def _base(generated: Path, multi: bool = False) -> None:
    base = generated / "base"
    with ThreadPoolExecutor() as executor:
        futures = []
        for file in base.iterdir():
            _, tag = file.name.split(".", maxsplit=1)
            if "3.5" in tag:
                continue
            futures.append(executor.submit(_build, file, tag, multi))
        _ = [fut.result() for fut in futures]


def _swes(generated: Path, multi: bool = False) -> None:
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
                        multi,
                    )
                )

        _ = [fut.result() for fut in futures]


def _pyenv(file: t.Optional[Path] = None, multi: bool = False) -> None:
    print("Print building pyenv base")
    file = file or Path(__file__).parent / "templates" / "Dockerfile.pyenv"
    _build(file=file, tag="pyenv", multi=multi)


@click.command(name="build")
@click.argument(
    "generated",
    type=str,
    default="./generated",
)
@click.option(
    "--multi",
    is_flag=True,
    help="Use this flag to build multi-plaform images",
)
def build(generated: Path, multi: bool = False) -> None:
    """Build docker images for SWEKIT."""
    _pyenv(multi=multi)
    if len(errors) > 0:
        print("==== Errors ====")
        print("\n".join(errors))
        return

    generated = Path(generated or Path.cwd() / "generated").resolve()
    _base(generated=generated, multi=multi)
    if len(errors) > 0:
        print("==== Errors ====")
        print("\n".join(errors))
        return

    _swes(generated=generated, multi=multi)
    print("==== Errors ====")
    print("\n".join(errors))


if __name__ == "__main__":
    build()
