#!/bin/bash

# Exit on any error
set -e

# Define the OpenAPI specification URL and paths
OPENAPI_URL="https://backend.composio.dev/openapi.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FERN_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$FERN_DIR/openapi.json"

echo "Pulling latest OpenAPI specification from $OPENAPI_URL"

# Use curl to fetch the OpenAPI specification
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