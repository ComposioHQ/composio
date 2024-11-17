import argparse
import json
import os
from pathlib import Path

from swebench import (
    KEY_INSTANCE_ID,
    KEY_PREDICTION,
    get_eval_refs,
    get_eval_report,
    get_logs_eval,
    get_model_report,
    get_resolution_status,
)
from swebench.harness.constants import INSTALL_FAIL
from unidiff import PatchSet

from composio.utils.logging import get as get_logger


MODEL_GPT4 = "gpt-4-1106"
PATH_SWE_BENCH_ISSUES = "swe_bench_issues.jsonl"
PATH_PATCHES_JSON = "patches.json"
PATH_TESTBED = "testbed/"
EVAL_REFS_JSON_PATH = "eval_refs.jsonl"
SCORECARDS_JSON_PATH = "scorecards.json"
RESULTS_JSON_PATH = "results.json"

logger = get_logger(name="get_cur_eval_refs")


def format_report(report):
    new_report = {}
    for key in report:
        val = report[key]
        new_report[key] = {}
        for sub_key in val:
            sub_val = "".join(val[sub_key])
            val[sub_key] = sub_val
    return report


def get_cur_eval_refs(predictions_dir, swe_bench_path):
    logger.info(
        f"Getting eval refs for predictions_dir: {predictions_dir} and swe_bench_path: {swe_bench_path}"
    )
    eval_refs = get_eval_refs(str(swe_bench_path))
    eval_refs_json_path = predictions_dir / Path(EVAL_REFS_JSON_PATH)
    with open(eval_refs_json_path, "w", encoding="utf-8") as f:
        for key in eval_refs:
            f.write(json.dumps(eval_refs[key]))
            f.write("\n")
    return eval_refs, eval_refs_json_path


def save_summaries_to_file(predictions_dir, predictions_path, log_dir, scorecards):
    path_scorecards = os.path.join(predictions_dir, SCORECARDS_JSON_PATH)
    with open(path_scorecards, "w", encoding="utf-8") as f:
        json.dump(scorecards, fp=f, indent=2)
    logger.info("- Wrote per-instance scorecards to: %s", path_scorecards)

    # Get results and write to file
    eval_refs_json_path = predictions_dir / Path(EVAL_REFS_JSON_PATH)
    logger.info("Reference Report:")
    report = get_model_report(
        MODEL_GPT4, str(predictions_path), str(eval_refs_json_path), str(log_dir)
    )
    for k, v in report.items():
        logger.info("- %s: %s", k, len(v))

    results_path = predictions_dir / Path(RESULTS_JSON_PATH)
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    logger.info("- Wrote summary of run to: %s", results_path)


def generate_scorecard(predictions_dir, log_dir, swe_bench_path, model):
    logger.info("Starting main function")
    eval_refs, _ = get_cur_eval_refs(predictions_dir, swe_bench_path)
    predictions_path = predictions_dir / Path(PATH_PATCHES_JSON)
    logger.debug("Predictions path: %s", predictions_path)

    # Get predictions, define log_dir
    # Iterate over each file in the directory
    with open(predictions_path, encoding="utf-8") as f:
        predictions = json.loads(f.read())
    scorecards = []
    for p in predictions:
        scorecard = {KEY_INSTANCE_ID: p[KEY_INSTANCE_ID], "statuses": [], "stats": {}}
        # Check that a prediction was generated
        if p[KEY_PREDICTION] is None or p[KEY_PREDICTION].strip() == "":
            scorecard["statuses"].append("not_generated")
            scorecards.append(scorecard)
            logger.info(
                "no prediction_key is found: %s. Skipping...", p[KEY_INSTANCE_ID]
            )
            continue
        scorecard["statuses"].append("generated")

        # Get log file
        log_path = os.path.join(log_dir, f"{p[KEY_INSTANCE_ID]}.{model}.eval.log")

        if not os.path.exists(log_path):
            scorecard["statuses"].append("build_failure")
            scorecards.append(scorecard)
            logger.info("no log file is found: %s. Skipping...", log_path)
            continue

        # Get evaluation logs
        eval_sm, found = get_logs_eval(log_path)

        # Check that the prediction generated
        if not found:
            scorecards.append(scorecard)
            logger.info("no eval_sm is found: %s. Skipping...", log_path)
            continue
        scorecard["statuses"].append("applied")

        with open(log_path, "r", encoding="utf-8") as f:
            log_contents = f.read()
            if INSTALL_FAIL in log_contents:
                scorecard["statuses"].append("install_fail")
        # Get resolution status
        report = get_eval_report(eval_sm, eval_refs[p[KEY_INSTANCE_ID]])
        # report = format_report(report)
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
            scorecard["patch_lines_add"] = sum(f.added for f in diff_obj)
            scorecard["patch_lines_del"] = sum(f.removed for f in diff_obj)
        except Exception as e:
            logger.error(
                "[%s] Error parsing prediction diff: %s", {p[KEY_INSTANCE_ID]}, e
            )
            scorecard["patch_files"] = []
            scorecard["patch_lines_add"] = 0
            scorecard["patch_lines_del"] = 0
        scorecards.append(scorecard)

    # Save to summary, scorecard json
    save_summaries_to_file(predictions_dir, predictions_path, log_dir, scorecards)


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
        "--swe_bench_path", type=str, required=True, help="Path to the swe bench tasks"
    )
    parser.add_argument(
        "--log_dir",
        type=str,
        required=True,
        help="dir where logs are generated after running evaluation",
    )
    args = parser.parse_args()

    script_path = Path(__file__)
    script_dir = script_path.parent
    prediction_path_dir = Path(args.prediction_path_dir)
    testbed_dir = prediction_path_dir / Path(PATH_TESTBED)
    if not os.path.exists(testbed_dir):
        os.makedirs(testbed_dir)
    generate_scorecard(
        predictions_dir=prediction_path_dir,
        log_dir=str(args.log_dir),
        swe_bench_path=args.swe_bench_path,
        model=MODEL_GPT4,
    )
