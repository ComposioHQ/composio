set -e

cp -r ../entrypoint.sh ./entrypoint.sh || { echo "Failed to copy entrypoint.sh"; exit 1; }

e2b template build || { echo "Failed to build E2B template"; exit 1; }

rm ./entrypoint.sh || { echo "Failed to remove entrypoint.sh"; exit 1; }
