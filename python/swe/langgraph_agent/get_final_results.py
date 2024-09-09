import json
import os
import glob
import argparse

if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=str, default="langgraph_agent_1725853467N")
    args = parser.parse_args()

    final_report = {
        "patch_is_None": set(),
        "patch_exists": set(),
        "patch_successfully_applied": set(),
        "resolved": set(),
        "unresolved": set()
    }
    for file in glob.glob(f"./logs/run_evaluation/{args.run_id}/**/report.json", recursive=True):
        report = json.load(open(file, "r"))
        for key, value in report.items():
            for k, v in value.items():
                if v is True:
                    final_report[k].add(key)
    final_report["unresolved"] = list(set(final_report["patch_successfully_applied"]) - set(final_report["resolved"]))
    for k, v in final_report.items():
        final_report[k] = sorted(list(v))
    with open(f"./composio.{args.run_id}.json", "w") as f:
        json.dump(final_report, f, indent=4)
