import argparse
import json
import os
import traceback
from codecs import decode, encode
from pathlib import Path

from datasets import load_dataset
from swebench import KEY_INSTANCE_ID, KEY_MODEL, KEY_PREDICTION, run_evaluation


SUBMIT_PATCH_CMD = "submitpatchtool_submitpatch"
MODEL_GPT4 = "gpt-4-1106"
PATH_SWE_BENCH_ISSUES = "swe_bench_issues.jsonl"
PATH_PATCHES = "patches.jsonl"
PATH_TESTBED = "testbed/"


def download_and_store_dataset(dataset_name, output_file):
    test_dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="test[23:28]")
    # Assuming the dataset is a single dataset, not a dataset dictionary
    with open(output_file, "w") as file:
        for item in test_dataset:
            json.dump(item, file)
            file.write("\n")


def find_patch(prediction_data):
    # Iterate through each action in the prediction data
    for action in prediction_data:
        if action["agent_action"] == "agent_finish":
            print(
                f"agent finish action found: agent_finish, output: {action['agent_output']}"
            )
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
    predictions_dir, log_dir, testbed, skip_existing, timeout, verbose, num_processes
):
    model = MODEL_GPT4
    all_patches = []
    pred_total, pred_will_eval = 0, 0
    swe_bench_path = predictions_dir / Path(PATH_SWE_BENCH_ISSUES)
    download_and_store_dataset("", swe_bench_path)
    pred_path_temp = predictions_dir / Path(PATH_PATCHES)

    # Iterate over each file in the directory
    for file_name in os.listdir(predictions_dir):
        if file_name.endswith(".json"):  # Assuming the files are JSON files
            file_path = predictions_dir / Path(file_name)
            with open(file_path, "r") as f:
                agent_logs = json.load(f)
            for issue_id, prediction_data in agent_logs.items():
                pred_total += 1
                if len(prediction_data) == 0:
                    print(
                        f"Skipping {issue_id} because it has no predictions in file: {file_name}"
                    )
                    continue

                patch_found = find_patch(prediction_data)
                if not patch_found:
                    print(
                        f"Skipping {issue_id} because no patch was found in file: {file_name}"
                    )
                    continue
                transformed_prediction = {
                    KEY_INSTANCE_ID: issue_id,
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
            num_processes=num_processes,
        )
        print("✅ Finished evaluation")
    except Exception as e:
        print(f"❌ Evaluation failed: {e}\n{traceback.format_exc()}")

    # Clean up temporary files
    os.remove(pred_path_temp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run predictions and evaluations for software engineering tasks."
    )
    parser.add_argument(
        "--prediction_path_dir",
        type=str,
        required=True,
        help="Path to the directory where predictions are stored.",
    )
    args = parser.parse_args()

    script_path = Path(__file__)
    script_dir = script_path.parent
    prediction_path_dir = Path(
        args.prediction_path_dir
    )
    testbed_dir = prediction_path_dir / Path(PATH_TESTBED)
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    main(predictions_dir=prediction_path_dir, log_dir=str(prediction_path_dir), testbed=testbed_dir, skip_existing=True, timeout=300, verbose=True, num_processes=2)
