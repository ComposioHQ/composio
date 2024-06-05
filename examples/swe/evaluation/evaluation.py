import os
import json
import glob
import argparse
import traceback
from swebench import run_evaluation, get_model_report

SUBMIT_PATCH_CMD = "submit_patch"


def find_patch(prediction_data):
    # Iterate through each action in the prediction data
    for action in prediction_data:
        # Parse the 'agent_action' field which contains JSON string
        agent_action = json.loads(action['agent_action'])
        # Check if the action type is 'AgentAction' and contains a 'tool' that might indicate a patch submission
        if agent_action['type'] == 'AgentAction' and SUBMIT_PATCH_CMD in agent_action['tool']:
            # Assuming the patch or relevant output is in 'tool_output'
            return action['tool_output']
    return None


def main(predictions_dir, log_dir, swe_bench_tasks, testbed, skip_existing, timeout, verbose, conda_link, log_suffix, num_processes):
    # Assuming the directory structure and file naming is correct
    directory_name = os.path.basename(predictions_dir)
    pred_path_temp = os.path.join(predictions_dir, "filtered_predictions.jsonl")
    all_patches = []
    # Walk through the directory and process each file
    pred_total, pred_will_eval = 0, 0
    for file_path in glob.glob(os.path.join(predictions_dir, "*_instance_*")):
        instance_id = file_path.split('_instance_')[-1].replace(".json", "")
        with open(file_path, "r") as f:
            prediction_data = json.loads(f.read())
        if len(prediction_data) == 0:
            print(f"Skipping {file_path} because it has no predictions")
            continue

        patch_found = find_patch(prediction_data)
        if not patch_found:
            print(f"Skipping {file_path} because no patch was found")
            continue
        transformed_prediction = {
                            "instance_id": instance_id,
                            "model": directory_name,
                            "prediction": patch_found
                        }
        all_patches.append(transformed_prediction)
        pred_will_eval += 1
    with open(pred_path_temp, "w") as f_out:
        for patch in all_patches:
            json.dump(patch, f_out)
            f_out.write("\n")

    print(f"Found {pred_total} total predictions, will evaluate {pred_will_eval} ({pred_total-pred_will_eval} are empty)")

    # Run evaluation
    try:
        print("🏃 Beginning evaluation...")
        run_evaluation(
            predictions_path=pred_path_temp,
            log_dir=log_dir,
            swe_bench_tasks=swe_bench_tasks,
            testbed=testbed,
            skip_existing=skip_existing,
            timeout=timeout,
            verbose=verbose,
            conda_link=conda_link,
            log_suffix=log_suffix,
            num_processes=num_processes
        )
        print("✅ Finished evaluation")
    except Exception as e:
        print(f"❌ Evaluation failed: {e}\n{traceback.format_exc()}")

    # Clean up temporary files
    os.remove(pred_path_temp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions_dir", type=str, required=True, help="Directory containing prediction files")
    parser.add_argument("--log_dir", type=str, required=True, help="Path to log directory")
    parser.add_argument("--swe_bench_tasks", type=str, required=True, help="Path to SWE-bench task instances file")
    parser.add_argument("--testbed", type=str, required=True, help="Path to testbed directory")
    parser.add_argument("--skip_existing", action="store_true", help="(Optional) Skip existing logs")
    parser.add_argument("--timeout", type=int, default=900, help="(Optional) Timeout in seconds")
    parser.add_argument("--verbose", action="store_true", help="(Optional) Verbose mode")
    parser.add_argument("--log_suffix", type=str, help="(Optional) Log suffix")
    parser.add_argument("--num_processes", type=int, default=-1, help="Num processes")
    args = parser.parse_args()
    main(**vars(args))
