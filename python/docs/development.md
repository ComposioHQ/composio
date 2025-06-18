# Development Docs

## Setup

Install [pipenv](https://pipenv.pypa.io), then run `make env` to create a new environment.

**NOTE**: You can use `make env` to create a new environment and clean your environment up every time.

## Plugins

The providers are in the `plugins/` folder, and these are namespaced under `composio_PROVIDER`. 


## Testing

This project uses `tox` to run tests since the optional plugins could conflict with each other.
You do not need to install this separately if you've installed the dev dependencies by running
`make env`. Here are the commands to test the different providers:

1. `tox -r -e core` - Tests the core package
2. `tox -r -e openai` - Tests the openai plugin
3. `tox -r -e langchain` - Tests the langchain plugin

