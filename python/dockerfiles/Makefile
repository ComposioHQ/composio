.PHONY: _copy-composio
_copy-composio:
	@rm -rf composio
	@mkdir composio/
	@cp -r ../composio/ ./composio/composio
	@cp -r ../setup.py ./composio/setup.py
	@cp -r ../README.md ./composio/README.md

.PHONY: _remove-composio
_remove-composio:
	@rm -rf ./composio

.PHONY: e2b
e2b:
# 	E2B adds a default user so we don't have to
	@sed -i.bck 's/RUN useradd/# RUN useradd/g' Dockerfile
	@cd e2b/ && bash build.sh
	@rm Dockerfile && mv Dockerfile.bck Dockerfile

.PHONY: e2b-dev
e2b-dev:
	@cd e2b-dev/ && bash build.sh

.PHONY: prod
prod:
	@docker build . -t composio/composio -f Dockerfile

.PHONY: dev
dev: _copy-composio
	@docker build . -t composio/composio:dev -f Dockerfile.dev
	@rm -rf ./composio
	
.PHONY: ci
ci: _copy-composio
	@docker build . -t composio/composio:dev -f Dockerfile.ci
	@rm -rf ./composio

.PHONY: flyio
flyio: _copy-composio
	@docker buildx build --platform linux/amd64,linux/arm64 -t composio/composio:dev -f Dockerfile.ci . --push
	@rm -rf ./composio

.PHONY: publish
publish:
	@docker buildx build --platform linux/amd64,linux/arm64 -t composio/composio:$$VERSION . --push
	@docker buildx build --platform linux/amd64,linux/arm64 -t composio/composio:latest . --push
