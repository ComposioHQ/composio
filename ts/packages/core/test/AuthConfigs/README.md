# AuthConfigs Test Suite

This directory contains comprehensive unit tests for the `AuthConfigs` class in the Composio SDK.

## Test Coverage

The test suite covers all public methods and functionality of the `AuthConfigs` class:

### Core Methods

- **Constructor**: Tests instance creation and client injection
- **list()**: Tests listing auth configs with and without query parameters
- **create()**: Tests creating both custom and Composio-managed auth configs
- **get()**: Tests retrieving auth configs by ID
- **update()**: Tests updating auth configs with different types (custom/default)
- **delete()**: Tests deleting auth configs
- **updateStatus()**: Tests enabling/disabling auth configs
- **enable()**: Tests enabling auth configs (convenience method)
- **disable()**: Tests disabling auth configs (convenience method)

### Private Methods

- **parseAuthConfigRetrieveResponse()**: Tests the internal response transformation logic

### Error Handling

- Validation errors for invalid input parameters
- API errors and network failures
- Malformed API responses
- Schema validation failures

### Edge Cases

- Minimal auth config data
- Large credential objects
- Very long scope strings
- Empty list responses
- Optional field handling

## Test Structure

The tests follow the established patterns in the codebase:

1. **Mocking**: Uses Vitest mocks for the ComposioClient
2. **Data**: Comprehensive mock data that matches the API schema
3. **Assertions**: Tests both successful operations and error conditions
4. **TypeScript**: Proper typing with `@ts-expect-error` for intentional test violations

## Mock Data

The test suite includes:

- `mockComposioAuthConfigResponse`: Complete API response data
- `mockTransformedAuthConfigResponse`: Expected SDK format data
- `mockClient`: Mocked ComposioClient with all auth config methods

## Running Tests

```bash
# Run all AuthConfigs tests
npm test test/AuthConfigs/authConfigs.test.ts

# Run with coverage
npm run test:coverage test/AuthConfigs/authConfigs.test.ts
```

## Test Patterns

The tests demonstrate several important patterns:

1. **Schema Validation**: Testing Zod schema validation for both input and output
2. **Error Propagation**: Ensuring ValidationErrors are properly thrown and handled
3. **API Transformation**: Testing the conversion between API and SDK formats
4. **Mock Isolation**: Each test is isolated with proper mock cleanup
5. **Type Safety**: Using TypeScript to catch type-related issues

## Coverage

The test suite achieves comprehensive coverage of:

- ✅ All public methods
- ✅ All error paths
- ✅ Input validation
- ✅ Response transformation
- ✅ Edge cases and boundary conditions
