# cp src/constants.js dist/cli/constants.js
cp src/constants.js dist/constants.js
cat <<EOF > temp_file
#!/usr/bin/env node
$(cat dist/cli/index.js)
EOF
mv temp_file dist/cli/index

rm dist/cli/index.js

node scripts/replace-type.js

cp package.dist.json dist/package.json
cp README.md dist/README.md
