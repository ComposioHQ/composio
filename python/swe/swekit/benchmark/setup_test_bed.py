import argparse
import json
import os
from codecs import decode, encode
from pathlib import Path

from datasets import load_dataset
from swebench import KEY_INSTANCE_ID, KEY_MODEL, KEY_PREDICTION
from swekit.benchmark.constants import (
    MODEL_GPT4,
    PATH_PATCHES_JSON,
    SUBMIT_PATCH_CMD,
    TEST_SPLIT,
)


def download_and_store_dataset(dataset_path_or_name, path_on_disk):
    test_dataset = load_dataset(dataset_path_or_name, split=f"test{TEST_SPLIT}")
    test_dataset.save_to_disk(path_on_disk)
    # Assuming the dataset is a single dataset, not a dataset dictionary
    # with open(output_file, "w") as file:
    #     for item in test_dataset:
    #         json.dump(item, file)
    #         file.write("\n")


def find_patch(prediction_data):
    # Iterate through each action in the prediction data
    patch_formatted = None
    for action in prediction_data:
        # final_patch action is not added by llm langchain --> added manually to keep track of patch
        if action["agent_action"] == "final_patch":
            patch = action["agent_output"]
            return patch
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
                patch_lines = patch.split("\n")
                if not patch_lines:
                    print("no patch found here for - skipping...")
                    continue
                patch = patch_lines[0]
                patch = patch.replace("patch_code=", "")
                patch_formatted = decode(
                    encode(patch, "latin-1", "backslashreplace"), "unicode-escape"
                )
                patch_formatted = patch_formatted.replace("'", "")
    return patch_formatted


def log_file(f_name):
    if f_name.startswith("agent_logs"):
        return True
    return False


def create_patches_file(predictions_dir, dataset_path_or_name):
    all_patches = []
    pred_total, pred_will_eval = 0, 0
    dataset_on_disk = str(Path(predictions_dir) / Path("dataset"))
    download_and_store_dataset(dataset_path_or_name, dataset_on_disk)
    pred_path_orig = predictions_dir / Path(PATH_PATCHES_JSON)

    # Iterate over each file in the directory
    for file_name in os.listdir(predictions_dir):
        if not log_file(file_name):
            print(f"skipping file {file_name}")
            continue
        file_path = predictions_dir / Path(file_name)
        with open(file_path, "r", encoding="utf-8") as f:
            agent_logs = json.load(f)
        for issue_id, prediction_data in agent_logs.items():
            if issue_id == "123":
                print(f"skipping old log file: {file_name}")
                continue
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
                KEY_MODEL: MODEL_GPT4,
                KEY_PREDICTION: patch_found,
            }
            all_patches.append(transformed_prediction)
            pred_will_eval += 1

    with open(pred_path_orig, "w", encoding="utf-8") as f_out:
        f_out.write(json.dumps(all_patches))

    print(
        f"Found {pred_total} total predictions, will evaluate {pred_will_eval} ({pred_total-pred_will_eval} are empty)"
    )
    return pred_path_orig, dataset_on_disk


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
    parser.add_argument(
        "--dataset_path_or_name",
        type=str,
        default="princeton-nlp/SWE-bench_Lite",
        help="give local path or dataset or name of dataset",
    )
    args = parser.parse_args()

    script_path = Path(__file__)
    script_dir = script_path.parent
    prediction_path_dir = Path(args.prediction_path_dir)
    create_patches_file(
        predictions_dir=prediction_path_dir,
        dataset_path_or_name=args.dataset_path_or_name,
    )
