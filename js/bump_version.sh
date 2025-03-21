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
sed -i.bak "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" package.dist.json && rm package.dist.json.bak

# Update version in package.json  
sed -i.bak "s/\"version\": \"$current_version_pkg\"/\"version\": \"$new_version\"/" package.json && rm package.json.bak

echo "Updating version in src/constants.js"
# Update version in src/constants.js
sed -i.bak "s/COMPOSIO_VERSION = \`$current_version\`/COMPOSIO_VERSION = \`$new_version\`/" src/constants.js && rm src/constants.js.bak

sed -i.bak "s/COMPOSIO_VERSION = \`$current_version\`/COMPOSIO_VERSION = \`$new_version\`/" src/constants.ts && rm src/constants.ts.bak

echo "Version updated from $current_version to $new_version in package.dist.json"
echo "Version updated from $current_version_pkg to $new_version in package.json"
