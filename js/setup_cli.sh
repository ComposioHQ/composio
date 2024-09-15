cp src/constants.js lib/src/constants.js

# mv lib/src/cli/index.js lib/src/cli/index
cat <<EOF > temp_file
#!/usr/bin/env node
$(cat lib/src/cli/index.js)
EOF
mv temp_file lib/src/cli/index

rm lib/src/cli/index.js


