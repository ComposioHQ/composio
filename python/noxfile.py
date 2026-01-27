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


@nox.session
def type_inference(session: Session):
    """Type check provider return type inference tests.

    This session verifies that mypy correctly infers provider-specific return
    types from `Composio.tools.get()` when using @overload signatures.

    Unlike the `chk` session, this installs all provider packages so mypy can
    resolve the provider types and verify the type inference works correctly.
    """
    # Install core SDK and mypy
    session.install(".", "mypy==1.13.0", *type_stubs)

    # Install all provider packages for type resolution
    session.install(
        "./providers/anthropic",
        "./providers/autogen",
        "./providers/claude_agent_sdk",
        "./providers/crewai",
        "./providers/gemini",
        "./providers/google",
        "./providers/google_adk",
        "./providers/langchain",
        "./providers/langgraph",
        "./providers/llamaindex",
        "./providers/openai",
        "./providers/openai_agents",
    )

    # Run mypy on type inference test files
    # Note: explicitly listed files are checked even if they match the exclude pattern in `mypy.ini`
    session.run(
        "mypy",
        "--config-file",
        "config/mypy.ini",
        "tests/test_type_inference.py",
        "tests/test_type_inference_anthropic.py",
        "tests/test_type_inference_autogen.py",
        "tests/test_type_inference_claude_agent_sdk.py",
        "tests/test_type_inference_crewai.py",
        "tests/test_type_inference_gemini.py",
        "tests/test_type_inference_google.py",
        "tests/test_type_inference_google_adk.py",
        "tests/test_type_inference_langchain.py",
        "tests/test_type_inference_langgraph.py",
        "tests/test_type_inference_llamaindex.py",
        "tests/test_type_inference_openai_agents.py",
    )
