
.PHONY: install
install:
	pnpm install

.PHONY: build
build:
	pnpm run build

.PHONY: clean
clean:
	rm -rf ./dist

.PHONY: clean_build
clean_build:
	rm -rf ./dist
	pnpm run build

.PHONY: api_client_generate
api_client_generate:
	pnpm run openapispec:generate
	sed -i '' '/export type in = '\''query'\'' | '\''header'\'';/d' src/sdk/client/types.gen.ts
	sed -i '' 's/successfull: boolean/successfull?: boolean/g' src/sdk/client/types.gen.ts
	pnpm prettier

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
.PHONY: release
release:
	./switch_package.sh
	./bump_version.sh
	pnpm run build
	cd dist && pnpm publish
