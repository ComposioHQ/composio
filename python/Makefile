.PHONY: clean-build
clean-build:
	
	rm -fr build/
	rm -fr dist/
	rm -fr .eggs/

	find . -name '*.egg-info' -exec rm -fr {} +
	find . -name '*.egg' -exec rm -fr {} +
	find . -type d -name __pycache__ -exec rm -rv {} +

	for dir in plugins/*; do \
		if [ -d "$$dir" ]; then \
			rm -rf "$$dir"/dist; \
		fi \
	done

.PHONY: clean-pyc
clean-pyc:
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +
	find . -name '__pycache__' -exec rm -fr {} +
	find . -name '.DS_Store' -exec rm -fr {} +

.PHONY: clean-test
clean-test: clean-cache
	rm -fr htmlcov/
	rm -f .coverage
	rm -fr coverage.xml

	find . -name ".coverage*" -not -name ".coveragerc" -exec rm -fr "{}" \;

.PHONY: clean-cache
clean-cache:
	rm -fr .tox/
	rm -fr .pytest_cache/
	rm -fr .mypy_cache/

.PHONY: clean
clean: clean-test clean-build clean-pyc

.PHONY: dist
dist:
	rm -rf dist/
	python setup.py sdist

.PHONY: build
build:
	python -m build && \
	for dir in plugins/*; do \
		if [ -d "$$dir" ]; then \
			python -m build "$$dir" --outdir="$$dir"/dist; \
		fi \
	done

.PHONY: publish
publish: dist
	twine upload dist/* --username token --password "$$PYPI_PASSWORD" && \
	for dir in plugins/*; do \
		if [ -d "$$dir" ]; then \
			twine upload "$$dir"/dist/* --username token --password "$$PYPI_PASSWORD"; \
		fi; \
	done

.PHONY: test-publish
test-publish: dist
	twine upload --repository testpypi dist/* --username token --password "$$PYPI_PASSWORD" && \
	for dir in plugins/*; do \
		if [ -d "$$dir" ]; then \
			twine upload --repository testpypi "$$dir"/dist/* --username token --password "$$PYPI_PASSWORD"; \
		fi \
	done

.PHONY: format-code
format-code:
	tox -e isort
	tox -e black

.PHONY: fmt
fmt: format-code
	@echo

.PHONY: check-code
check-code:
	tox run-parallel -e isort-check,black-check,flake8,mypy,pylint --parallel-no-spinner

.PHONY: chk
chk: check-code
	@echo

.PHONY: format-and-check
format-and-check:
	make format-code
	make check-code

.PHONY: env
env: clean
	if [ -z "$$VIRTUAL_ENV"];\
	then\
		pipenv --rm;\
		pipenv --clear;\
		pipenv --python 3.10;\
		pipenv install --skip-lock;\
		pipenv install --dev --skip-lock;\
		pipenv run pip install -e swe;\
		pipenv run pip install -e plugins/autogen;\
		pipenv run pip install -e plugins/claude;\
		pipenv run pip install -e plugins/crew_ai;\
		pipenv run pip install -e plugins/griptape;\
		pipenv run pip install -e plugins/julep;\
		pipenv run pip install -e plugins/langchain;\
		pipenv run pip install -e plugins/llamaindex;\
		pipenv run pip install -e plugins/lyzr;\
		pipenv run pip install -e plugins/openai;\
		pipenv run pip install -e .;\
		echo "Enter virtual environment with all development dependencies now: 'pipenv shell'.";\
	else\
		echo "In a virtual environment! Exit first: 'exit'.";\
	fi

.PHONY: login
login:
	@composio logout
	@composio login

.PHONY: login-staging
login-staging:
	@COMPOSIO_BASE_URL=https://staging-backend.composio.dev/api make login

.PHONY: login-prod
login-prod:
	@COMPOSIO_BASE_URL=https://backend.composio.dev/api make login

test-demo:
	for dir in plugins/*; do \
		find $$dir -name '*_demo.py' -exec python3 {} \;;\
	done
