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
	@cd e2b/ && bash build.sh

.PHONY: e2b-dev
e2b-dev:
	@cd e2b-dev/ && bash build.sh

.PHONY: prod
prod:
	@docker build . -t angrybayblade/composio -f Dockerfile

.PHONY: prod-multi
prod-multi:
	@docker buildx build --platform linux/amd64,linux/arm64 . -t angrybayblade/composio -f Dockerfile --push

.PHONY: dev
dev: _copy-composio
	@docker build . -t angrybayblade/composio:dev -f Dockerfile.dev
	@rm -rf ./composio

