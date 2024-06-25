import argparse
import json
import os
import traceback
from codecs import decode, encode
from pathlib import Path

from datasets import load_dataset
from swebench import (
    KEY_INSTANCE_ID,
    KEY_MODEL,
    KEY_PREDICTION,
    get_eval_refs,
    get_eval_report,
    get_logs_eval,
    get_model_report,
    get_resolution_status,
    run_evaluation,
)
from swebench.harness.constants import INSTALL_FAIL
from unidiff import PatchSet


SUBMIT_PATCH_CMD = "submitpatchtool_submitpatch"
MODEL_GPT4 = "gpt-4-1106"
PATH_SWE_BENCH_ISSUES = "swe_bench_issues.jsonl"
PATH_PATCHES = "patches.jsonl"
PATH_PATCHES_JSON = "patches.json"
PATH_TESTBED = "testbed/"


def download_and_store_dataset(dataset_name, output_file):
    test_dataset = load_dataset(
        "/home/shubhra/work/composio/swe-data/SWE-bench_Lite/data", split="test[1:50]"
    )
    # Assuming the dataset is a single dataset, not a dataset dictionary
    with open(output_file, "w") as file:
        for item in test_dataset:
            json.dump(item, file)
            file.write("\n")


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
                    print(f"no patch found here for - skipping...")
                    continue
                patch = patch_lines[0]
                patch = patch.replace("patch_code=", "")
                patch_formatted = decode(
                    encode(patch, "latin-1", "backslashreplace"), "unicode-escape"
                )
                patch_formatted = patch_formatted.replace("'", "")
    return patch_formatted


def log_file(f_name):
    if f_name.startswith("agent_logs.json"):
        return True
    return False


def main(
    predictions_dir, log_dir, testbed, skip_existing, timeout, verbose, num_processes
):
    model = MODEL_GPT4
    all_patches = []
    pred_total, pred_will_eval = 0, 0
    swe_bench_path = predictions_dir / Path(PATH_SWE_BENCH_ISSUES)
    download_and_store_dataset("", swe_bench_path)
    pred_path_temp = predictions_dir / Path(PATH_PATCHES)
    pred_path_orig = predictions_dir / Path(PATH_PATCHES_JSON)
    eval_refs = get_eval_refs(str(swe_bench_path))
    for k, v in eval_refs.items():
        eval_refs[k] = {
            key: v[key] for key in [KEY_INSTANCE_ID, "FAIL_TO_PASS", "PASS_TO_PASS"]
        }

    # Iterate over each file in the directory
    for file_name in os.listdir(predictions_dir):
        if not log_file(file_name):
            print(f"skipping file {file_name}")
            continue
        file_path = predictions_dir / Path(file_name)
        with open(file_path, "r") as f:
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
                KEY_MODEL: model,
                KEY_PREDICTION: patch_found,
            }
            all_patches.append(transformed_prediction)
            pred_will_eval += 1

    with open(pred_path_temp, "w") as f_out:
        for patch in all_patches:
            json.dump(patch, f_out)
            f_out.write("\n")
    with open(pred_path_orig, "w") as f_out:
        f_out.write(json.dumps(all_patches))

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

    # Get predictions, define log_dir
    # Iterate over each file in the directory
    with open(pred_path_orig, encoding="utf-8") as f:
        predictions = json.loads(f.read())
    scorecards = []
    for p in predictions:
        scorecard = {KEY_INSTANCE_ID: p[KEY_INSTANCE_ID], "statuses": [], "stats": {}}
        # Check that a prediction was generated
        if p[KEY_PREDICTION] is None or p[KEY_PREDICTION].strip() == "":
            scorecard["statuses"].append("not_generated")
            scorecards.append(scorecard)
            continue
        scorecard["statuses"].append("generated")

        # Get log file
        log_path = os.path.join(
            log_dir, f"{model}/{p[KEY_INSTANCE_ID]}.{model}.eval.log"
        )

        if not os.path.exists(log_path):
            scorecard["statuses"].append("build_failure")
            scorecards.append(scorecard)
            continue

        # Get evaluation logs
        eval_sm, found = get_logs_eval(log_path)

        # Check that the prediction generated
        if not found:
            scorecards.append(scorecard)
            continue
        scorecard["statuses"].append("applied")

        with open(log_path, "r") as f:
            log_contents = f.read()
            if INSTALL_FAIL in log_contents:
                scorecard["statuses"].append("install_fail")
        # Get resolution status
        report = get_eval_report(eval_sm, eval_refs[p[KEY_INSTANCE_ID]])
        scorecard["test_results"] = {
            "failure": {
                "FAIL_TO_PASS": report["FAIL_TO_PASS"]["failure"],
                "PASS_TO_PASS": report["PASS_TO_PASS"]["failure"],
            },
            "success": {
                "FAIL_TO_PASS": report["FAIL_TO_PASS"]["success"],
                "PASS_TO_PASS": report["PASS_TO_PASS"]["success"],
            },
        }
        resolution_status = get_resolution_status(report)
        scorecard["statuses"].append(resolution_status)

        try:
            diff_obj = PatchSet(p[KEY_PREDICTION])
            scorecard["patch_files"] = [
                x.path
                for x in diff_obj.modified_files
                + diff_obj.added_files
                + diff_obj.removed_files
            ]
            scorecard["patch_lines_add"] = sum([f.added for f in diff_obj])
            scorecard["patch_lines_del"] = sum([f.removed for f in diff_obj])
        except Exception as e:
            print(f"[{p[KEY_INSTANCE_ID]}] Error parsing prediction diff: {e}")
            scorecard["patch_files"] = []
            scorecard["patch_lines_add"] = 0
            scorecard["patch_lines_del"] = 0
        scorecards.append(scorecard)

    # Save to summary, scorecard json
    path_scorecards = os.path.join(predictions_dir, "scorecards.json")
    with open(path_scorecards, "w") as f:
        json.dump(scorecards, fp=f, indent=2)
    print(f"- Wrote per-instance scorecards to {path_scorecards}")

    # Get results and write to file
    print(f"Reference Report:")
    report = get_model_report(
        str(predictions_dir), str(pred_path_temp), str(swe_bench_path), str(log_dir)
    )
    for k, v in report.items():
        print(f"- {k}: {len(v)}")

    path_results = os.path.join(predictions_dir, "results.json")
    with open(path_results, "w") as f:
        json.dump(report, f, indent=2)
    print(f"- Wrote summary of run to {path_results}")


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
    prediction_path_dir = Path(args.prediction_path_dir)
    testbed_dir = prediction_path_dir / Path(PATH_TESTBED)
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    main(
        predictions_dir=prediction_path_dir,
        log_dir=str(prediction_path_dir),
        testbed=testbed_dir,
        skip_existing=True,
        timeout=300,
        verbose=True,
        num_processes=6,
    )
