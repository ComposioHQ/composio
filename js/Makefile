
.PHONY: install
install:
	pnpm install

.PHONY: build
build:
	pnpm run build

.PHONY: lint
lint:
	pnpm run lint

.PHONY: setup_cli
setup_cli:
	./setup_cli.sh

.PHONY: bump_version
bump_version:
	./bump_version.sh

.PHONY: test
test:
	pnpm run test

.PHONY: switch_package
switch_package:
	./switch_package.sh

## add support for publishing to npm
.PHONY: publish
publish:
	./switch_package.sh
	./bump_version.sh
	pnpm run build
	cd dist && pnpm publish
