cp src/constants.js dist/cli/constants.js

# mv lib/src/cli/index.js lib/src/cli/index
cat <<EOF > temp_file
#!/usr/bin/env node
$(cat dist/cli/index.js)
EOF
mv temp_file dist/cli/index

rm dist/cli/index.js


