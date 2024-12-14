#!/bin/bash

# Get the current version from package.dist.json and package.json
current_version=$(grep '"version":' package.dist.json | cut -d'"' -f4)
current_version_pkg=$(grep '"version":' package.json | cut -d'"' -f4)

# Get new version from argument or prompt user
if [ -z "$1" ]; then
  echo "Current version in package.dist.json is: $current_version"
  echo "Current version in package.json is: $current_version_pkg" 
  echo "Enter new version:"
  read new_version
else
  new_version=$1
fi

# Update version in package.dist.json
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" package.dist.json

# Update version in package.json
sed -i '' "s/\"version\": \"$current_version_pkg\"/\"version\": \"$new_version\"/" package.json

# Update version in src/constants.js
sed -i '' "s/COMPOSIO_VERSION = \`$current_version\`/COMPOSIO_VERSION = \`$new_version\`/" src/constants.js

echo "Version updated from $current_version to $new_version in package.dist.json"
echo "Version updated from $current_version_pkg to $new_version in package.json"
