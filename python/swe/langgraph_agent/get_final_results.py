import json
import os
import glob
import argparse

def get_default_dir():
    return sorted(os.listdir("./logs/run_evaluation"))[-1]

if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", type=str, default=get_default_dir())
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
    final_report["image_build_error"] = list(set(os.listdir(f"./logs/run_evaluation/{args.run_id}/composio/")) - set(final_report["patch_exists"]) - set(final_report["patch_is_None"]))
    for k, v in final_report.items():
        final_report[k] = sorted(list(v))
    with open(f"./composio.{args.run_id}.json", "w") as f:
        json.dump(final_report, f, indent=4)
        print(json.dumps(final_report, indent=4))
    
    
