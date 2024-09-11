#! /bin/bash

export COMPOSIO_LOGGING_LEVEL=DEBUG
export TOKENIZERS_PARALLELISM=false

export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"


instances_unresolved=(
    "django__django-13590"
    "django__django-16612"
    "sympy__sympy-24066"
    "scikit-learn__scikit-learn-10297"
)

instances_left=()
for dir in ../test/*/; do
    dir=${dir%*/}  # remove trailing slash
    dir=${dir##*/}  # get only the directory name
    instances_left+=("$dir")
done


# instances=("${instances_unresolved[@]}" "${instances_left[@]:15}")
instances=("${instances_unresolved[@]}")
# instances=("${instances_left[@]}")
echo "Instances: ${instances[*]}"


instances_string=$(IFS=,; echo "${instances[*]}")

run_instance() {
    local instance=$1
    local run_id=$2
    LANGCHAIN_PROJECT=$instance python benchmark.py --test-instance-ids $instance --run-id $run_id
}

# Set the number of instances to run in parallel
k=2
run_id="langgraph_agent_$(date +%s%N)"
# Run instances in parallel, k at a time
for ((i=0; i<${#instances[@]}; i+=k)); do
    # Get up to k instances
    docker rmi $(docker images -f "dangling=true" -q)
    batch=("${instances[@]:i:k}")
    
    # Run the batch in parallel
    for instance in "${batch[@]}"; do
        run_instance "$instance" "$run_id" &
    done
    
    # Wait for all background processes to finish before starting the next batch
    wait
    docker rmi $(docker images -f "dangling=true" -q)
done
