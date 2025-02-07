import signal
import subprocess
import threading
import typing as t
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import click


logs = Path.cwd() / "logs"
logs.mkdir(exist_ok=True)

# Lock for synchronizing access to the success log
success_lock = threading.Lock()
# Global set to keep track of successfully pushed images
successful_builds = set()


# Load successful builds from logs/success.log into the global set
def load_successful_builds() -> None:
    success_file = logs / "success.log"
    if success_file.exists():
        with open(success_file, "r", encoding="utf-8") as f:
            for line in f:
                tag = line.strip()
                if tag:
                    successful_builds.add(tag)


# Record a successful build by writing to the log file and updating the global set
def record_success(tag: str) -> None:
    with success_lock:
        successful_builds.add(tag)
        with open(logs / "success.log", "a", encoding="utf-8") as f:
            f.write(tag + "\n")


# Insert new global variables and functions for graceful stop and resume support
stop_requested = False


def handle_stop(signum, frame):
    global stop_requested
    print("Received stop signal. Gracefully stopping new builds...")
    stop_requested = True


def _base(generated: Path, multi: bool = False) -> None:
    base = generated / "base"
    with ThreadPoolExecutor() as executor:
        futures = []
        for file in base.iterdir():
            if stop_requested:
                print("Graceful stop activated. Halting base builds.")
                break
            try:
                _, tag_part = file.name.split(".", maxsplit=1)
            except ValueError:
                print(f"Skipping invalid file name format: {file.name}")
                continue
            full_tag = f"composio/swe:{tag_part}"
            if full_tag in successful_builds:
                print(f"Skipping build for {full_tag} as it has been already pushed.")
                continue
            futures.append(executor.submit(_build, file, tag_part, multi))
        [fut.result() for fut in futures]


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
                if stop_requested:
                    print("Graceful stop activated. Halting SWES builds.")
                    break
                tag_part = f"{repo}-{version.name.replace('.', '-') }"
                full_tag = f"composio/swe:{tag_part}"
                if full_tag in successful_builds:
                    print(
                        f"Skipping build for {full_tag} as it has been already pushed."
                    )
                    continue
                futures.append(
                    executor.submit(_build, version / "Dockerfile", tag_part, multi)
                )
            if stop_requested:
                break
        [fut.result() for fut in futures]


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
        record_success(tag)
    else:
        print(f"Error building {tag} - {logs / log}")


def _pyenv(file: t.Optional[Path] = None, multi: bool = False) -> None:
    print("Print building pyenv base")
    file = file or Path(__file__).parent / "templates" / "Dockerfile.pyenv"
    full_tag = "composio/swe:pyenv"
    if full_tag in successful_builds:
        print(f"Skipping build for {full_tag} as it has already been pushed.")
        return
    _build(file=file, tag="pyenv", multi=multi)


@click.command(name="build")
@click.argument("generated", type=str, default="./generated")
@click.option(
    "--multi", is_flag=True, help="Use this flag to build multi-plaform images"
)
def build(generated: Path, multi: bool = False) -> None:
    """Build docker images for SWEKIT."""
    load_successful_builds()
    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    _pyenv(multi=multi)
    print("==== Successful Builds (after pyenv) ====")
    print("\n".join(successful_builds))

    generated = Path(generated or Path.cwd() / "generated").resolve()
    _base(generated=generated, multi=multi)
    print("==== Successful Builds (after base) ====")
    print("\n".join(successful_builds))

    _swes(generated=generated, multi=multi)
    print("==== Final Successful Builds ====")
    print("\n".join(successful_builds))


if __name__ == "__main__":
    build()
