import nox

from nox.sessions import Session

nox.options.default_venv_backend = "uv"

# Modules for both ruff and mypy
modules_for_mypy = [
    "composio/",
    "providers/",
    "tests/",
    "scripts/",
]

# Modules for ruff only (includes examples)
modules_for_ruff = [
    "composio/",
    "providers/",
    "tests/",
    "examples/",
    "scripts/",
]

type_stubs = [
    "types-requests",
    "types-protobuf",
    "anthropic",
    "crewai",
    "semver",
    "fastapi",
    "langchain",
    "langgraph",
    "llama-index",
    "openai-agents",
    "langchain-openai",
    "google-cloud-aiplatform",
    "pytest",
]

ruff = [
    "ruff",
    "--config",
    "config/ruff.toml",
]


@nox.session
def fmt(session: Session):
    """Format code"""
    session.install("ruff")
    session.run("ruff", "check", "--select", "I", "--fix", *modules_for_ruff)
    session.run("ruff", "format", *modules_for_ruff)


@nox.session
def chk(session: Session):
    """Check for linter and type issues"""
    session.install(".", "ruff", "mypy==1.13.0", *type_stubs)
    session.run(*ruff, "check", *modules_for_ruff)
    for module in modules_for_mypy:
        session.run("mypy", "--config-file", "config/mypy.ini", module)


@nox.session
def fix(session: Session):
    """Fix linter issues"""
    session.install("ruff")
    session.run(*ruff, "check", "--fix", *modules_for_ruff)
