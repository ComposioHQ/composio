#! /bin/bash

bash secret.sh

instances_unresolved=(

# "astropy__astropy-13236"   # test command
# "astropy__astropy-14539"   # test command

# "scikit-learn__scikit-learn-25232"   # test command taking a lot of time.

# "sphinx-doc__sphinx-7440"
# "sphinx-doc__sphinx-7454"
# "sphinx-doc__sphinx-7757"
# "sphinx-doc__sphinx-7889"
# "sphinx-doc__sphinx-7985"
# "sphinx-doc__sphinx-8120"
# "sphinx-doc__sphinx-8269"
# "sphinx-doc__sphinx-8459"
"sphinx-doc__sphinx-8475"
"sphinx-doc__sphinx-8548"
"sphinx-doc__sphinx-8551"
"sphinx-doc__sphinx-8593"
"sphinx-doc__sphinx-8621"
"sphinx-doc__sphinx-8638"
"sphinx-doc__sphinx-9229"
"sphinx-doc__sphinx-9258"
"sphinx-doc__sphinx-9591"
)
instances_resolved=(
)

instances_left=()

# for dir in ../test_sphinx/*/; do
#     dir=${dir%*/}  # remove trailing slash
#     dir=${dir##*/}  # get only the directory name
#     instances_left+=("$dir")
# done

# Create a new array with elements from instances_left that are not in instances_resolved
instances=()
for instance in "${instances_left[@]}"; do
    if [[ ! " ${instances_resolved[*]} " =~ " ${instance} " ]]; then
        instances+=("$instance")
    fi
done

# instances=("${instances[@]:62}")
# Combine with instances_unresolved
# instances=("${instances_unresolved[@]}"  "${instances[@]:21}")
instances=("${instances_unresolved[@]}")

echo "Instances: ${instances[*]}"
echo "Number of instances: ${#instances[@]}"
# exit
instances_string=$(IFS=,; echo "${instances[*]}")

run_instance() {
    local instance=$1
    local run_id=$2
    LANGCHAIN_PROJECT=$instance python benchmark_copy.py --test-instance-ids $instance --run-id $run_id
}

# Set the number of instances to run in parallel
k=1
run_id="langgraph_agent_$(date +%s%N)"
echo "Run ID: $run_id"
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