import json
import os
import traceback
from codecs import decode, encode
from pathlib import Path

from datasets import load_dataset
from swebench import KEY_INSTANCE_ID, KEY_MODEL, KEY_PREDICTION, run_evaluation


SUBMIT_PATCH_CMD = "submitpatchtool_submitpatch"


def download_and_store_dataset(dataset_name, output_file):
    test_dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="test[23:33]")
    # Assuming the dataset is a single dataset, not a dataset dictionary
    with open(output_file, "w") as file:
        for item in test_dataset:  # Adjust the split if necessary
            json.dump(item, file)
            file.write("\n")


def get_dataset():
    test_dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="test[23:33]")
    return test_dataset


def find_patch(prediction_data):
    # Iterate through each action in the prediction data
    for action in prediction_data:
        if action["agent_action"] == "agent_finish":
            agent_action = "agent_finish"
            agent_output = action["agent_output"]
        else:
            # Parse the 'agent_action' field which contains JSON string
            agent_action = json.loads(action["agent_action"])
            # Check if the action type is 'AgentAction' and contains a 'tool' that might indicate a patch submission
            if agent_action["tool"] == SUBMIT_PATCH_CMD:
                # Assuming the patch or relevant output is in 'tool_output'
                patch = action.get("tool_output")
                patch = patch.replace("patch_code=", "")
                patch_formatted = decode(
                    encode(patch, "latin-1", "backslashreplace"), "unicode-escape"
                )
                patch_formatted = patch_formatted.replace("'", "")
                return patch_formatted
    return None


def main(
    predictions_path, log_dir, testbed, skip_existing, timeout, verbose, num_processes
):
    # Assuming the directory structure and file naming is correct
    model = "gpt-4-1106"
    all_patches = []
    predictions_dir = predictions_path.parent
    pred_path_temp = predictions_dir / Path("patches.jsonl")
    swe_bench_path = predictions_dir / Path("swe_bench_issues.jsonl")
    download_and_store_dataset("", swe_bench_path)
    # Walk through the directory and process each file
    pred_total, pred_will_eval = 0, 0
    with open(predictions_path, "r") as f:
        agent_logs = json.loads(f.read())
    for issue_id in agent_logs:
        instance_id = issue_id
        prediction_data = agent_logs[instance_id]
        pred_total += 1
        if len(prediction_data) == 0:
            print(
                f"Skipping {issue_id} because it has no predictions in path: {predictions_path}"
            )
            continue

        patch_found = find_patch(prediction_data)
        if not patch_found:
            print(
                f"Skipping {issue_id} because no patch was found in path: {predictions_path}"
            )
            continue
        transformed_prediction = {
            KEY_INSTANCE_ID: instance_id,
            KEY_MODEL: model,
            KEY_PREDICTION: patch_found,
        }
        all_patches.append(transformed_prediction)
        pred_will_eval += 1
    with open(pred_path_temp, "w") as f_out:
        for patch in all_patches:
            json.dump(patch, f_out)
            f_out.write("\n")

    print(
        f"Found {pred_total} total predictions, will evaluate {pred_will_eval} ({pred_total-pred_will_eval} are empty)"
    )

    # Run evaluation
    try:
        print("🏃 Beginning evaluation...")
        run_evaluation(
            predictions_path=pred_path_temp,
            log_dir=log_dir,
            swe_bench_tasks=str(swe_bench_path),
            testbed=testbed,
            conda_link=None,
            log_suffix="",
            skip_existing=skip_existing,
            timeout=timeout,
            verbose=verbose,
            num_processes=1,
        )
        print("✅ Finished evaluation")
    except Exception as e:
        print(f"❌ Evaluation failed: {e}\n{traceback.format_exc()}")

    # Clean up temporary files
    os.remove(pred_path_temp)


if __name__ == "__main__":
    script_path = Path(__file__)
    script_dir = script_path.parent
    prediction_path = script_dir / Path(
        "task_output_2024-06-07_15-49-41/agent_logs.json"
    )
    testbed_dir = prediction_path.parent / Path("testbed/")
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    main(prediction_path, str(prediction_path.parent), testbed_dir, True, 300, True, 2)
