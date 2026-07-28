.PHONY: clean-build sync provider create-provider env fmt chk snt tst type_inference dead-code bump build format check sanity test

PROVIDER_DIRS := $(patsubst %/,%,$(sort $(dir $(wildcard providers/*/pyproject.toml))))

clean-build:
	@rm -rf dist/ build/
	@set -e; for provider in $(PROVIDER_DIRS); do\
		rm -rf build $$provider/dist $$provider/build;\
	done

sync:
	@uv sync
	@uv pip install -e .

provider:
	@set -e; for provider in $(PROVIDER_DIRS); do\
		uv pip install $$provider;\
	done

create-provider:
	@if [ -z "$(name)" ]; then\
		echo "Please provide a provider name: make create-provider name=<provider-name> [agentic=true] [output=<directory>]";\
		exit 1;\
	fi
	@ARGS="$(name)";\
	if [ "$(agentic)" = "true" ]; then\
		ARGS="$$ARGS --agentic";\
	fi;\
	if [ ! -z "$(output)" ]; then\
		ARGS="$$ARGS --output-dir $(output)";\
	fi;\
	bash scripts/create-provider.sh $$ARGS

env:
	@echo "* creating new environment"
	@if [ -z "$$VIRTUAL_ENV" ];\
	then\
		uv venv --seed --prompt composio --python 3.12;\
		uv sync;\
		uv sync --dev;\
		make provider;\
		uv pip install -e .;\
		echo "* enter virtual environment with all development dependencies now";\
	else\
		uv sync;\
		uv pip install -e .;\
		echo "* already in a virtual environment (exit first ('deactivate') to create a new environment)";\
	fi
	@echo "* run 'source .venv/bin/activate' to enter the development environment."


fmt:
	@nox -s fmt

chk:
	@nox -s chk

dead-code:
	@nox -s dead_code

snt:
	@nox -s snt

tst:
	@nox -s tst

type_inference:
	@nox -s type_inference

# Friendly aliases for the short session names above (e.g. `make test` == `make tst`).
format: fmt
check: chk
sanity: snt
test: tst

bump: clean-build
	@uv run python scripts/bump.py

build: clean-build
	@./.venv/bin/python -m build
	@set -e; for provider in $(PROVIDER_DIRS); do\
		./.venv/bin/python -m build $$provider;\
		cp $$provider/dist/* dist/;\
	done
