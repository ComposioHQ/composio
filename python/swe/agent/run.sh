#! /bin/bash

instances_unresolved=(
"django__django-13933"
"django__django-14053"
"django__django-14089"
"django__django-14238"
"django__django-14349"
"django__django-14373"
"django__django-14434"
"django__django-14493"
"django__django-14500"
"django__django-14539"
"django__django-14559"
"django__django-14752"
"django__django-14765"
"django__django-14787"
"django__django-14855"
"django__django-14915"
"django__django-14999"
"django__django-15103"
"django__django-15104"
"django__django-15128"
"django__django-15277"
"django__django-15278"
"django__django-15315"
"django__django-15368"
"django__django-15380"
"django__django-15467"
"django__django-15499"
"django__django-15561"
"django__django-15572"
"django__django-15731"
"django__django-15732"
"django__django-15741"
"django__django-15863"
"django__django-15930"
"django__django-16116"
"django__django-16139"
"django__django-16145"
"django__django-16255"
"django__django-16333"
"django__django-16429"
"django__django-16485"
"django__django-16493"
"django__django-16527"
"django__django-16569"
"django__django-16595"
"django__django-16642"
"django__django-16661"
"django__django-16662"
"django__django-16801"
"django__django-16819"
"django__django-16899"
"django__django-16901"
"django__django-17029"
)

instances=("${instances_unresolved[@]}")

echo "Instances: ${instances[*]}"
echo "Number of instances: ${#instances[@]}"
# exit
instances_string=$(IFS=,; echo "${instances[*]}")

run_instance() {
    local instance=$1
    local run_id=$2
    LANGCHAIN_PROJECT=$instance python benchmark.py --test-instance-ids $instance --run-id $run_id
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