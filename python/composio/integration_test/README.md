# Composio Integration Tests

This directory contains comprehensive integration tests for Composio SDK features.

## MCP Integration Tests

### Files

- **`test_experimental_mcp.py`** - Comprehensive pytest-based test suite
- **`conftest.py`** - Pytest fixtures and configuration
- **`pytest.ini`** - Pytest settings and markers
- **`__init__.py`** - Package initialization

### Running the Tests

#### Prerequisites
Set the required environment variable:
```bash
export COMPOSIO_API_KEY="your_api_key_here"
```

#### Using pytest (Standard approach)
```bash
cd /Users/equinox/composio

# Run all MCP integration tests
python -m pytest python/composio/integration_test/test_experimental_mcp.py -v

# Run specific test classes
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestExperimentalMCPStructure -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPConfigOperations -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPErrorHandling -v

# Run with different verbosity levels
python -m pytest python/composio/integration_test/test_experimental_mcp.py -q  # Quiet
python -m pytest python/composio/integration_test/test_experimental_mcp.py -v  # Verbose
python -m pytest python/composio/integration_test/test_experimental_mcp.py -s  # Show print statements

# Run tests with markers
python -m pytest python/composio/integration_test/test_experimental_mcp.py -m "not slow" -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py -m "requires_auth" -v
```


### What the Tests Cover

#### 1. **API Structure Validation**
- Verifies experimental namespace exists
- Checks all required methods are available
- Validates TypeScript API compatibility

#### 2. **MCP Configuration Management**
- `list()` - List existing configurations with pagination and filtering
- `create()` - Create new MCP configurations
- `get()` - Retrieve configuration by ID
- `get_by_name()` - Retrieve configuration by name

#### 3. **MCP Server Operations**
- `get()` - Get server instance for a user (matches TypeScript)
- `getServer()` - Method available on created configs
- Server instance structure validation

#### 4. **Error Handling**
- Invalid configuration IDs
- Invalid configuration names
- Invalid user IDs
- Empty server configurations

#### 5. **Real API Integration**
- Uses actual Composio API endpoints
- Tests with real auth configurations
- Validates API responses

### Test Results

The test suite provides detailed output including:
- ✅ Passed tests count
- ❌ Failed tests count  
- 🐛 Detailed error messages
- 📈 Success rate percentage

### Example Output

```
🎯 Starting Comprehensive MCP Integration Test
============================================================

🔧 Setting up test environment...
✅ Composio initialized successfully
✅ Using API key: ak_LRRMk...
✅ Experimental namespace verified

🔄 Testing TypeScript API compatibility...
✅ experimental.mcp.get() available
✅ experimental.mcp_config.create() available
✅ experimental.mcp_config.get() available
✅ experimental.mcp_config.get_by_name() available
✅ experimental.mcp_config.list() available
✅ API compatibility verified

📋 Testing MCP config listing...
✅ Basic list successful: found 0 configurations
✅ Paginated list successful: page 1, limit 5
✅ Filtered list successful: found 0 filtered configurations

📊 Test Results Summary
========================================
✅ Passed: 12
❌ Failed: 0
📈 Success Rate: 100.0%

🎉 All tests passed! Experimental MCP is working correctly.
```

### Prerequisites

1. **Composio SDK installed** in development mode:
   ```bash
   cd /Users/equinox/composio/python
   uv pip install -e .
   ```

2. **Valid API key** set as environment variable `COMPOSIO_API_KEY`

3. **Auth configurations** (optional) - for testing create functionality

### Notes

- Tests are designed to be non-destructive
- Created test configurations are tracked for cleanup
- Tests work with or without existing auth configurations
- All API calls use real Composio endpoints (no mocking)
