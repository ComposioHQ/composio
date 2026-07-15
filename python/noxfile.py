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

# Type stubs and provider libraries installed solely so mypy can resolve
# imports across `providers/` and `tests/`. These can't live in the locked
# `dev` dependency group: the provider libraries (crewai, langchain,
# llama-index, ...) would drag conflicting transitive deps into the root
# resolution. Shared test/lint tooling (ruff, pytest, fastapi, semver,
# langchain-openai) is sourced from the `dev` group in pyproject.toml via
# `--group dev`, so every package is declared in exactly one place.
type_stubs = [
    "types-requests==2.33.0.20260518",
    "types-protobuf==7.34.1.20260518",
    "anthropic==0.111.0",
    "crewai==0.134.0",
    "langchain==1.3.10",
    "langgraph==1.2.6",
    "llama-index==0.14.22",
    "openai-agents==0.17.6",
    "google-cloud-aiplatform==1.158.0",
]

mypy = "mypy==2.1.0"

ruff = [
    "ruff",
    "--config",
    "config/ruff.toml",
]


@nox.session
def fmt(session: Session):
    """Format code"""
    session.install("--group", "dev")
    session.run("ruff", "check", "--select", "I", "--fix", *modules_for_ruff)
    session.run("ruff", "format", *modules_for_ruff)


@nox.session
def chk(session: Session):
    """Check for linter and type issues"""
    session.install(".", "--group", "dev", mypy, *type_stubs)
    session.run(*ruff, "check", *modules_for_ruff)
    for module in modules_for_mypy:
        session.run("mypy", "--config-file", "config/mypy.ini", module)


@nox.session
def fix(session: Session):
    """Fix linter issues"""
    session.install("--group", "dev")
    session.run(*ruff, "check", "--fix", *modules_for_ruff)


@nox.session
def tst(session: Session):
    """Run the Python unit test suite."""
    session.install(".", "--group", "dev")
    session.install("./providers/langchain")
    session.install("./providers/autogen")
    test_paths = session.posargs or ["tests/"]
    session.run("pytest", *test_paths, "-v", "--tb=short")


@nox.session
def snt(session: Session):
    """Run fast sanity tests for imports and SDK initialization."""
    session.install(".", "--group", "dev")
    test_paths = session.posargs or ["tests/test_imports.py", "tests/test_sdk.py"]
    session.run("pytest", *test_paths, "-v", "--tb=short")


@nox.session
def type_inference(session: Session):
    """Type check provider return type inference tests.

    This session verifies that mypy correctly infers provider-specific return
    types from `Composio.tools.get()` when using @overload signatures.

    Unlike the `chk` session, this installs all provider packages so mypy can
    resolve the provider types and verify the type inference works correctly.
    """
    # Install core SDK, shared dev tooling, and mypy
    session.install(".", "--group", "dev", mypy, *type_stubs)

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


# Modules scanned for dead code (source only, no tests/examples/scripts)
modules_for_vulture = [
    "composio/",
    "providers/",
]


@nox.session(name="dead_code")
def dead_code(session: Session):
    """Report likely-dead code (unused functions, classes, variables).

    Report-only: vulture exits 1 when it finds candidates, but we do not fail
    the session on that so it never blocks CI on false positives. Vet the
    output by hand; suppress confirmed false positives by adding the symbol to
    ``config/vulture_allowlist.py``. Ruff already covers unused imports (F401)
    and unused locals (F841) in the `chk` session; vulture adds cross-module
    unused functions/classes that ruff cannot see.
    """
    session.install("vulture>=2.14")
    session.run(
        "vulture",
        *modules_for_vulture,
        "config/vulture_allowlist.py",
        "--min-confidence",
        "80",
        "--exclude",
        "*/build/*,*/dist/*,*/.venv/*,*/.nox/*,*/__pycache__/*",
        # vulture exit codes: 0 = clean, 3 = candidates found. Report-only, so
        # neither should fail the session. (1/2 are real usage/parse errors.)
        success_codes=[0, 3],
    )
