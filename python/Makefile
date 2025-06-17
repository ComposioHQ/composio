clean-build:
	@rm -rf dist/ build/
	@for provider in $(shell ls -d providers/*); do\
		rm -rf build $$provider/dist $$provider/build;\
	done

sync:
	@uv sync
	@uv pip install -e .

provider:
	@for provider in $(shell ls -d providers/*); do\
		uv pip install $$provider;\
	done

env:
	@echo "* creating new environment"
	@if [ -z "$$VIRTUAL_ENV" ];\
	then\
		uv venv --seed --prompt composio --python 3.11;\
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

snt:
	@nox -s snt

tst:
	@nox -s tst

bump: clean-build
	@uv run python scripts/bump.py

build: clean-build
	@uv run python -m build
	@for provider in $(shell ls -d providers/*); do\
		uv run python -m build $$provider;\
		cp $$provider/dist/* dist/;\
	done
