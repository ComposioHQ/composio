import json
import os
import glob
import argparse
from swebench.harness.utils import load_swebench_dataset
import shutil
from tqdm.auto import tqdm

base_file = "/Users/shrey/Desktop/Composio-dev/composio/python/swe/temp/experiments/evaluation/verified/{method}/results/results.json"
logs_file = "/Users/shrey/Desktop/Composio-dev/composio/python/swe/temp/langgraph_agent/logs/run_evaluation"
composio_coder = "/Users/shrey/.composio_coder/logs/"

instances = load_swebench_dataset(name="princeton-nlp/SWE-bench_Verified")

def get_resolved_unresolved(repo, relevant_runs):
    resolved = set()
    unresolved = set()
    final_folders = {}
    for run in relevant_runs:
        for folder in glob.glob(f"{logs_file}/{run}/composio/*{repo}*"): final_folders[folder.split("/")[-1]] = folder
        for report in glob.glob(f"{logs_file}/{run}/composio/*{repo}*/report.json"):
            folder = report.replace("/report.json", "")
            with open(report, "r") as f:
                data = json.load(f)
                key = next(iter(data))
                
                result = data[key]
                
                if result["patch_exists"]:
                    if result['resolved']:
                        resolved.add(key)
                        final_folders[key] = folder
                        if key in unresolved:
                            unresolved.remove(key)
                            # print(f"Removed {key} from unresolved")
                    else:
                        unresolved.add(key)
                        final_folders[key] = folder
                        if key in resolved:
                            resolved.remove(key)
                            # print(f"Removed {key} from resolved")
    return resolved, unresolved, final_folders

def get_predictions(instance):
    for pred in sorted(list(glob.glob(f"{composio_coder}/**/predictions.json")))[::-1]:
        with open(pred, "r") as f:
            data = json.load(f)
            if len(data) != 1: continue
            if data[0]["instance_id"] == instance:
                print(pred)
                return data[0]["model_patch"]
    return None

def get_instance(pattern=None, version=None):
    instances_list = []
    for instance in instances:
        if pattern and version:
            if pattern in instance["instance_id"] and instance["version"] == version:
                instances_list.append(instance)
        elif pattern and not version:
            if pattern in instance["instance_id"]:
                instances_list.append(instance)
        elif not pattern and version:
            if instance["version"] == version:
                instances_list.append(instance)
        else:
            instances_list.append(instance)
    return sorted(instances_list, key=lambda x: x["instance_id"])

def main(args):
    method = args.method
    start_run_id = args.start_run_id
    end_run_id = args.end_run_id
    if args.repo: repo = args.repo
    else: repo = ""
    filtered_instances = set([x["instance_id"] for x in instances if repo in x["instance_id"]])

    json_file = open(base_file.format(method=method))
    data = json.load(json_file)

    runs = sorted(os.listdir(logs_file))
    start_index = runs.index(start_run_id) if start_run_id in runs else 0
    end_index = runs.index(end_run_id) if end_run_id in runs else len(runs)
    relevant_runs = runs[start_index:end_index]
    resolved, unresolved, final_folders = get_resolved_unresolved(repo, relevant_runs)
    assert len(resolved.intersection(unresolved)) == 0
    for key, folder in final_folders.items():
        if not os.path.exists(f"./temp/langgraph_agent/logs/run_evaluation/langgraph_agent_final/composio/{key}"):
            shutil.copytree(folder, f"./temp/langgraph_agent/logs/run_evaluation/langgraph_agent_final/composio/{key}", dirs_exist_ok=True, ignore_dangling_symlinks=True)
    total = resolved.union(unresolved)

    print("Resolved by us: ", len(resolved))
    print(f"Resolved by {method}: {len(set(data['resolved']) & total)}")
    print(f"Total: {len(total)}\n")
    print(f"Remaining instances:")
    temp = set(filtered_instances) - total
    for t in sorted(temp):
        print(f"\"{t}\"")
    
    print(f"Total number of instances: {len(filtered_instances)}")
    print(f"Total solved by {method}: {len(set(data['resolved']) & set(filtered_instances))}\n")
    print(f"Resolved by {method} but not by us:")
    temp = (set(data['resolved']) & set(total)).difference(resolved)
    for t in sorted(temp):
        print(f"\"{t}\"")
    # print(get_predictions("sphinx-doc__sphinx-7440"))



    

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", type=str, default="20240824_gru")
    parser.add_argument("--start_run_id", type=str, default="langgraph_agent_1726076078N")
    parser.add_argument("--end_run_id", type=str, default="langgraph_agent_final")
    parser.add_argument("--repo", type=str, default="", required=False)
    args = parser.parse_args()
    main(args)

