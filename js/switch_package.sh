echo "Switching package name: Dev track will publish to npm as composio-dev-trac will publish to npm as composio-core"
echo "Is this the dev track? (yes/no)"
read dev_track

if [ "$dev_track" = "yes" ]; then
  sed -i.bak 's/"name": ".*"/"name": "composio-dev-track"/' package.json && rm package.json.bak
  sed -i.bak 's/"name": ".*"/"name": "composio-dev-track"/' package.dist.json && rm package.dist.json.bak
  echo "Package name changed to composio-dev-track"
else
  sed -i.bak 's/"name": ".*"/"name": "composio-core"/' package.json && rm package.json.bak
  sed -i.bak 's/"name": ".*"/"name": "composio-core"/' package.dist.json && rm package.dist.json.bak
  echo "Package name changed to composio-core"
fi
