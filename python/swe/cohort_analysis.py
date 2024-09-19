import json
import os
import glob
import argparse

base_file = "/Users/shrey/Desktop/Composio-dev/composio/python/swe/temp/experiments/evaluation/verified/{method}/results/results.json"
logs_file = "/Users/shrey/Desktop/Composio-dev/composio/python/swe/temp/langgraph_agent/logs/run_evaluation"


def get_resolved_unresolved(repo, relevant_runs):
    resolved = set()
    unresolved = set()
    for run in relevant_runs:
        for report in glob.glob(f"{logs_file}/{run}/composio/*{repo}*/report.json"):
            with open(report, "r") as f:
                data = json.load(f)
                key = next(iter(data))
                result = data[key]
                if result["patch_exists"]:
                    if result['resolved']:
                        resolved.add(key)
                        if key in unresolved:
                            unresolved.remove(key)
                            print(f"Removed {key} from unresolved")
                    else:
                        unresolved.add(key)
                        if key in resolved:
                            resolved.remove(key)
                            print(f"Removed {key} from resolved")

    print("Resolved:", len(resolved))
    return resolved, unresolved

def main(args):
    method = args.method
    start_run_id = args.start_run_id
    end_run_id = args.end_run_id
    repo = args.repo

    json_file = open(base_file.format(method=method))
    data = json.load(json_file)

    runs = sorted(os.listdir(logs_file))
    start_index = runs.index(start_run_id) if start_run_id in runs else 0
    end_index = runs.index(end_run_id) if end_run_id in runs else len(runs)
    relevant_runs = runs[start_index:end_index+1]
    resolved, unresolved = get_resolved_unresolved(repo, relevant_runs)
    total = resolved.union(unresolved)
    print(f"Resolved by {method}: {len(set(data['resolved']) & total)}")
    print(f"Total: {len(total)}")
    # print(f"Resolved by {method} but not by us:", (set(data['resolved']) & set(total)).difference(resolved))



    

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", type=str, default="20240824_gru")
    parser.add_argument("--start_run_id", type=str, default="langgraph_agent_1726121694N")
    parser.add_argument("--end_run_id", type=str, default="langgraph_agent_temp")
    parser.add_argument("--repo", type=str, default="sympy")
    args = parser.parse_args()
    main(args)

