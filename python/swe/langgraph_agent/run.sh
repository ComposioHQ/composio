#! /bin/bash

export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export COMPOSIO_LOGGING_LEVEL="DEBUG"

# # Create a list of instances here

instances_unresolved=(
    # "django__django-13810" # unresolved
    # "django__django-16255" # unresolved
    # "django__django-16493" # unresolved
    # "sympy__sympy-20801" # unresolved
)
instances_left=()
for dir in ../test/*/; do
    dir=${dir%*/}  # remove trailing slash
    dir=${dir##*/}  # get only the directory name
    instances_left+=("$dir")
done


# concatenate instances_unresolved and instances_left
instances=("${instances_unresolved[@]}" "${instances_left[@]:15}")
echo "Instances: ${instances[*]}"
instances_string=$(IFS=,; echo "${instances[*]}")

for instance in "${instances[@]}"
do
    export LANGCHAIN_PROJECT=$instance
    python benchmark.py --test-instance-ids $instance
done
