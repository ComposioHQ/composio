#! /bin/bash
export COMPOSIO_LOGGING_LEVEL=DEBUG
export TOKENIZERS_PARALLELISM=false

export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"export WORKSPACE_WAIT_TIMEOUT=300

instances_unresolved=(
#     "django__django-13821"
#     "django__django-16493"
#     "django__django-15572"
#     "django__django-12419"
#     "django__django-12039"
#     "django__django-14238"
#     "django__django-15368"
#     "django__django-11603"
#     "django__django-11292"
#     "django__django-11999"
#     "django__django-15467"
#     "django__django-15732"
#     "django__django-16661"
#     "django__django-13363"
#     "django__django-12741"
#     "django__django-16899"
#     "django__django-14787"
#     "django__django-13807"
#     "django__django-15103"
#     "django__django-11490"
#     "django__django-11179"
#     "django__django-13810"
#     "django__django-13279"
#     "django__django-13012"
#     "django__django-13569"
#     "django__django-11749"
#     "django__django-16116"
#     "django__django-15561"
#     "django__django-14999"
#     "django__django-14915"
#     "django__django-14349"
#     "django__django-15731"
#     "django__django-15930"
#     "django__django-11880"
#     "django__django-15277"
#     "django__django-14765"
#     "django__django-11066"
#     "django__django-11099"
#     "django__django-12143"
#     "django__django-13109"
#     "django__django-12708"
#     "django__django-11951"
#     "django__django-11790"
#     "django__django-16569"
#     "django__django-13933"
#     "django__django-14053"
#     "django__django-13089"
#     "django__django-14559"
#     "django__django-10880"
#     "django__django-13551"
#     "django__django-13410"
#     "django__django-12713"
#     "django__django-13658"
#     "django__django-12276"
#     "django__django-11141"
#     "django__django-14373"
#     "django__django-16662"
#     "django__django-17029"
#     "django__django-12050"
#     "django__django-11133"
#     "django__django-16642"
#     "django__django-11433"
#     "django__django-13401"
#     "django__django-14493"
#     "django__django-16255"
#     "django__django-11119"
#     "django__django-15104"
#     "django__django-13516"
#     "django__django-16801"
#     "django__django-16145"
#     "django__django-16595"
#     "django__django-14752"
#     "django__django-15863"
#     "django__django-14855"
#     "django__django-13837"
#     "django__django-13590"
#     "django__django-9296"
#     "django__django-12308"
#     "django__django-13417"
#     "django__django-16819"
#     "django__django-11163"
#     "django__django-11095"
#     "django__django-12262"
#     "django__django-11555"
#     "django__django-15315"
#     "django__django-11964"
#     "django__django-16527"
#     "django__django-13023"
#     "django__django-15741"
#     "django__django-15278"
#     "django__django-13315"
#     "django__django-14089"
#     "django__django-10973"
#     "django__django-15128"
#     "django__django-13820"
#     "django__django-11551"
#     "django__django-16429"
#     "django__django-16901"
#     "django__django-14500"
#     "django__django-11451"
    "psf__requests-1766"    
)
instances_resolved=(
)

instances_left=()
for dir in ../test_requests/*/; do
    dir=${dir%*/}  # remove trailing slash
    dir=${dir##*/}  # get only the directory name
    instances_left+=("$dir")
done




# Create a new array with elements from instances_left that are not in instances_resolved
instances=()
for instance in "${instances_left[@]}"; do
    if [[ ! " ${instances_resolved[*]} " =~ " ${instance} " ]]; then
        instances+=("$instance")
    fi
done

# instances=("${instances[@]:62}")
# Combine with instances_unresolved
instances=("${instances[@]:4}" "${instances_unresolved[@]}" )
# instances=("${instances_unresolved[@]}")

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