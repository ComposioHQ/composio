#! /bin/bash
export COMPOSIO_LOGGING_LEVEL=DEBUG
export TOKENIZERS_PARALLELISM=false

export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export WORKSPACE_WAIT_TIMEOUT=300

instances_unresolved=(
    # "django__django-12713" # resolved with "" controversy
    # "django__django-13590" # resolved
    # "django__django-14238" # resolved
    # "django__django-14500" # resolved
    # "django__django-14999" # resolved
    # "django__django-15863"  # resolved
    # "django__django-15930" # resolved
    "django__django-16100"  # unresolved it encapsulated in try except
    "pytest-dev__pytest-5262" # throttling issue
    # "pytest-dev__pytest-7205" # resolved
    "pytest-dev__pytest-7982" # throttling issue
    "scikit-learn__scikit-learn-10908" # unresolved, chose the wrong patch
    "scikit-learn__scikit-learn-13779"
    "scikit-learn__scikit-learn-15100"
    "scikit-learn__scikit-learn-25232"
    "scikit-learn__scikit-learn-26323"
    "sphinx-doc__sphinx-7910"
    "sphinx-doc__sphinx-8595"
    "sphinx-doc__sphinx-9320"
    "sympy__sympy-15349"
    "sympy__sympy-15809"
    "sympy__sympy-18189"
    "sympy__sympy-18763"
    "sympy__sympy-24443"
    "sympy__sympy-24539"
)

instances_left=()
for dir in ../test_0_100/*/; do
    dir=${dir%*/}  # remove trailing slash
    dir=${dir##*/}  # get only the directory name
    instances_left+=("$dir")
done


# instances=("${instances_unresolved[@]}" "${instances_left[@]:15}")
# instances=("${instances_unresolved[@]}")
instances=("${instances_unresolved[@]}")
echo "Instances: ${instances[*]}"


instances_string=$(IFS=,; echo "${instances[*]}")

run_instance() {
    local instance=$1
    local run_id=$2
    LANGCHAIN_PROJECT=$instance python benchmark.py --test-instance-ids $instance --run-id $run_id
}

# Set the number of instances to run in parallel
k=1
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