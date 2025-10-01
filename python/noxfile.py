import nox

from nox.sessions import Session

nox.options.default_venv_backend = "uv"

modules = [
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
    session.run("ruff", "check", "--select", "I", "--fix", *modules)
    session.run("ruff", "format", *modules)


@nox.session
def chk(session: Session):
    """Check for linter and type issues"""
    session.install(".", "ruff", "mypy==1.13.0", "langchain-openai", *type_stubs)
    session.run(*ruff, "check", *modules)
    for module in modules:
        session.run("mypy", "--config-file", "config/mypy.ini", module)


@nox.session
def fix(session: Session):
    """Fix linter issues"""
    session.install("ruff")
    session.run(*ruff, "check", "--fix", *modules)
