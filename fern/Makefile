.PHONY: docs sdk-generate docs-dev

# Generate API docs and run the docs server
docs: sdk-generate docs-dev

# Generate API documentation
sdk-generate:
	@echo "Generating API documentation..."
	uv run generators/api_doc_generator/generate_api_docs.py -s ../python/composio/ -o sdk/
	bun run typedoc --plugin typedoc-plugin-markdown ../js/src/index.ts ../js/src/sdk/index.ts --out ./sdk/composio/js --skipErrorChecking

# Generate Tool documentation
tools-generate:
	@echo "Generating Tool documentation..."
	uv run generators/tool_doc_generator/main.py --workers 10

# Run the docs development server
docs-generate: sdk-generate tools-generate

# Run fern local server
docs-dev:
	@echo "Starting documentation server..."
	fern docs dev

# Help target
help:
	@echo "Available targets:"
	@echo "  docs          - Generate API docs and run the docs server"
	@echo "  sdk-generate  - Generate API documentation only"
	@echo "  docs-dev      - Generate docs and run the docs server"