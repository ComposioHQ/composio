# Contributing

Contributions to the framework, its plugins, related tools and tools are welcome, and they are greatly appreciated! Every little bit helps, and credit will always be given.

There are various ways to contribute:

- If you need support, want to report a bug or ask for features, you can check the [Issues page](https://github.com/composiohq/composio/issues) and raise an issue, if applicable.
- If you would like to contribute a bug fix or feature, then [Submit a pull request](https://github.com/composiohq/composio/pulls).
- If you have other kinds of feedback, you can contact one of the [authors](https://github.com/composiohq/composio/blob/master/AUTHORS.md) by email.

> Before reading on, please have a look at the [code of conduct](https://github.com/composiohq/composio/blob/master/CODE_OF_CONDUCT.md).

## A few simple rules

- Before working on a feature, reach out to one of the core developers or discuss the feature in an issue. The framework caters a diverse audience and new features require upfront coordination.
- Include unit tests for 100% coverage if possible when you contribute new features, as they help to a) prove that your code works correctly, and b) guard against future breaking changes to lower the maintenance cost.
- Bug fixes also generally require unit tests, because the presence of bugs usually indicates insufficient test coverage.
- Keep API compatibility in mind when you change code in the `composio`. Although `composio` does not have a LTS release yet there are a lot of downstream dependencies which would be affected by a breaking changes, so if there are any breaking changes on your PR try to maintain backwards compatibility by introducing a [deprecation warning](https://github.com/composiohq/composio/blob/master/python/composio/utils/decorators.py#L15) on the existing API and discussing the breaking changes with maintainers.
- When you contribute a new feature to `composio`, the maintenance burden is transferred to the core team. This means that the benefit of the contribution must be compared against the cost of maintaining the feature.
- Before committing and opening a PR, run all tests locally. This saves CI hours and ensures you only commit clean code.

## Contributing code

If you have improvements, send us your pull requests!

A team member will be assigned to review your pull requests. All tests are run as part of CI as well as various other checks (code formatting, linters, static type checkers, etc). If there are any problems, feedback is provided via GitHub. Once the pull requests is approved and passes continuous integration checks, you or a team member can merge it.

If you want to contribute, start working through the codebase, navigate to the GitHub `issues` tab and start looking through interesting issues. If you are not sure of where to start, then start by trying one of the smaller/easier issues here i.e. issues with the `good first issue` label and then take a look at the issues with the `contributions welcome` label. These are issues that we believe are particularly well suited for outside contributions, often because we probably won't get to them right now. If you decide to start on an issue, leave a comment so that other people know that you're working on it. If you want to help out, but not alone, use the issue comment thread to coordinate.

*Note:* When opening a PR make sure you open the PR against `development` and not the `master` branch.

## Development setup

- The simplest way to get setup for development on the framework is to install Python `>=3.8` and `pipenv`, then run the following:

      make env
      pipenv shell

##  For a clean PR run checks in the following order before pushing the code on a PR

- make clean
- make format-code
- make check-code

## Further commands needed during development

We have various commands which are helpful during development.

- For independent linting and static analysis:
  - Use `tox -e isort` and `tox -e black` for formatting code
  - Use `tox -e isort-check` and `tox -e black-check` for checking code formatting
  - Use `tox -e flake8` and `tox -e pylint` to run code linters
  - Use `tox -e mypy` for type checking

Read more detailed guides on development [here](python/docs/development.md).
