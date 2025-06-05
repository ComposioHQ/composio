#!/bin/bash

# Exit on any error
set -e

# Define the OpenAPI specification URL and paths
OPENAPI_URL="https://hermes.composio.dev/openapi.json"
OPENAPI_V3_URL="https://backend.composio.dev/api/v3/openapi.json"
OPENAPI_MCP_URL="https://mcp.composio.dev/openapi.json"

# Get the directory where the script is located, works in both CI and local environments
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" 2>/dev/null || dirname "$0")" && pwd)"
FERN_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$FERN_DIR/api"
OUTPUT_FILE="$API_DIR/openapi.json"
OUTPUT_V3_FILE="$API_DIR/openapi-v3.json"
OUTPUT_MCP_FILE="$API_DIR/openapi-mcp.json"

# Debug information
echo "Script directory: $SCRIPT_DIR"
echo "Fern directory: $FERN_DIR"
echo "API directory: $API_DIR"

# Create API directory if it doesn't exist
mkdir -p "$API_DIR"

echo "Pulling latest OpenAPI specification from $OPENAPI_URL"

# Use curl to fetch the OpenAPI specification directly to output file
if curl -f -o "$OUTPUT_FILE" "$OPENAPI_URL"; then
    echo "Successfully downloaded OpenAPI specification to $OUTPUT_FILE"
else
    echo "Failed to download OpenAPI specification"
    exit 1
fi

# Validate that the file exists and is not empty
if [ -s "$OUTPUT_FILE" ]; then
    echo "Verified OpenAPI specification file exists and is not empty"
else
    echo "Error: OpenAPI specification file is empty or does not exist"
    exit 1
fi

# Fetch the OpenAPI v3 specification directly to output file
echo "Pulling latest OpenAPI v3 specification from $OPENAPI_V3_URL"
if curl -f -o "$OUTPUT_V3_FILE" "$OPENAPI_V3_URL"; then
    echo "Successfully downloaded OpenAPI v3 specification to $OUTPUT_V3_FILE"
else
    echo "Failed to download OpenAPI v3 specification"
    exit 1
fi

# Validate that the v3 file exists and is not empty
if [ -s "$OUTPUT_V3_FILE" ]; then
    echo "Verified OpenAPI v3 specification file exists and is not empty"
else
    echo "Error: OpenAPI v3 specification file is empty or does not exist"
    exit 1
fi

# Fetch the MCP OpenAPI specification directly to output file
echo "Pulling latest MCP OpenAPI specification from $OPENAPI_MCP_URL"
if curl -f -o "$OUTPUT_MCP_FILE" "$OPENAPI_MCP_URL"; then
    echo "Successfully downloaded MCP OpenAPI specification to $OUTPUT_MCP_FILE"
else
    echo "Failed to download MCP OpenAPI specification"
    exit 1
fi

# Validate that the MCP file exists and is not empty
if [ -s "$OUTPUT_MCP_FILE" ]; then
    echo "Verified MCP OpenAPI specification file exists and is not empty"
else
    echo "Error: MCP OpenAPI specification file is empty or does not exist"
    exit 1
fi

# For debugging
ls -la "$API_DIR"
echo "FERN_DIR=$FERN_DIR"
echo "API_DIR=$API_DIR"

echo "OpenAPI specifications successfully updated"
