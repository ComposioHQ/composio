# Development Guide For Composio Core

## Setup

- Make sure your machine has `python>=3.8` and `pipenv` installed
- Run `make env` to create a fresh virtual environment
- Run `pipenv shell` to enter virtual environment shell

## Writing code

- Composio follows standard python naming conventions, eg. `snake_case` for variables, method names and `PascalCase` for class names.
- Make sure the methods are well documented with proper usage of [`docstrings`](https://peps.python.org/pep-0257/)
- The codebase follows strict formatting guidelines so run `make format-code` or `tox -e isort` and `tox -e black` once you're done writing code to fix the formatting.
- The framework and the plugins are strictly type checked, so make sure to run `tox -e mypy` to catch any typing errors and fix them before pushing the code to your PR.
- Keep API compatibility in mind. Although `composio` does not have a LTS release yet there are a lot of downstream dependencies which would be affected by a breaking changes, so if there are any breaking changes on your PR try to maintain backwards compatibility by introducing a [deprecation warning](https://github.com/composiohq/composio/blob/master/python/composio/utils/decorators.py#L15) on the existing API.

## Creating a PR

- When branching out use `{purpose}/{name}` format, for example
  - To create a feature branch, `feat/feature-name`
  - To create a bug fix branch, `fix/fix-name` or `fix/issue-number` (`fix/12`)
  - To add tests, `test/api-name`
  - For documentation, `docs/change-name`
- Follow [semantic commit](https://www.conventionalcommits.org/en/v1.0.0/) standards
- Use a descriptive title for creating a PR
  - `fix: login cli tool` is a bad way to name a PR
  - `Fixes the user validation on the login command` is more apt way to name a PR
- Make sure to specify the breaking changes on the PR description
- Add unit tests whenever possible as a proof that your code works
- Make sure to run the code formatters and linters before pushing your code to save some time on the CI.

## Code formatting and Linters

Composio uses

- `isort` and `black` for code formatting
- `flake8` and `pylint` for linting
- `mypy` for type checking

To run each of these individually use `tox`

- Run code formatting using `tox -e isort` and `tox -e black`
- Check code formatting using `tox -e isort-check` and `tox -e black-check`
- Run linters using `tox -e flake8` and `tox -e pylint`
- Run type checking using `tox -e mypy`


## Unit tests

Run unit tests using `tox -e test` to verify the changes you made and check the code coverage.

## Environment variables

- `COMPOSIO_API_KEY`: Environment variable for Composio API key
- `COMPOSIO_BASE_URL`: Environment variable for Composio API server base URL
