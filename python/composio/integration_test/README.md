# Composio Integration Tests

This directory contains comprehensive integration tests for Composio SDK features.

## Test Files

### Core Test Suites

- **`test_experimental_mcp.py`** - Comprehensive MCP (Model Context Protocol) functionality tests
- **`test_tool_router.py`** - ToolRouter experimental feature tests
- **`test_mcp_no_auth_toolkits.py`** - MCP tests with non-authentication toolkits
- **`conftest.py`** - Pytest fixtures and shared configuration
- **`pytest.ini`** - Pytest settings and configuration

## Running the Tests

### Prerequisites
Set the required environment variable:
```bash
export COMPOSIO_API_KEY="your_api_key_here"
```

### Using pytest (Recommended)

#### Run All Integration Tests
```bash
cd /Users/equinox/composio

# Run all integration tests
python -m pytest python/composio/integration_test/ -v

# Run with different verbosity levels
python -m pytest python/composio/integration_test/ -q  # Quiet
python -m pytest python/composio/integration_test/ -v  # Verbose
python -m pytest python/composio/integration_test/ -s  # Show print statements
```

#### Run Specific Test Suites
```bash
# MCP functionality tests
python -m pytest python/composio/integration_test/test_experimental_mcp.py -v

# ToolRouter tests
python -m pytest python/composio/integration_test/test_tool_router.py -v

# Non-auth toolkit tests
python -m pytest python/composio/integration_test/test_mcp_no_auth_toolkits.py -v
```

#### Run Specific Test Classes
```bash
# MCP test classes
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestExperimentalMCPStructure -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPOperations -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPErrorHandling -v
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPRealWorldScenarios -v

# ToolRouter test classes
python -m pytest python/composio/integration_test/test_tool_router.py::TestToolRouterStructure -v
python -m pytest python/composio/integration_test/test_tool_router.py::TestToolRouterOperations -v
python -m pytest python/composio/integration_test/test_tool_router.py::TestToolRouterErrorHandling -v
```

### Using Direct Python Execution
```bash
# Run MCP non-auth toolkit tests directly
cd /Users/equinox/composio
python python/composio/integration_test/test_mcp_no_auth_toolkits.py
```

## Test Coverage

### 1. MCP (Model Context Protocol) Tests (`test_experimental_mcp.py`)

#### **API Structure Validation**
- Verifies MCP namespace exists at top level (moved from experimental)
- Checks all required methods are available
- Validates TypeScript API compatibility

#### **MCP Operations**
- `list()` - List existing MCP configurations with pagination and filtering
- `create()` - Create new MCP configurations with various toolkit formats
- `generate()` - Generate MCP server instances for users
- Server instance structure validation

#### **Configuration Management**
- String toolkit format support (`['composio_search', 'text_to_pdf']`)
- Mixed toolkit formats (strings and objects)
- Non-auth toolkit handling
- Manual connection management options

#### **Error Handling**
- Invalid configuration IDs
- Invalid toolkit configurations
- Empty toolkit lists
- Parameter validation

#### **Real API Integration**
- Uses actual Composio API endpoints
- Tests with real MCP configurations
- Validates API responses and structures

### 2. ToolRouter Tests (`test_tool_router.py`)

#### **Structure Validation**
- Verifies experimental.tool_router namespace exists
- Checks required methods availability

#### **Session Operations**
- `create_session()` - Create ToolRouter sessions with various configurations
- String toolkit format support
- Mixed toolkit formats
- Minimal parameter sessions

#### **Error Handling**
- Empty user ID validation
- Parameter validation

#### **Real-World Scenarios**
- Complete session workflow testing
- Session URL and ID validation
- Non-auth toolkit integration

### 3. Non-Auth Toolkit Tests (`test_mcp_no_auth_toolkits.py`)

#### **MCP Server Creation**
- Tests with `composio_search` and `text_to_pdf` toolkits
- String-based toolkit configuration
- Server instance generation

#### **Connectivity Testing**
- MCP URL accessibility validation
- SSE (Server-Sent Events) endpoint testing
- Basic HTTP connectivity checks

#### **API Methods**
- Direct `generate()` method testing
- Server instance structure validation
- Tool availability verification

## Test Results and Output

The test suites provide detailed output including:
- ✅ Passed tests count
- ❌ Failed tests count  
- 🐛 Detailed error messages
- 📈 Success rate percentage
- 🔧 Real-time test progress

### Example Pytest Output

```bash
$ python -m pytest python/composio/integration_test/ -v

========================== test session starts ==========================
platform darwin -- Python 3.11.0, pytest-7.4.0
collected 19 items

python/composio/integration_test/test_experimental_mcp.py::TestExperimentalMCPStructure::test_mcp_namespace_exists PASSED
python/composio/integration_test/test_experimental_mcp.py::TestExperimentalMCPStructure::test_mcp_moved_from_experimental PASSED
python/composio/integration_test/test_experimental_mcp.py::TestMCPOperations::test_list_mcp_configs PASSED
python/composio/integration_test/test_experimental_mcp.py::TestMCPOperations::test_create_mcp_config PASSED
python/composio/integration_test/test_tool_router.py::TestToolRouterStructure::test_experimental_tool_router_exists PASSED
python/composio/integration_test/test_tool_router.py::TestToolRouterOperations::test_create_session_with_string_toolkits PASSED

========================== 19 passed in 15.23s ==========================
```

### Example Direct Execution Output

```bash
$ python python/composio/integration_test/test_mcp_no_auth_toolkits.py

🎯 MCP Non-Auth Toolkits Test
Testing composio_search and text_to_pdf toolkits

🔧 Testing MCP with Non-Auth Toolkits
==================================================
✅ Composio client initialized
🚀 Creating MCP server: no-auth-test-123456
✅ MCP server created successfully!
   Server ID: mcp_abc123
   Server Name: no-auth-test-123456
   Toolkits: ['composio_search', 'text_to_pdf']

🔗 Generating server instance for user: test_user_no_auth_123
✅ Server instance generated successfully!
   Instance ID: inst_xyz789
   Instance Type: streamable_http
   Instance URL: https://mcp.composio.dev/stream/inst_xyz789
   User ID: test_user_no_auth_123

🎉 All tests passed! MCP is working with non-auth toolkits.
```

## Prerequisites

### 1. Environment Setup
```bash
# Set required API key
export COMPOSIO_API_KEY="your_api_key_here"

# Install Composio SDK in development mode (if testing local changes)
cd /Users/equinox/composio/python
pip install -e .
```

### 2. Dependencies
- Python 3.10+
- pytest (for structured testing)
- requests (for HTTP connectivity tests)
- Valid Composio API key

### 3. Optional Requirements
- **Auth configurations** - Some tests can create MCP configs with auth if available
- **Network access** - For testing MCP server connectivity

## Test Configuration

### Pytest Configuration (`pytest.ini`)
- Test discovery patterns
- Output formatting
- Default verbosity settings

### Shared Fixtures (`conftest.py`)
- Composio client initialization
- Auth configuration discovery
- Test data generation
- Environment setup

## Notes and Best Practices

### Test Design Principles
- **Non-destructive**: Tests don't interfere with existing configurations
- **Isolated**: Each test can run independently
- **Real API**: Uses actual Composio endpoints (no mocking)
- **Cleanup**: Test resources are tracked and cleaned up

### Debugging Tips
```bash
# Run with maximum verbosity and show print statements
python -m pytest python/composio/integration_test/ -vvv -s

# Run specific failing test
python -m pytest python/composio/integration_test/test_experimental_mcp.py::TestMCPOperations::test_create_mcp_config -vvv -s

# Stop on first failure
python -m pytest python/composio/integration_test/ -x
```

### Common Issues
1. **Missing API Key**: Ensure `COMPOSIO_API_KEY` is set
2. **Network Issues**: Check internet connectivity for API calls
3. **Rate Limits**: Space out test runs if hitting API limits
4. **Stale Configs**: Clean up test configurations if needed

### Contributing
When adding new integration tests:
1. Follow the existing test structure and naming conventions
2. Use appropriate fixtures from `conftest.py`
3. Include both positive and negative test cases
4. Add proper error handling and cleanup
5. Update this README with new test coverage
