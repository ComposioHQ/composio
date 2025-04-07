#!/bin/bash

# Exit on any error
set -e

# Define the OpenAPI specification URL and paths
OPENAPI_URL="https://backend.composio.dev/openapi.json"
OPENAPI_V3_URL="https://qa-apollo.composio.dev/api/v3/openapi.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FERN_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$FERN_DIR/api"
TEMP_FILE="/tmp/openapi-temp.json"
TEMP_V3_FILE="/tmp/openapi-v3-temp.json"
OUTPUT_FILE="$API_DIR/openapi.json"
OUTPUT_V3_FILE="$API_DIR/openapi-v3.json"

# Create API directory if it doesn't exist
mkdir -p "$API_DIR"

echo "Pulling latest OpenAPI specification from $OPENAPI_URL"

# Use curl to fetch the OpenAPI specification
if curl -f -o "$TEMP_FILE" "$OPENAPI_URL"; then
    echo "Successfully downloaded OpenAPI specification to temporary file"
else
    echo "Failed to download OpenAPI specification"
    exit 1
fi

# Validate that the file exists and is not empty
if [ -s "$TEMP_FILE" ]; then
    echo "Verified OpenAPI specification file exists and is not empty"
else
    echo "Error: OpenAPI specification file is empty or does not exist"
    exit 1
fi

# Filter out specific paths using jq
echo "Filtering out specified paths from OpenAPI specification"
if command -v jq &> /dev/null; then
    # Remove the path - try both formats since it could be either
    jq 'del(.paths."/api/v1/mcp/servers/validate/uuid") | del(.paths."/api/v1/mcp/servers/validate/{uuid}")' "$TEMP_FILE" > "$OUTPUT_FILE"
    echo "Successfully filtered OpenAPI specification and saved to $OUTPUT_FILE"
else
    echo "Warning: jq is not installed. Cannot filter paths."
    echo "Please install jq with: brew install jq"
    # Copy unfiltered file as fallback
    cp "$TEMP_FILE" "$OUTPUT_FILE"
fi

# Fetch the OpenAPI v3 specification
echo "Pulling latest OpenAPI v3 specification from $OPENAPI_V3_URL"
if curl -f -o "$TEMP_V3_FILE" "$OPENAPI_V3_URL"; then
    echo "Successfully downloaded OpenAPI v3 specification to temporary file"
else
    echo "Failed to download OpenAPI v3 specification"
    exit 1
fi

# Validate that the v3 file exists and is not empty
if [ -s "$TEMP_V3_FILE" ]; then
    echo "Verified OpenAPI v3 specification file exists and is not empty"
else
    echo "Error: OpenAPI v3 specification file is empty or does not exist"
    exit 1
fi

# Filter the v3 spec using jq
if command -v jq &> /dev/null; then
    # Remove the path - try both formats since it could be either
    jq 'del(.paths."/api/v1/mcp/servers/validate/uuid") | del(.paths."/api/v1/mcp/servers/validate/{uuid}")' "$TEMP_V3_FILE" > "$OUTPUT_V3_FILE"
    echo "Successfully filtered OpenAPI v3 specification and saved to $OUTPUT_V3_FILE"
else
    # Copy unfiltered file as fallback
    cp "$TEMP_V3_FILE" "$OUTPUT_V3_FILE"
fi

# Clean up temporary files
rm "$TEMP_FILE" "$TEMP_V3_FILE"

echo "OpenAPI specifications successfully updated"
