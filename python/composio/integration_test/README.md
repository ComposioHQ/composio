# Integration Tests

Integration tests for Composio SDK functionality.

## Setup

```bash
export COMPOSIO_API_KEY="your_api_key_here"
```

## Running Tests

```bash
# From project root
cd /path/to/composio
python -m pytest python/composio/integration_test/ -v

# From python directory
cd /path/to/composio/python
pytest composio/integration_test/ -v

# Using uv
cd /path/to/composio/python
uv run pytest composio/integration_test/ -v
```

## Test Files

- **`test_mcp.py`** - MCP (Model Context Protocol) functionality tests
- **`test_tool_router.py`** - ToolRouter experimental feature tests

## Requirements

- Python 3.12+
- pytest
- Valid Composio API key