"""Constants for SWE Kit."""

LOCAL_CACHE_DIRECTORY_NAME = ".composio_coder"
MODEL_ENV_PATH = "model_env"
ISSUE_CONFIG_PATH = "issue_config"
LOGS_DIR = "logs"

# model_env settings
KEY_AZURE_ENDPOINT = "azure_endpoint"
KEY_GIT_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN"
KEY_API_KEY = "api_key"
KEY_MODEL_ENV = "model_env"
MODEL_ENV_AZURE = "azure"
MODEL_ENV_OPENAI = "openai"

MAP_REPO_TO_TEST_CMD = {
    "django/django": "./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1",
    "sympy/sympy": "PYTHONWARNINGS='ignore::UserWarning,ignore::SyntaxWarning' bin/test -C --verbose sympy",
    "pallets/flask": "pytest -rA tests",
    "astropy/astropy": "pytest -rA astropy",
    "matplotlib/matplotlib": "pytest -rA lib/matplotlib/tests",
    "pylint/pylint": "pytest -rA tests",
    "pytest/pytest": "pytest -rA testing",
    "psf/requests": "pytest -rA test_requests.py",
    "scikit-learn/scikit-learn": "pytest -rA sklearn",
    "mwaskom/seaborn": "pytest --no-header -rA tests",
    "sphinx-doc/sphinx": "tox --current-env -epy39 -v -- tests",
    "pydata/xarray": "pytest -rA xarray/tests/",
}
