rm -rf composio
mkdir composio/

cp -r ../../composio/ ./composio/composio
cp -r ../../setup.py ./composio/setup.py
cp -r ../../README.md ./composio/README.md
cp -r ../entrypoint.sh ./entrypoint.sh

e2b template build

rm -rf composio/
rm ./entrypoint.sh