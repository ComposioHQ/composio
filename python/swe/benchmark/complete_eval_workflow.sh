#!/bin/bash

# Capture the directory where the script is located
script_dir=$(dirname "$0")
current_dir=$(pwd)

# Set `PYTHONPATH` variable
PYTHONPATH=$(realpath $script_dir/..)

display_usage() {
    echo "+---------------------------------------------------------------+"
    echo "| Complete Evaluation Workflow Script                           |"
    echo "|                                                               |"
    echo "| Usage: ./benchmark/complete_eval_workflow.sh                  |"
    echo "|        <prediction_path_dir> <dataset_path_or_name>           |"
    echo "+---------------------------------------------------------------+"
    echo "|                                                               |"
    echo "| Example: ./benchmark/complete_eval_workflow.sh                |"
    echo "|          /path/to/prediction/dir princeton-nlp/SWE-bench_Lite |"
    echo "+---------------------------------------------------------------+"
}


if [ "$#" -lt 2 ]; then
    display_usage
    exit 1
fi

# Usage: ./complete_eval_workflow.sh <prediction_path_dir> <dataset_path_or_name>
prediction_path_dir=$1  #
dataset_path_or_name=$2
skip_existing=$3 # default to skip_existing = false
action=${4:-all} # Default to running all steps if no specific action is provided
dataset_on_disk_path="$prediction_path_dir/dataset"
predictions_json_path="$prediction_path_dir/patches.json"
log_dir_path="$prediction_path_dir/logs"

banner() {
  echo "+------------------------------------------+"
  printf "| %-40s |\n" "`date`"
  echo "|                                          |"
  printf "|`tput bold` %-40s `tput sgr0`|\n" "$@"
  echo "+------------------------------------------+"
}

# Generate related files
setup_test_bed() {
    set +ex
    banner "Setting up test bed..."
    set -ex
    cd "$script_dir"
    python ./setup_test_bed.py --prediction_path_dir "$prediction_path_dir" --dataset_path_or_name "$dataset_path_or_name"
    cd "$current_dir"
}


run_evaluation() {
    set +ex
    banner "Running patches evaluation on docker-images..."
    set -ex
    cd "$script_dir"
    pip install virtualenv
    # Save current directory and change to home directory
    pushd ~
    OLD_PATH=$PATH

   # Check if the SWE-bench-docker directory already exists
    if [ -d "SWE-bench-docker" ]; then
        echo "SWE-bench-docker already exists, pulling latest changes."
        cd ~/SWE-bench-docker
        git pull
        virtualenv -p python3.11 venv
        source venv/bin/activate
        pip install -e .
    else
        # Clone the SWE-bench-docker repository
        git clone https://github.com/ComposioHQ/SWE-bench-docker.git
        virtualenv -p python3.11 venv
        source venv/bin/activate
        # Navigate into the cloned directory
        cd ~/SWE-bench-docker
        pip install -e .
    fi

    mkdir -p "$log_dir_path"
    # Run the evaluation
     # Conditionally add the --skip_existing flag
    if [ "$skip_existing" = "false" ]; then
          python run_evaluation.py --predictions_path "$predictions_json_path" --log_dir "$log_dir_path" --swe_bench_tasks "$dataset_on_disk_path" --namespace aorwall
    else
          python run_evaluation.py --predictions_path "$predictions_json_path" --log_dir "$log_dir_path" --swe_bench_tasks "$dataset_on_disk_path" --namespace aorwall --skip_existing
    fi
    deactivate
    export PATH=$OLD_PATH
    popd
    cd "$current_dir"
}

generate_score_card() {
    set +ex
    banner "Generating score-cards..."
    set -ex
    cd "$script_dir"
    python ./get_score_card.py --log_dir "$log_dir_path" --prediction_path_dir "$prediction_path_dir" --swe_bench_path "$dataset_on_disk_path"
    cd "$current_dir"
}

main() {
    set -ex
    case "$action" in
        setup)
            setup_test_bed
            ;;
        evaluate)
            setup_test_bed
            run_evaluation
            ;;
        score)
            setup_test_bed
            generate_score_card
            ;;
        all)
            setup_test_bed
            run_evaluation
            generate_score_card
            ;;
        *)
            echo "Invalid action: $action"
            show_usage
            exit 1
            ;;
    esac
}

main
